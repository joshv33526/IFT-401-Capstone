// Single shared MySQL connection pool. Every route imports from here.
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // DECIMAL columns come back as strings (e.g. "185.24") so money is never
  // silently turned into an imprecise float. Convert with lib/money.js.
  decimalNumbers: false,
});

// Runs `work(conn)` inside one database transaction.
// If anything throws, every write inside is rolled back, so a buy can never
// take the cash without also recording the shares (or vice versa).
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
