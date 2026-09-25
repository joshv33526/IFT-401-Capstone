-- Easy Stock Solutions: database schema

CREATE DATABASE IF NOT EXISTS easystock
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE easystock;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS cash_transactions, transactions, orders, holdings,
  stock_prices, stocks, cash_accounts, users, market_schedule, market_holidays;
SET FOREIGN_KEY_CHECKS = 1;

-- USER --------------------------------------------------------------------
CREATE TABLE users (
  user_id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  username       VARCHAR(50)  NOT NULL UNIQUE,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  CHAR(60)     NOT NULL,          -- bcrypt output is always 60 chars
  role           ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CASH_ACCOUNT (1 per user) ------------------------------------------------
CREATE TABLE cash_accounts (
  cash_account_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL UNIQUE,
  balance         DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  CONSTRAINT chk_cash_balance_nonneg CHECK (balance >= 0),
  CONSTRAINT fk_cash_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
);

-- STOCK -------------------------------------------------------------------
CREATE TABLE stocks (
  stock_id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticker         VARCHAR(10)  NOT NULL UNIQUE,
  company_name   VARCHAR(100) NOT NULL,
  volume         INT UNSIGNED NOT NULL,           -- set by admin at creation
  initial_price  DECIMAL(12,2) NOT NULL,
  current_price  DECIMAL(12,2) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_stock_prices_pos CHECK (initial_price > 0 AND current_price > 0)
);

-- STOCK_PRICE --------
CREATE TABLE stock_prices (
  price_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_id     INT UNSIGNED NOT NULL,
  price        DECIMAL(12,2) NOT NULL,
  recorded_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_price_stock_time (stock_id, recorded_at),
  CONSTRAINT fk_price_stock FOREIGN KEY (stock_id)
    REFERENCES stocks(stock_id) ON DELETE CASCADE
);

-- ORDER --------------------------------------
CREATE TABLE orders (
  order_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  stock_id    INT UNSIGNED NOT NULL,
  side        ENUM('BUY','SELL') NOT NULL,
  quantity    INT UNSIGNED NOT NULL,
  price       DECIMAL(12,2) NOT NULL,
  status      ENUM('PENDING','FILLED','CANCELLED','REJECTED') NOT NULL DEFAULT 'PENDING',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_order_qty CHECK (quantity > 0),
  CONSTRAINT fk_order_user  FOREIGN KEY (user_id)  REFERENCES users(user_id),
  CONSTRAINT fk_order_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

-- TRANSACTION (the executed trade) -----------------------------------------
CREATE TABLE transactions (
  transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id       BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id        INT UNSIGNED NOT NULL,
  stock_id       INT UNSIGNED NOT NULL,
  side           ENUM('BUY','SELL') NOT NULL,
  quantity       INT UNSIGNED NOT NULL,
  price          DECIMAL(12,2) NOT NULL,
  total          DECIMAL(14,2) NOT NULL,
  executed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_txn_user_time (user_id, executed_at),
  CONSTRAINT fk_txn_order FOREIGN KEY (order_id) REFERENCES orders(order_id),
  CONSTRAINT fk_txn_user  FOREIGN KEY (user_id)  REFERENCES users(user_id),
  CONSTRAINT fk_txn_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

-- CASH_TRANSACTION (every change to a cash balance, e.g. buys/sells) -------
CREATE TABLE cash_transactions (
  cash_txn_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cash_account_id  INT UNSIGNED NOT NULL,
  txn_type         ENUM('DEPOSIT','WITHDRAWAL','BUY','SELL') NOT NULL,
  amount           DECIMAL(14,2) NOT NULL,
  balance_after    DECIMAL(14,2) NOT NULL,
  order_id         BIGINT UNSIGNED NULL,          -- set for BUY/SELL only
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cashtxn_acct_time (cash_account_id, created_at),
  CONSTRAINT chk_cashtxn_amount CHECK (amount > 0),
  CONSTRAINT fk_cashtxn_acct  FOREIGN KEY (cash_account_id)
    REFERENCES cash_accounts(cash_account_id) ON DELETE CASCADE,
  CONSTRAINT fk_cashtxn_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
);

-- HOLDING (junction between USER and STOCK: what each user owns) ----------
CREATE TABLE holdings (
  holding_id  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  stock_id    INT UNSIGNED NOT NULL,
  quantity    INT UNSIGNED NOT NULL,
  avg_cost    DECIMAL(12,4) NOT NULL,
  UNIQUE KEY uq_holding_user_stock (user_id, stock_id),
  CONSTRAINT chk_holding_qty CHECK (quantity > 0),
  CONSTRAINT fk_holding_user  FOREIGN KEY (user_id)  REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_holding_stock FOREIGN KEY (stock_id) REFERENCES stocks(stock_id)
);

-- MARKET_SCHEDULE (one row per weekday; holds both hours and open days) ----
CREATE TABLE market_schedule (
  day_of_week  TINYINT UNSIGNED PRIMARY KEY,      -- 0 = Sunday ... 6 = Saturday
  is_open      BOOLEAN NOT NULL DEFAULT FALSE,
  open_time    TIME NOT NULL DEFAULT '09:30:00',
  close_time   TIME NOT NULL DEFAULT '16:00:00',
  CONSTRAINT chk_sched_day   CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT chk_sched_times CHECK (open_time < close_time)
);

-- MARKET_HOLIDAY ----------------------------------------------------------
CREATE TABLE market_holidays (
  holiday_date  DATE PRIMARY KEY,
  description   VARCHAR(100) NOT NULL
);
