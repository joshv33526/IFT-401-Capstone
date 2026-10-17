// /api/portfolio - the logged-in user's cash, holdings, and their gain/loss
const express = require("express");
const { pool } = require("../db");
const { requireLogin } = require("../middleware/auth");
const HttpError = require("../lib/httpError");
const { toCents, fromCents } = require("../lib/money");

const router = express.Router();
router.use(requireLogin);

// GET /api/portfolio
// Gain/loss per individual holding = (current price - average cost) * shares.
// User id always comes from the session, not from the browser.
router.get("/", async (req, res) => {
  const [[acct]] = await pool.query(
    "SELECT balance FROM cash_accounts WHERE user_id = ?",
    [req.session.userId],
  );
  if (!acct) throw new HttpError(404, "Cash account not found");

  const [rows] = await pool.query(
    `SELECT s.ticker, s.company_name, s.current_price,
                h.quantity, h.avg_cost,
                ROUND((s.current_price - h.avg_cost) * h.quantity, 2) AS gain_loss
        FROM holdings h
        JOIN stocks s ON s.stock_id = h.stock_id
        WHERE h.user_id = ?
        ORDER BY s.ticker`,
    [req.session.userId],
  );

  let holdingsCents = 0;
  let gainCents = 0;
  const holdings = rows.map((r) => {
    holdingsCents += toCents(r.current_price) * r.quantity;
    gainCents += toCents(r.gain_loss);
    return {
      ticker: r.ticker,
      companyName: r.company_name,
      shares: r.quantity,
      avgPrice: Number(r.avg_cost).toFixed(2),
      currentPrice: r.current_price,
      gainLoss: r.gain_loss,
    };
  });

  const cashCents = toCents(acct.balance);
  res.json({
    cash: fromCents(cashCents),
    portfolioValue: fromCents(holdingsCents + cashCents), // stock + cash
    totalGainLoss: fromCents(gainCents),
    holdings,
  });
});

module.exports = router;
