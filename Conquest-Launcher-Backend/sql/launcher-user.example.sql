-- Review and execute only on the intended writable test/VPS database, never the read-only reference repack.
-- Set a private password before running. Match the hostname to the actual MySQL connection.
CREATE USER IF NOT EXISTS 'coa_launcher'@'127.0.0.1' IDENTIFIED BY 'REPLACE_WITH_A_PRIVATE_PASSWORD';
GRANT SELECT, INSERT ON acore_auth.account TO 'coa_launcher'@'127.0.0.1';
GRANT SELECT ON acore_auth.realmlist TO 'coa_launcher'@'127.0.0.1';
GRANT INSERT ON acore_auth.realmcharacters TO 'coa_launcher'@'127.0.0.1';
GRANT SELECT ON acore_characters.characters TO 'coa_launcher'@'127.0.0.1';
-- Apply discord-account-link.sql in acore_auth BEFORE these grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON acore_auth.coa_discord_pending TO 'coa_launcher'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON acore_auth.coa_discord_link TO 'coa_launcher'@'127.0.0.1';
GRANT INSERT ON acore_auth.coa_discord_link_log TO 'coa_launcher'@'127.0.0.1';
-- Optional recovery, only after applying password-reset.sql:
-- GRANT SELECT, INSERT, UPDATE ON acore_auth.coa_password_reset TO 'coa_launcher'@'127.0.0.1';
-- GRANT UPDATE (salt, verifier, session_key) ON acore_auth.account TO 'coa_launcher'@'127.0.0.1';
