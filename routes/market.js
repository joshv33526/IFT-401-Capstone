// /api/market  -  market status (public, read-only)
// Admin routes that CHANGE market hours, trading days and holidays are in
// routes/admin.js (/api/admin/market/...), protected with requireAdmin.
const express = require("express");
const { getMarketStatus } = require("../middleware/market");

const router = express.Router();

// GET /api/market/status -> { open: true/false, reason, ... }
router.get("/status", async (req, res) => {
  res.json(await getMarketStatus());
});

module.exports = router;
