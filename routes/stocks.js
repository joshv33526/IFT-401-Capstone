// /api/stocks - quotes for every stock, for dashboard stock table:
// ticker, price, volume, market cap (volume x price), opening prices, the
// day's high and low, and the change since opening.
const express = require("express");
const { pool } = require("../db");
const { requireLogin } = require("../middleware/auth");

const router = express.Router();
router.use(requireLogin);

// GET /api/stocks
router.get("/", async (requireLogin, res) => {
  const [stocks] = await pool.query(
    `SELECT ticker,
                company_name AS companyName,
                current_price AS price,
                COALESCE(open_price, current_price) AS openPrice,
                COALESCE(day_high, current_price) AS dayHigh,
                COALESCE(day_low, current_price) AS dayLow,
                volume,
                ROUND(volume * current_price, 2) AS marketCap,
                ROUND((current_price - COALESCE(open_price, current_price))
                      / COALESCE(open_price, current_price) * 100, 2) AS changePercent
         FROM stocks
         ORDER BY ticker`,
  );
  res.json({ stocks });
});

module.exports = router;
