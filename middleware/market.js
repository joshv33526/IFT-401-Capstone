// Decides whether trading is allowed right now, using the market_schedule
// and market_holidays tables that the admin pages maintain.
//
// EC2 and RDS clocks run in UTC, so "now" is converted to MARKET_TZ first.
// Without this, 9:30 AM market open would actually mean 9:30 AM UTC.
const { pool } = require("../db");

const MARKET_TZ = process.env.MARKET_TZ || "America/New_York";
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function marketClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    dayOfWeek: WEEKDAYS[p.weekday],
    date: `${p.year}-${p.month}-${p.day}`, // "2026-09-23"
    time: `${p.hour}:${p.minute}:${p.second}`, // "14:05:09"
  };
}

async function getMarketStatus() {
  const now = marketClock();

  const [holidays] = await pool.query(
    "SELECT description FROM market_holidays WHERE holiday_date = ?",
    [now.date],
  );
  if (holidays.length) {
    return { open: false, reason: `Closed for ${holidays[0].description}`, now, timezone: MARKET_TZ };
  }

  const [[day]] = await pool.query(
    "SELECT is_open, open_time, close_time FROM market_schedule WHERE day_of_week = ?",
    [now.dayOfWeek],
  );
  if (!day || !day.is_open) {
    return { open: false, reason: "Market is closed today", now, timezone: MARKET_TZ };
  }

  // TIME columns come back as "HH:MM:SS" strings, which compare correctly as text.
  const open = now.time >= day.open_time && now.time < day.close_time;
  return {
    open,
    reason: open ? "Market is open" : `Market hours are ${day.open_time} to ${day.close_time}`,
    openTime: day.open_time,
    closeTime: day.close_time,
    now,
    timezone: MARKET_TZ,
  };
}

async function requireMarketOpen(req, res, next) {
  // Dev/testing override so you can test trades at night or on weekends.
  // Never set this on the EC2 production .env.
  if (process.env.MARKET_ALWAYS_OPEN === "true" && process.env.NODE_ENV !== "production") {
    return next();
  }
  const status = await getMarketStatus();
  if (!status.open) {
    return res.status(403).json({ error: status.reason });
  }
  next();
}

module.exports = { getMarketStatus, requireMarketOpen, marketClock };
