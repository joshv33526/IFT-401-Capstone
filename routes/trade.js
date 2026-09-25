// /api/trade  -  buy and sell stock  (Ethan)
//
// Each trade is ONE database transaction that:
//   1. reads the stock price        (locked FOR SHARE so it can't change mid-trade)
//   2. locks the user's cash row    (FOR UPDATE)
//   3. checks funds / shares
//   4. updates cash + holdings
//   5. records the order, the executed transaction, and the cash ledger entry
// If any step fails, all of it is rolled back.
//
// Lock order is always stocks -> cash_accounts -> holdings in every route,
// which prevents deadlocks between concurrent trades.
const express = require("express");
const { body } = require("express-validator");
const { withTransaction } = require("../db");
const { requireLogin } = require("../middleware/auth");
const { requireMarketOpen } = require("../middleware/market");
const validate = require("../middleware/validate");
const HttpError = require("../lib/httpError");
const { toCents, fromCents } = require("../lib/money");

const router = express.Router();

const tradeRules = [
  body("ticker")
    .trim()
    .toUpperCase()
    .matches(/^[A-Z][A-Z.]{0,9}$/)
    .withMessage("Invalid ticker"),
  body("quantity")
    .isInt({ min: 1, max: 100000 })
    .withMessage("Quantity must be a whole number from 1 to 100,000")
    .toInt(),
];

// Loads the stock and the user's cash account with the correct locks.
async function lockStockAndCash(conn, ticker, userId) {
  const [[stock]] = await conn.query(
    "SELECT stock_id, ticker, current_price FROM stocks WHERE ticker = ? FOR SHARE",
    [ticker],
  );
  if (!stock) throw new HttpError(404, `Stock ${ticker} not found`);

  const [[acct]] = await conn.query(
    "SELECT cash_account_id, balance FROM cash_accounts WHERE user_id = ? FOR UPDATE",
    [userId],
  );
  if (!acct) throw new HttpError(404, "Cash account not found");

  return { stock, acct };
}

// Writes the order, transaction, and cash ledger rows (same for buy and sell).
async function recordTrade(conn, { userId, stock, acct, side, quantity, priceCents, totalCents, newBalanceCents }) {
  const [order] = await conn.query(
    `INSERT INTO orders (user_id, stock_id, side, quantity, price, status)
     VALUES (?, ?, ?, ?, ?, 'FILLED')`,
    [userId, stock.stock_id, side, quantity, fromCents(priceCents)],
  );
  await conn.query(
    `INSERT INTO transactions (order_id, user_id, stock_id, side, quantity, price, total)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [order.insertId, userId, stock.stock_id, side, quantity, fromCents(priceCents), fromCents(totalCents)],
  );
  await conn.query(
    `INSERT INTO cash_transactions (cash_account_id, txn_type, amount, balance_after, order_id)
     VALUES (?, ?, ?, ?, ?)`,
    [acct.cash_account_id, side, fromCents(totalCents), fromCents(newBalanceCents), order.insertId],
  );
  return {
    orderId: order.insertId,
    side,
    ticker: stock.ticker,
    quantity,
    price: fromCents(priceCents),
    total: fromCents(totalCents),
    cashBalance: fromCents(newBalanceCents),
  };
}

// POST /api/trade/buy   body: { "ticker": "AAPL", "quantity": 5 }
router.post("/buy", requireLogin, requireMarketOpen, tradeRules, validate, async (req, res) => {
  const userId = req.session.userId;
  const { ticker, quantity } = req.body;

  const result = await withTransaction(async (conn) => {
    const { stock, acct } = await lockStockAndCash(conn, ticker, userId);

    const priceCents = toCents(stock.current_price);
    const totalCents = priceCents * quantity;
    const balanceCents = toCents(acct.balance);
    if (totalCents > balanceCents) throw new HttpError(400, "Insufficient funds");
    const newBalanceCents = balanceCents - totalCents;

    await conn.query("UPDATE cash_accounts SET balance = ? WHERE cash_account_id = ?", [
      fromCents(newBalanceCents),
      acct.cash_account_id,
    ]);

    // Add shares; if the user already owns this stock, update the
    // weighted-average cost. avg_cost must be set BEFORE quantity because
    // MySQL applies these assignments left to right.
    await conn.query(
      `INSERT INTO holdings (user_id, stock_id, quantity, avg_cost)
       VALUES (?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE
         avg_cost = (holdings.avg_cost * holdings.quantity + new.avg_cost * new.quantity)
                    / (holdings.quantity + new.quantity),
         quantity = holdings.quantity + new.quantity`,
      [userId, stock.stock_id, quantity, fromCents(priceCents)],
    );

    return recordTrade(conn, {
      userId, stock, acct, side: "BUY", quantity, priceCents, totalCents, newBalanceCents,
    });
  });

  res.status(201).json(result);
});

// POST /api/trade/sell  body: { "ticker": "AAPL", "quantity": 2 }
router.post("/sell", requireLogin, requireMarketOpen, tradeRules, validate, async (req, res) => {
  const userId = req.session.userId;
  const { ticker, quantity } = req.body;

  const result = await withTransaction(async (conn) => {
    const { stock, acct } = await lockStockAndCash(conn, ticker, userId);

    const [[holding]] = await conn.query(
      "SELECT holding_id, quantity FROM holdings WHERE user_id = ? AND stock_id = ? FOR UPDATE",
      [userId, stock.stock_id],
    );
    if (!holding || holding.quantity < quantity) {
      throw new HttpError(400, `Not enough ${stock.ticker} shares to sell`);
    }

    if (holding.quantity === quantity) {
      await conn.query("DELETE FROM holdings WHERE holding_id = ?", [holding.holding_id]);
    } else {
      await conn.query("UPDATE holdings SET quantity = quantity - ? WHERE holding_id = ?", [
        quantity,
        holding.holding_id,
      ]);
    }

    // Sale proceeds go into the cash account (per the project plan).
    const priceCents = toCents(stock.current_price);
    const totalCents = priceCents * quantity;
    const newBalanceCents = toCents(acct.balance) + totalCents;

    await conn.query("UPDATE cash_accounts SET balance = ? WHERE cash_account_id = ?", [
      fromCents(newBalanceCents),
      acct.cash_account_id,
    ]);

    return recordTrade(conn, {
      userId, stock, acct, side: "SELL", quantity, priceCents, totalCents, newBalanceCents,
    });
  });

  res.status(201).json(result);
});

module.exports = router;
