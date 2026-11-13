-- Conquest of AzerothCore launcher Discord account link tables.
-- Local project default auth schema is acore_auth.
-- If AuthDatabase points to another schema, change the USE line before running.

USE `acore_auth`;

-- Durable, single-use OAuth state. Only a digest of the browser token is stored.
CREATE TABLE IF NOT EXISTS `coa_discord_pending` (
    `account_id` INT UNSIGNED NOT NULL,
    `state_hash` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `expires_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`account_id`),
    UNIQUE KEY `uq_coa_discord_pending_state` (`state_hash`),
    KEY `idx_coa_discord_pending_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS `coa_discord_link` (
    `account_id` INT UNSIGNED NOT NULL,
    `discord_user_id` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `discord_username` VARCHAR(128) NOT NULL,
    `discord_global_name` VARCHAR(128) NULL,
    `linked_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`account_id`),
    UNIQUE KEY `uq_coa_discord_link_user` (`discord_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `coa_discord_link_log` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` INT UNSIGNED NOT NULL,
    `discord_user_id` VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `discord_username` VARCHAR(128) NOT NULL,
    `discord_global_name` VARCHAR(128) NULL,
    `event_type` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    `event_at` DATETIME(6) NOT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_coa_discord_link_log_account` (`account_id`, `event_at`),
    KEY `idx_coa_discord_link_log_user` (`discord_user_id`, `event_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
