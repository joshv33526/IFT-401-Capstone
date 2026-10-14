// /api/trade  -  buy and sell stock
// Lock order is always stocks -> cash_accounts -> holdings in every route,
// which prevents deadlocks between concurrent trades.
const express = require("express");
const { body, param } = require("express-validator");
const { pool, withTransaction } = require("../db");
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
async function recordTrade(
  conn,
  {
    userId,
    stock,
    acct,
    side,
    quantity,
    priceCents,
    totalCents,
    newBalanceCents,
  },
) {
  const [order] = await conn.query(
    `INSERT INTO orders (user_id, stock_id, side, quantity, price, status)
     VALUES (?, ?, ?, ?, ?, 'FILLED')`,
    [userId, stock.stock_id, side, quantity, fromCents(priceCents)],
  );
  await conn.query(
    `INSERT INTO transactions (order_id, user_id, stock_id, side, quantity, price, total)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      order.insertId,
      userId,
      stock.stock_id,
      side,
      quantity,
      fromCents(priceCents),
      fromCents(totalCents),
    ],
  );
  await conn.query(
    `INSERT INTO cash_transactions (cash_account_id, txn_type, amount, balance_after, order_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      acct.cash_account_id,
      side,
      fromCents(totalCents),
      fromCents(newBalanceCents),
      order.insertId,
    ],
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

// POST /api/trade/buy
router.post(
  "/buy",
  requireLogin,
  requireMarketOpen,
  tradeRules,
  validate,
  async (req, res) => {
    const userId = req.session.userId;
    const { ticker, quantity } = req.body;

    const result = await withTransaction(async (conn) => {
      const { stock, acct } = await lockStockAndCash(conn, ticker, userId);

      const priceCents = toCents(stock.current_price);
      const totalCents = priceCents * quantity;
      const balanceCents = toCents(acct.balance);
      if (totalCents > balanceCents)
        throw new HttpError(400, "Insufficient funds");
      const newBalanceCents = balanceCents - totalCents;

      await conn.query(
        "UPDATE cash_accounts SET balance = ? WHERE cash_account_id = ?",
        [fromCents(newBalanceCents), acct.cash_account_id],
      );

      // Add shares; if the user already owns this stock, update the
      // weighted-average cost.
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
        userId,
        stock,
        acct,
        side: "BUY",
        quantity,
        priceCents,
        totalCents,
        newBalanceCents,
      });
    });

    res.status(201).json(result);
  },
);

// POST /api/trade/sell  body: { "ticker": "AAPL", "quantity": 2 }
router.post(
  "/sell",
  requireLogin,
  requireMarketOpen,
  tradeRules,
  validate,
  async (req, res) => {
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
        await conn.query("DELETE FROM holdings WHERE holding_id = ?", [
          holding.holding_id,
        ]);
      } else {
        await conn.query(
          "UPDATE holdings SET quantity = quantity - ? WHERE holding_id = ?",
          [quantity, holding.holding_id],
        );
      }

      // Sale proceeds go into the cash account (per the project plan).
      const priceCents = toCents(stock.current_price);
      const totalCents = priceCents * quantity;
      const newBalanceCents = toCents(acct.balance) + totalCents;

      await conn.query(
        "UPDATE cash_accounts SET balance = ? WHERE cash_account_id = ?",
        [fromCents(newBalanceCents), acct.cash_account_id],
      );

      return recordTrade(conn, {
        userId,
        stock,
        acct,
        side: "SELL",
        quantity,
        priceCents,
        totalCents,
        newBalanceCents,
      });
    });

    res.status(201).json(result);
  },
);

// GET /api/trade/stocks
// Every stock with its current price and how many shares the logged-in user
// owns. Fills the buy/sell dropdowns on trade.html.
router.get("/stocks", requireLogin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.ticker, s.company_name, s.current_price,
            COALESCE(h.quantity, 0) AS shares_owned
     FROM stocks s
     LEFT JOIN holdings h ON h.stock_id = s.stock_id AND h.user_id = ?
     ORDER BY s.ticker`,
    [req.session.userId],
  );
  res.json({
    stocks: rows.map((r) => ({
      ticker: r.ticker,
      companyName: r.company_name,
      price: r.current_price,
      sharesOwned: Number(r.shares_owned),
    })),
  });
});

// GET /api/trade/orders/pending
// The logged-in user's PENDING orders (shown in the Cancel Pending Order table).
router.get("/orders/pending", requireLogin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.order_id, s.ticker, o.side, o.quantity, o.status
     FROM orders o
     JOIN stocks s ON s.stock_id = o.stock_id
     WHERE o.user_id = ? AND o.status = 'PENDING'
     ORDER BY o.order_id`,
    [req.session.userId],
  );
  res.json({
    orders: rows.map((r) => ({
      orderId: r.order_id,
      ticker: r.ticker,
      side: r.side,
      quantity: r.quantity,
      status: r.status,
    })),
  });
});

// POST /api/trade/orders/:orderId/cancel
// Cancels one of the logged-in user's own PENDING orders. A pending order has
// not moved any cash or shares yet, so only the order status changes.
router.post(
  "/orders/:orderId/cancel",
  requireLogin,
  param("orderId").isInt({ min: 1 }).withMessage("Invalid order id"),
  validate,
  async (req, res) => {
    const userId = req.session.userId;
    const orderId = Number(req.params.orderId);

    await withTransaction(async (conn) => {
      const [[order]] = await conn.query(
        "SELECT order_id, status FROM orders WHERE order_id = ? AND user_id = ? FOR UPDATE",
        [orderId, userId],
      );
      if (!order) throw new HttpError(404, "Order not found");
      if (order.status !== "PENDING") {
        throw new HttpError(400, "Only pending orders can be cancelled");
      }
      await conn.query(
        "UPDATE orders SET status = 'CANCELLED' WHERE order_id = ?",
        [orderId],
      );
    });

    res.json({ orderId, status: "CANCELLED" });
  },
);

module.exports = router;
