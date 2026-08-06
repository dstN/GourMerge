CREATE TABLE `user_recovery_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`code_hash` varchar(255) NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_recovery_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_totp` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`secret_encrypted` text NOT NULL,
	`confirmed_at` datetime,
	`last_used_counter` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_totp_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_totp_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `is_ghost` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `inactivity_notice_6m_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `inactivity_notice_4w_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `inactivity_notice_24h_at` datetime;--> statement-breakpoint
ALTER TABLE `user_recovery_codes` ADD CONSTRAINT `user_recovery_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_totp` ADD CONSTRAINT `user_totp_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_recovery_codes_user_idx` ON `user_recovery_codes` (`user_id`);--> statement-breakpoint
-- ── Backfill the inactivity clock ────────────────────────────────
-- Existing rows have no login history, so `created_at` is the only honest
-- starting point. Without this every pre-existing account would read as
-- last-seen NULL; the nightly job COALESCEs to created_at anyway, but writing it
-- once makes the value visible to support and to any ad-hoc query.
UPDATE `users` SET `last_login_at` = `created_at` WHERE `last_login_at` IS NULL;--> statement-breakpoint
-- ── The shared anonymous tombstone ───────────────────────────────
-- Inherits attribution that must survive a hard account delete: commits copied
-- into someone else's fork, GourMerge Requests and comments in their threads.
-- Four FKs into `users` are NOT NULL + RESTRICT, so those rows can neither be
-- deleted (they are another user's history) nor nulled.
--
-- Never loginable: `password_hash` is a sentinel that no bcrypt comparison can
-- match, and the address is at a reserved `.invalid` domain.
INSERT INTO `users` (`username`, `email`, `password_hash`, `preferred_locale`, `is_ghost`, `created_at`)
SELECT 'ghost', 'ghost@gourmerge.invalid', 'ghost-account-not-loginable', 'de', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `is_ghost` = 1);
