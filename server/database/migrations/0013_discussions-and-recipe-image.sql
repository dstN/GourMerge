CREATE TABLE `recipe_discussion_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discussion_id` int NOT NULL,
	`author_id` int NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_discussion_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_discussions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`commit_id` int,
	`author_id` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`category` enum('idea','question','issue','praise') NOT NULL DEFAULT 'idea',
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_discussions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`mime_type` varchar(30) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`byte_size` int NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`alt_text` varchar(300),
	`data` MEDIUMBLOB NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_recipe_images_recipe` UNIQUE(`recipe_id`)
);
--> statement-breakpoint
ALTER TABLE `recipe_discussion_comments` ADD CONSTRAINT `recipe_discussion_comments_discussion_id_recipe_discussions_id_fk` FOREIGN KEY (`discussion_id`) REFERENCES `recipe_discussions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_discussion_comments` ADD CONSTRAINT `recipe_discussion_comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_discussions` ADD CONSTRAINT `recipe_discussions_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_discussions` ADD CONSTRAINT `recipe_discussions_commit_id_recipe_commits_id_fk` FOREIGN KEY (`commit_id`) REFERENCES `recipe_commits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_discussions` ADD CONSTRAINT `recipe_discussions_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_images` ADD CONSTRAINT `recipe_images_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_discussion_comments_thread` ON `recipe_discussion_comments` (`discussion_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discussion_comments_author` ON `recipe_discussion_comments` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_discussions_recipe_created` ON `recipe_discussions` (`recipe_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discussions_commit` ON `recipe_discussions` (`commit_id`);--> statement-breakpoint
CREATE INDEX `idx_discussions_author` ON `recipe_discussions` (`author_id`);