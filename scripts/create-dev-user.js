// DEV ONLY: creates a test user + cash account so you can test login,
// deposits, and trades before the register page/route is finished.
//
// Usage:
//   node scripts/create-dev-user.js <username> <password> [customer|admin]
// Example:
//   node scripts/create-dev-user.js testuser Test123! customer
require("dotenv").config();
const bcrypt = require("bcrypt");
const { pool, withTransaction } = require("../db");

async function main() {
  const [username, password, role = "customer"] = process.argv.slice(2);
  if (!username || !password || !["customer", "admin"].includes(role)) {
    console.log("Usage: node scripts/create-dev-user.js <username> <password> [customer|admin]");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const userId = await withTransaction(async (conn) => {
    const [u] = await conn.query(
      "INSERT INTO users (full_name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)",
      [`Test ${username}`, username, `${username}@example.com`, hash, role],
    );
    await conn.query("INSERT INTO cash_accounts (user_id, balance) VALUES (?, 0.00)", [u.insertId]);
    return u.insertId;
  });
  console.log(`Created ${role} "${username}" (user_id ${userId}) with a $0.00 cash account`);
}

main()
  .catch((err) => {
    console.error(err.code === "ER_DUP_ENTRY" ? "That username/email already exists" : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
