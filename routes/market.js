// /api/market  -  market status (public, read-only)
// Josh: the admin "change market hours" and "market schedule" routes go here too,
// protected with requireAdmin from middleware/auth.js.
const express = require("express");
const { getMarketStatus } = require("../middleware/market");

const router = express.Router();

// GET /api/market/status -> { open: true/false, reason, ... }
router.get("/status", async (req, res) => {
  res.json(await getMarketStatus());
});

module.exports = router;
