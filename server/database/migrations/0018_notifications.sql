CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipient_id` int NOT NULL,
	`actor_id` int NOT NULL,
	`kind` enum('recipe_forked','gmr_opened','discussion_started','discussion_reply','gmr_comment','mention') NOT NULL,
	`recipe_id` int NOT NULL,
	`target_kind` enum('recipe','discussion','gmr') NOT NULL,
	`target_id` int NOT NULL,
	`read_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `notification_mutes` json;--> statement-breakpoint
ALTER TABLE `users` ADD `last_notification_digest_at` datetime;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_id_users_id_fk` FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_created` ON `notifications` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_unread` ON `notifications` (`recipient_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_recipe` ON `notifications` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_target` ON `notifications` (`target_kind`,`target_id`);