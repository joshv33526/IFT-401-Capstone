-- Run ONCE as the admin/master user (local root or the RDS master user).
-- Creates the account the Express app uses. It can read/write data but
-- cannot DROP/ALTER tables or create users, so a SQL injection or leaked
-- .env cannot destroy the schema or escalate privileges.
--
-- Replace the password before running. Never commit the real one.
-- On RDS you can replace '%' with your app subnet, e.g. '10.0.1.%'.

CREATE USER IF NOT EXISTS 'easystock_app'@'%' IDENTIFIED BY 'CHANGE_ME_strong_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON easystock.* TO 'easystock_app'@'%';
FLUSH PRIVILEGES;
