require("dotenv").config();
const express = require("express");
const session = require("express-session");
const { pool } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is missing from .env - see .env.example");
}

// On EC2 behind a reverse proxy/load balancer that terminates HTTPS,
// this lets Express see the request as secure so the cookie is sent.
if (isProd) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

app.use(
  session({
    name: "esid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax", // blocks most cross-site request forgery
      secure: isProd, // HTTPS-only in production
      maxAge: 2 * 60 * 60 * 1000,
    },
  }),
);

app.use(express.static("public"));

// ---- API routes ----
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.get("/api/health/db", async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ database: "ok" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/cash", require("./routes/cash"));
app.use("/api/trade", require("./routes/trade"));
app.use("/api/market", require("./routes/market"));

// Unknown /api/... path
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Error handler. Express 5 sends thrown/rejected errors from async
// routes here automatically. Internal details are logged
// on the server and never sent to the browser.
app.use((err, req, res, next) => {
  if (!err.expose) console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : "Internal server error" });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
