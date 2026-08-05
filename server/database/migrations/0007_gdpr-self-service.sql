CREATE TABLE `data_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`type` enum('export','deletion') NOT NULL,
	`token_hash` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`confirmed_at` datetime,
	`completed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `data_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `data_requests_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `anonymized_at` datetime;--> statement-breakpoint
ALTER TABLE `data_requests` ADD CONSTRAINT `data_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_data_requests_user` ON `data_requests` (`user_id`);