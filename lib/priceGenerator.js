// Random Stock Price Generator
//
// When the market is open, every few seconds each stock's price will take a
// small random step. Each stock carries a slow trend that will nudge the price the
// same direction for a while before fading and potentially reversing.
// This makes the prices drift grdually up or down instead of in drastic jumps.

// Each tick for each stock:
// trend = trend * decay + random * trendKick (slow moving bias)
// price = price * (1 + trend + random * noise) (bias + small random noise)

// Tracked in the database: current_price, open_price (first price of the trading day),
// day_high, day_low. Every change is also logged in stock_prices.

const { pool, withTransaction } = require("../db");
const { getMarketStatus, marketClock } = require("../middleware/market");

// Settings (all optional in .env)
const TICK_MS = Math.max(1000, Number(process.env.PRICE_TICK_MS) || 5000);
// Multiplies all movement. 1 = realistic day. For demo use 3 to 5 to show changes.
const VOLATILITY = Number(process.env.PRICE_VOLATILITY) || 1;

const TREND_PCT_PER_HOUR = 0.6; // typical trend size, as % of price per hour
const NOISE_PCT_PER_ROOT_HOUR = 0.4; //random jitter, % per square-root-of-hour
const TREND_MEMORY_MIN = 45; // trend fades over roughly this many minutes
const MAX_DAILY_MOVE = 0.1; // price stays within +/-10% of the day's open
const MIN_PRICE = 0.01; // database requires price > 0

// Per-tick values are derived from above settings, so the size of a whole day's
// movement is the same no matter the occurance in ticks.
const HOURS_PER_TICK = TICK_MS / 3_600_000;
const DECAY = Math.exp(-TICK_MS / (TREND_MEMORY_MIN * 60_000));
const TREND_KICK =
  ((VOLATILITY * TREND_PCT_PER_HOUR) / 100) *
  HOURS_PER_TICK *
  Math.sqrt(1 - DECAY * DECAY);
const NOISE =
  ((VOLATILITY * NOISE_PCT_PER_ROOT_HOUR) / 100) * Math.sqrt(HOURS_PER_TICK);

// Standard normal random number.
function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const round2 = (n) => Math.round(n * 100) / 100;

// One step per one stock. 'state' is { price, trend } (price is unrounded) and
// is changed in place. Just math, no database, so it can also be simulated offline.
function stepPrice(state, openPrice) {
  state.trend = state.trend * DECAY + randn() * TREND_KICK;
  let price = state.price * (1 + state.trend + randn() * NOISE);

  const lowest = Math.max(MIN_PRICE, openPrice * (1 - MAX_DAILY_MOVE));
  const highest = openPrice * (1 + MAX_DAILY_MOVE);
  if (price < lowest || price > highest) {
    price = Math.min(highest, Math.max(lowest, price));
    state.trend = 0;
  }
  state.price = price;
  return state;
}

// In-memory only, rebuilt from database after a restart.
const states = new Map();
let running = false;
let timer = null;

function marketIsOpenFor(status) {
  const devOverride =
    process.env.MARKET_ALWAYS_OPEN === "true" &&
    process.env.NODE_ENV !== "production";
  return devOverride || status.open;
}

// One pass over every stock. Returns how many prices changed.
async function tick() {
  if (running) return 0; // never allows two passes to overlap
  running = true;
  try {
    if (!marketIsOpenFor(await getMarketStatus())) return 0;

    const today = marketClock().date;
    const [stocks] = await pool.query(
      `SELECT stock_id, current_price, open_price,
                    DATE_FORMAT(price_date, '%Y-%m-%d') AS price_date
             FROM stocks`,
    );

    let changed = 0;
    for (const s of stocks) {
      const dbPrice = Number(s.current_price);
      const newDay = s.price_date !== today;
      const openPrice = newDay ? dbPrice : Number(s.open_price);

      // Start or restart from saved price if there is no state for stock,
      // or if the saved price is not what was last wrote.
      let state = states.get(s.stock_id);
      if (!state || round2(state.price) !== dbPrice) {
        state = { price: dbPrice, trend: 0 };
        states.set(s.stock_id, state);
      }

      stepPrice(state, openPrice);
      const newPrice = round2(state.price);
      const priceChanged = newPrice !== dbPrice;
      if (!newDay && !priceChanged) continue;

      await withTransaction(async (conn) => {
        if (newDay) {
          await conn.query(
            `UPDATE stocks SET open_price = current_price, day_high = current_price,
                                day_low = current_price, price_date = ? WHERE stock_id = ?`,
            [today, s.stock_id],
          );
        }
        if (priceChanged) {
          await conn.query(
            `UPDATE stocks SET current_price = ?,
                                day_high = GREATEST(day_high, ?), day_low = LEAST(day_low, ?)
                        WHERE stock_id = ?`,
            [newPrice, newPrice, newPrice, s.stock_id],
          );
          await conn.query(
            "INSERT INTO stock_prices (stock_id, price) VALUES (?, ?)",
            [s.stock_id, newPrice],
          );
        }
      });
      if (priceChanged) changed++;
    }
    return changed;
  } catch (err) {
    console.error("Price generator error:", err.message);
    return 0;
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  if (process.env.PRICE_GENERATOR === "off") {
    console.log("Price generator is off (PRICE_GENERTOR=off)");
    return;
  }
  timer = setInterval(tick, TICK_MS);
  console.log(
    `Price generator running: one update every ${TICK_MS / 1000}s while the market is open`,
  );
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  start,
  stop,
  tick,
  stepPrice,
  constants: { TICK_MS, DECAY, TREND_KICK, NOISE },
};
