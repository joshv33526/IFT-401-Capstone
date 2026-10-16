// /api/admin - create stocks, market hours, and market schedule
// Each route protected by requireAdmin, so customer who is
// logged in still get 403 error.
const express = require("express");
const { body, param } = require("express-validator");
const { pool, withTransaction } = require("../db");
const { requireAdmin } = require("../middleware/auth");
const { marketClock } = require("../middleware/market");
const validate = require("../middleware/validate");
const HttpError = require("../lib/httpError");
const { toCents, fromCents } = require("../lib/money");

const router = express.Router();
router.use(requireAdmin);

// Day codes page sends = days_of_week numbers in market_schedule (0 = Sunday).
const DAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/; // "09:30" or "09:30:00"
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/; // "2026-11-26"

const toDbTime = (t) => (t.length === 5 ? `${t}:00` : t); // "09:30" = "09:30:00"
const toHHMM = (t) => String(t).slice(0, 5); // "09:30:00" = "09:30"

// -- STOCKS -- \\
// GET /api/admin/stocks = every listed stock
router.get("/stocks", async (requireAdmin, res) => {
  const [rows] = await pool.query(
    `SELECT ticker, company_name AS companyName, current_price AS currentPrice,
                initial_price AS initialPrice, volume
            FROM stocks
          ORDER BY ticker`,
  );
  res.json({ count: rows.length, stocks: rows });
});

const stockRules = [
  body("ticker")
    .trim()
    .toUpperCase()
    .matches(/^[A-Z]{1,5}$/)
    .withMessage("Ticker must be 1 to 5 letters"),
  body("companyName")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Company name is required (100 characters max)"),
  body("initialPrice")
    .isDecimal({ decimal_digits: "0,2" })
    .withMessage("Price must be a number with at most 2 decimal places")
    .bail()
    .custom((v) => Number(v) >= 0.01 && Number(v) <= 1_000_000)
    .withMessage("Price must be between $0.01 and $1,000,000"),
  body("volume")
    .isInt({ min: 1, max: 1_000_000_000 })
    .withMessage("Volume must be a whole number from 1 to 1,000,000,000")
    .toInt(),
];

// POST /api/admin/stocks
router.post("/stocks", stockRules, validate, async (req, res) => {
  const { ticker, companyName, volume } = req.body;
  const price = fromCents(toCents(req.body.initialPrice));

  try {
    await withTransaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO stocks (ticker, company_name, volume, initial_price, current_price)
         VALUES (?, ?, ?, ?, ?)`,
        [ticker, companyName, volume, price, price],
      );
      // First entry in the price history, so charts/price changes have a starting point.
      await conn.query(
        "INSERT INTO stock_prices (stock_id, price) VALUES (?, ?)",
        [result.insertId, price],
      );
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      throw new HttpError(409, `${ticker} is already listed`);
    throw err;
  }

  res.status(201).json({
    ticker,
    companyName,
    initialPrice: price,
    currentPrice: price,
    volume,
  });
});

// -- MARKET SCHEDULE -- \\
// GET /api/admin/market/schedule = hours, open days, and upcoming holidays.
router.get("/market/schedule", async (req, res) => {
  const [days] = await pool.query(
    "SELECT day_of_week, is_open, open_time, close_time FROM market_schedule ORDER BY day_of_week",
  );
  // Sets one set of hours for every day, hows the hours of the first
  // open day (or Monday if every day is closed).
  const ref =
    days.find((d) => d.is_open) ||
    days.find((d) => d.day_of_week === 1) ||
    days[0];

  const [holidays] = await pool.query(
    `SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date, description AS name
            FROM market_holidays
          WHERE holiday_date >= ?
          ORDER by holiday_date`,
    [marketClock().date],
  );

  res.json({
    openTime: ref ? toHHMM(ref.open_time) : null,
    closeTime: ref ? toHHMM(ref.close_time) : null,
    days: days.filter((d) => d.is_open).map((d) => DAY_CODES[d.day_of_week]),
    holidays,
  });
});

// PUT /api/admin/market/hours
router.put(
  "/market/hours",
  body("openTime").matches(TIME_PATTERN).withMessage("Open time must be HH:MM"),
  body("closeTime")
    .matches(TIME_PATTERN)
    .withMessage("Close time must be HH:MM"),
  validate,
  async (req, res) => {
    const openTime = toDbTime(req.body.openTime);
    const closeTime = toDbTime(req.body.closeTime);
    if (openTime >= closeTime)
      throw new HttpError(400, "Open time must be earlier than close time");

    await pool.query(
      "UPDATE market_schedule SET open_time = ?, close_time = ?",
      [openTime, closeTime],
    );
    res.json({ openTime: toHHMM(openTime), closeTime: toHHMM(closeTime) });
  },
);

// PUT /api/admin/market/days
router.put(
  "/market/days",
  body("days").isArray({ max: 7 }).withMessage("Days must be a list"),
  body("days.*").isIn(DAY_CODES).withMessage("Unknown day"),
  validate,
  async (req, res) => {
    const open = [...new Set(req.body.days)].map((d) => DAY_CODES.indexOf(d));
    // Listed days open, every other day closed.
    // An empty list closes the market every day.
    if (open.length) {
      await pool.query(
        "UPDATE market_schedule SET is_open = (day_of_week IN (?))",
        [open],
      );
    } else {
      await pool.query("UPDATE market_schedule SET is_open = FALSE");
    }
    res.json({ days: DAY_CODES.filter((_, i) => open.includes(i)) });
  },
);

// POST /api/admin/market/holidays
router.post(
  "/market/holidays",
  body("date")
    .matches(DATE_PATTERN)
    .bail()
    .isISO8601({ strict: true })
    .withMessage("Date must be a real date (YYYY-MM-DD)"),
  body("name")
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage("Name is required (60 characters max)"),
  validate,
  async (req, res) => {
    const { date, name } = req.body;
    if (date < marketClock().date)
      throw new HttpError(400, "Closures must be today or in the future");

    try {
      await pool.query(
        "INSERT INTO market_holidays (holiday_date, description) VALUES (?, ?)",
        [date, name],
      );
    } catch (err) {
      if (Error.code === "ER_DUP_ENTRY")
        throw new HttpError(409, `There is already a closure on ${date}`);
      throw err;
    }
    res.status(201).json({ date, name });
  },
);

// DELETE /api/admin/market/holidays
router.delete(
  "/market/holidays/:date",
  param("date").matches(DATE_PATTERN).withMessage("Date must be YYYY-MM-DD"),
  validate,
  async (req, res) => {
    const [result] = await pool.query(
      "DELETE FROM market_holidays WHERE holiday_date = ?",
      [req.params.date],
    );
    if (result.affectedRows === 0)
      throw new HttpError(404, "No closure on tht date");
    res.json({ deleted: req.params.date });
  },
);

module.exports = router;
