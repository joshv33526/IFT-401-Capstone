-- Easy Stock Solutions: starter data for development and demos.
USE easystock;

-- Mon-Fri open 9:30-16:00, weekends closed (admin can change later)
INSERT INTO market_schedule (day_of_week, is_open, open_time, close_time) VALUES
  (0, FALSE, '09:30:00', '16:00:00'),
  (1, TRUE,  '09:30:00', '16:00:00'),
  (2, TRUE,  '09:30:00', '16:00:00'),
  (3, TRUE,  '09:30:00', '16:00:00'),
  (4, TRUE,  '09:30:00', '16:00:00'),
  (5, TRUE,  '09:30:00', '16:00:00'),
  (6, FALSE, '09:30:00', '16:00:00');

INSERT INTO market_holidays (holiday_date, description) VALUES
  ('2026-11-26', 'Thanksgiving Day'),
  ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day');

INSERT INTO stocks (ticker, company_name, volume, initial_price, current_price) VALUES
  ('AAPL',  'Apple Inc.',  100000, 185.24, 185.24),
  ('MSFT',  'Microsoft',   100000, 421.35, 421.35),
  ('NVDA',  'NVIDIA',      100000, 118.40, 118.40),
  ('AMZN',  'Amazon',      100000, 156.50, 156.50),
  ('GOOGL', 'Google',      100000, 174.20, 174.20);

INSERT INTO stock_prices (stock_id, price)
  SELECT stock_id, current_price FROM stocks;
