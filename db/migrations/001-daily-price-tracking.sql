-- Migration 001: daily price tracking for the random stock price generator.
-- Should run ONCE on each database (local MySQL and RDS) as the admin or master user.
-- App user cannot alter tables, so this does not work from the app account.
-- DO NOT rerun schema.sql (it wipes data).

-- Columns are NULLABLE on purpose. The admin "create stock" route inserts only
-- (ticker, company_name, volume, initial_price, current_price), so it keeps working unchanged-
-- generator fills these in at the first price tick of trading day, and the API
-- falls back to current_price until then.

-- open_price   price at the start of the trading day (first tick of the day)
-- day_high     highest price so far today
-- day_low      lowest price so far today
-- price_data   the (market time zone) date those three values belong to

USE easystock;

ALTER TABLE stocks
    ADD COLUMN open_price DECIMAL(12,2) NULL AFTER current_price,
    ADD COLUMN day_high   DECIMAL(12,2) NULL AFTER open_price,
    ADD COLUMN day_low    DECIMAL(12,2) NULL AFTER day_high,
    ADD COLUMN price_date date          NULL AFTER day_low;

-- Existing stocks start with open/high/low equal to the current price.
-- price_date stays NULL so the generator starts a fresh day on its first tick.
UPDATE stocks
    SET open_price = current_price,
        day_high   = current_price,
        day_low    = current_price;