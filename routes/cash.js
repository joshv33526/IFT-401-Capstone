// /api/cash  -  balance, deposit, withdraw  (Ethan)
const express = require("express");
const { body } = require("express-validator");
const { pool, withTransaction } = require("../db");
const { requireLogin } = require("../middleware/auth");
const validate = require("../middleware/validate");
const HttpError = require("../lib/httpError");
const { toCents, fromCents } = require("../lib/money");

const router = express.Router();
router.use(requireLogin); // every cash route needs a logged-in user

const MAX_CASH_TXN = 1_000_000; // per-request limit

const amountRule = body("amount")
  .isDecimal({ decimal_digits: "0,2" }).withMessage("Amount must be a number with at most 2 decimal places")
  .bail()
  .custom((v) => Number(v) >= 0.01 && Number(v) <= MAX_CASH_TXN)
  .withMessage(`Amount must be between 0.01 and ${MAX_CASH_TXN}`);

// GET /api/cash/balance
router.get("/balance", async (req, res) => {
  const [[acct]] = await pool.query(
    "SELECT balance FROM cash_accounts WHERE user_id = ?",
    [req.session.userId],
  );
  if (!acct) throw new HttpError(404, "Cash account not found");
  res.json({ balance: acct.balance });
});

// Shared logic for deposit (+) and withdrawal (-)
async function changeCash(userId, amountCents, type) {
  return withTransaction(async (conn) => {
    // FOR UPDATE locks this row until commit, so two withdrawals sent at the
    // same moment can't both see the old balance and overdraw the account.
    const [[acct]] = await conn.query(
      "SELECT cash_account_id, balance FROM cash_accounts WHERE user_id = ? FOR UPDATE",
      [userId],
    );
    if (!acct) throw new HttpError(404, "Cash account not found");

    const current = toCents(acct.balance);
    const next = type === "DEPOSIT" ? current + amountCents : current - amountCents;
    if (next < 0) throw new HttpError(400, "Insufficient funds");

    await conn.query(
      "UPDATE cash_accounts SET balance = ? WHERE cash_account_id = ?",
      [fromCents(next), acct.cash_account_id],
    );
    await conn.query(
      `INSERT INTO cash_transactions (cash_account_id, txn_type, amount, balance_after)
       VALUES (?, ?, ?, ?)`,
      [acct.cash_account_id, type, fromCents(amountCents), fromCents(next)],
    );
    return { type, amount: fromCents(amountCents), balance: fromCents(next) };
  });
}

// POST /api/cash/deposit   body: { "amount": "250.00" }
router.post("/deposit", amountRule, validate, async (req, res) => {
  const result = await changeCash(req.session.userId, toCents(req.body.amount), "DEPOSIT");
  res.status(201).json(result);
});

// POST /api/cash/withdraw  body: { "amount": "100.00" }
router.post("/withdraw", amountRule, validate, async (req, res) => {
  const result = await changeCash(req.session.userId, toCents(req.body.amount), "WITHDRAWAL");
  res.status(201).json(result);
});

module.exports = router;
