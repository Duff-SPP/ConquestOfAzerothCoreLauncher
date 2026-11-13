-- Conquest of AzerothCore v2 portal tables - AUTH database.
-- Run as a MySQL administrator after selecting/changing the auth DB name below.

CREATE TABLE IF NOT EXISTS `acore_auth`.`coa_password_reset` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` INT UNSIGNED NOT NULL,
    `token_hash` BINARY(32) NOT NULL,
    `created_at` DATETIME NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `used_at` DATETIME NULL,
    `request_ip` VARCHAR(45) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_coa_password_reset_token` (`token_hash`),
    KEY `idx_coa_password_reset_account` (`account_id`, `expires_at`),
    KEY `idx_coa_password_reset_expiry` (`expires_at`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
