// /api/auth  -  login, logout, and "who am I"
// Registration (POST /register) is Jake's "create user account" function.
// It must insert the users row AND its cash_accounts row inside one
// withTransaction() call, hash with bcrypt.hash(password, 12), and use
// the same validate middleware pattern shown below.
const express = require("express");
const bcrypt = require("bcrypt");
const { body } = require("express-validator");
const { pool } = require("../db");
const validate = require("../middleware/validate");

const router = express.Router();

// Compared against when the username doesn't exist, so a wrong username
// takes the same time as a wrong password (prevents username enumeration).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

router.post(
  "/login",
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
  validate,
  async (req, res) => {
    const { username, password } = req.body;

    const [[user]] = await pool.query(
      "SELECT user_id, full_name, username, password_hash, role FROM users WHERE username = ?",
      [username],
    );

    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      // Same message for both cases on purpose.
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // New session id at login blocks session-fixation attacks.
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = user.user_id;
    req.session.role = user.role;
    req.session.fullName = user.full_name;

    res.json({ userId: user.user_id, fullName: user.full_name, role: user.role });
  },
);

router.post("/logout", async (req, res) => {
  await new Promise((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve())),
  );
  res.clearCookie("esid");
  res.json({ message: "Logged out" });
});

// Frontend calls this on page load to know if someone is logged in
// (and whether to show admin links).
router.get("/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  res.json({
    userId: req.session.userId,
    fullName: req.session.fullName,
    role: req.session.role,
  });
});

module.exports = router;
