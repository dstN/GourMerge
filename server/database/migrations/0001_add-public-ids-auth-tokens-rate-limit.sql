CREATE TABLE `email_verification_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `email_verification_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_verification_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_hits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bucket_key` varchar(200) NOT NULL,
	`window_start` int NOT NULL,
	`count` int NOT NULL DEFAULT 1,
	CONSTRAINT `rate_limit_hits_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_rate_limit_bucket_window` UNIQUE(`bucket_key`,`window_start`)
);
--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD `public_id` BINARY(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `recipe_commits` ADD `is_merge` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipe_commits` ADD `merge_source_commit_id` int;--> statement-breakpoint
ALTER TABLE `recipes` ADD `public_id` BINARY(16) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `tour_dismissed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `idx_gourmerge_requests_public_id` UNIQUE(`public_id`);--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `idx_recipes_public_id` UNIQUE(`public_id`);--> statement-breakpoint
ALTER TABLE `email_verification_tokens` ADD CONSTRAINT `email_verification_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_email_tokens_user` ON `email_verification_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reset_tokens_user` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_recipes_visibility_stars` ON `recipes` (`visibility`,`star_count`);--> statement-breakpoint
CREATE INDEX `idx_recipes_visibility_created` ON `recipes` (`visibility`,`created_at`);