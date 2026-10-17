// Transaction history for the current logged in user.
const express = require("express");
const { query } = require("express-validator");
const { pool } = require("../db");
const { requireLogin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const HttpError = require("../lib/httpError");

const router = express.Router();
router.use(requireLogin);

const MAX_ROWS = 500;

// Filters values sent by the page, then store the values in the database.
// Also prevents the ability for SQL injections.
const TYPE_MAP = {
  bought: "BUY",
  sold: "SELL",
  deposit: "DEPOSIT",
  withdrawal: "WITHDRAWAL",
  cancelled: "CANCELLED"
};

const filterRules = [
  query("type")
    .optional()
    .isIn(["all", ...Object.keys(TYPE_MAP)])
    .withMessage("Unknown transaction type"),
  // Converts chosen dates into exact moments by using the logged users own time zone.
  query("from").optional().isISO8601().withMessage("Invalid start date"),
  query("to").optional().isISO8601().withMessage("Invalid end date"),
];

// GET /api/transactions
router.get("/", filterRules, validate, async (req, res) => {
  const { type = "all", from, to } = req.query;

  // Unix seconds. Keeps comparisons correct no matter
  // the time zone the Node server or the database is set to.
  const fromSec = from ? Math.floor(Date.parse(from) / 1000) : null;
  const toSec = to ? Math.floor(Date.parse(to) / 1000) : null;
  if (fromSec !== null && toSec !== null && fromSec >= toSec) {
    throw new HttpError(400, "Start date must be before end date");
  }

  const where = [];
  const params = [req.session.userId, req.session.userId];
  if (type !== "all") {
    where.push("history.type = ?");
    params.push(TYPE_MAP[type]);
  }
  if (fromSec !== null) {
    where.push("history.event_at >= FROM_UNIXTIME(?)");
    params.push(fromSec);
  }
  if (toSec !== null) {
    where.push("history.event_at < FROM_UNIXTIME(?)");
    params.push(toSec);
  }

  const [rows] = await pool.query(
    `SELECT history.*, UNIX_TIMESTAMP(history.event_at) AS ts FROM (
       SELECT ct.cash_txn_id AS id, ct.txn_type AS type, ct.amount,
              ct.balance_after AS balanceAfter, ct.created_at AS event_at,
              s.ticker, t.quantity, t.price, t.side, 'cash' AS source
       FROM cash_transactions ct
       JOIN cash_accounts ca ON ca.cash_account_id = ct.cash_account_id
       LEFT JOIN transactions t ON t.order_id = ct.order_id
       LEFT JOIN stocks s ON s.stock_id = t.stock_id
       WHERE ca.user_id = ?
       UNION ALL
       SELECT o.order_id AS id, 'CANCELLED' AS type, 0 AS amount,
              NULL AS balanceAfter, o.created_at AS event_at,
              s.ticker, o.quantity, NULL AS price, o.side, 'order' AS source
       FROM orders o JOIN stocks s ON s.stock_id = o.stock_id
       WHERE o.user_id = ? AND o.status = 'CANCELLED'
     ) AS history
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY history.event_at DESC, history.id DESC, history.source DESC
     LIMIT ${MAX_ROWS}`,
    params,
  );

  res.json({
    count: rows.length,
    limited: rows.length === MAX_ROWS,

    transactions: rows.map((r) => ({
      id: r.id,
      type: r.type, // BUY, SELL, DEPOSIT, WITHDRAWAL, CANCELLED
      side: r.side ?? null,
      dateIsPlacement: r.type === "CANCELLED",
      date: new Date(Number(r.ts) * 1000).toISOString(),
      ticker: r.ticker ?? null, // null for deposits/withdrawals
      quantity: r.quantity ?? null,
      price: r.price ?? null, // money values are strings
      amount: r.amount, // zero for cancelled orders
      balanceAfter: r.balanceAfter,
    })),
  });
});

module.exports = router;
