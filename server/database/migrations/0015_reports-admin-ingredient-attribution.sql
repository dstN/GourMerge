CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`target_kind` enum('recipe','user','discussion_comment','image','ingredient') NOT NULL,
	`target_id` int NOT NULL,
	`reporter_id` int NOT NULL,
	`reason` enum('spam','inappropriate','copyright','harassment','incorrect_data','other') NOT NULL,
	`note` text,
	`status` enum('open','actioned','dismissed') NOT NULL DEFAULT 'open',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_reports_reporter_target` UNIQUE(`reporter_id`,`target_kind`,`target_id`)
);
--> statement-breakpoint
ALTER TABLE `ingredients` ADD `created_by` int;--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_reports_target` ON `reports` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_status` ON `reports` (`status`);--> statement-breakpoint
ALTER TABLE `ingredients` ADD CONSTRAINT `ingredients_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;