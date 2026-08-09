CREATE TABLE `user_avatars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`mime_type` varchar(30) NOT NULL,
	`edge` int NOT NULL,
	`byte_size` int NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`data` MEDIUMBLOB NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_avatars_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_avatars_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `user_avatars` ADD CONSTRAINT `user_avatars_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;