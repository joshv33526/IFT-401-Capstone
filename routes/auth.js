// /api/auth  -  login, logout, and "who am I"
const express = require("express");
const bcrypt = require("bcrypt");
const { body } = require("express-validator");
const { pool, withTransaction } = require("../db");
const validate = require("../middleware/validate");

const router = express.Router();

// Compared against when the username doesn't exist, so a wrong username
// takes the same time as a wrong password (prevents username enumeration).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

router.post(
  "/register",
  body("fullName")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Full name is required (100 characters max)"),
  body("username")
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Username is required (50 characters max)"),
  body("email")
    .trim()
    .isLength({ max: 255 })
    .isEmail()
    .withMessage("Enter a valid email address (255 characters max)"),
  body("password")
    .isString()
    .bail()
    .isLength({ min: 8 })
    .withMessage("Password must have at least 8 characters")
    .bail()
    .custom((value) => Buffer.byteLength(value, "utf8") <= 72)
    .withMessage("Password must be 72 bytes or fewer"),
  body("confirmPassword")
    .custom((value, { req }) => value === req.body.password)
    .withMessage("Passwords do not match"),
  validate,
  async (req, res) => {
    const { fullName, username, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await withTransaction(async (conn) => {
        const [result] = await conn.query(
          `INSERT INTO users
             (full_name, username, email, password_hash, role)
           VALUES (?, ?, ?, ?, 'customer')`,
          [fullName, username, email, passwordHash],
        );

        await conn.query(
          "INSERT INTO cash_accounts (user_id, balance) VALUES (?, 0.00)",
          [result.insertId],
        );
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error: "That username or email is already registered.",
        });
      }
      throw err;
    }

    res.status(201).json({
      message: "Account created. You can now log in.",
    });
  },
);

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
