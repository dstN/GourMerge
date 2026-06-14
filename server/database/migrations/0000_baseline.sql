CREATE TABLE `gm_request_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gm_request_id` int NOT NULL,
	`author_id` int NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gm_request_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gourmerge_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`author_id` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` text,
	`status` enum('open','closed','merged','draft') NOT NULL DEFAULT 'open',
	`source_branch_id` int NOT NULL,
	`target_branch_id` int NOT NULL,
	`source_recipe_id` int,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gourmerge_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`name_translations` json NOT NULL DEFAULT ('{}'),
	`category` varchar(100),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ingredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`head_commit_id` int,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_branches_recipe_name` UNIQUE(`recipe_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `recipe_commit_ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commit_id` int NOT NULL,
	`ingredient_id` int NOT NULL,
	`quantity` decimal(10,2) NOT NULL,
	`unit` enum('g','ml','piece','pinch','tsp','tbsp') NOT NULL,
	`notes` varchar(300),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `recipe_commit_ingredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_commit_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commit_id` int NOT NULL,
	`sort_order` int NOT NULL,
	`content` text NOT NULL,
	CONSTRAINT `recipe_commit_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_commits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branch_id` int NOT NULL,
	`parent_commit_id` int,
	`author_id` int NOT NULL,
	`message` varchar(500) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_commits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_stars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`user_id` int NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_stars_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_recipe_stars_unique` UNIQUE(`recipe_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`tag_id` int NOT NULL,
	CONSTRAINT `recipe_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_recipe_tags_unique` UNIQUE(`recipe_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`slug` varchar(300) NOT NULL,
	`description` text,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`forked_from_recipe_id` int,
	`servings` int NOT NULL DEFAULT 4,
	`prep_time_minutes` int,
	`cook_time_minutes` int,
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'medium',
	`star_count` int NOT NULL DEFAULT 0,
	`fork_count` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_recipes_owner_slug` UNIQUE(`owner_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_translations` json NOT NULL DEFAULT ('{}'),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`display_name` varchar(100),
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`avatar_url` varchar(500),
	`bio` text,
	`preferred_locale` varchar(10) NOT NULL DEFAULT 'de',
	`preferred_measurement_system` enum('metric','imperial') NOT NULL DEFAULT 'metric',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `gm_request_comments` ADD CONSTRAINT `gm_request_comments_gm_request_id_gourmerge_requests_id_fk` FOREIGN KEY (`gm_request_id`) REFERENCES `gourmerge_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gm_request_comments` ADD CONSTRAINT `gm_request_comments_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `gourmerge_requests_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `gourmerge_requests_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `gourmerge_requests_source_branch_id_recipe_branches_id_fk` FOREIGN KEY (`source_branch_id`) REFERENCES `recipe_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `gourmerge_requests_target_branch_id_recipe_branches_id_fk` FOREIGN KEY (`target_branch_id`) REFERENCES `recipe_branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gourmerge_requests` ADD CONSTRAINT `gourmerge_requests_source_recipe_id_recipes_id_fk` FOREIGN KEY (`source_recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_branches` ADD CONSTRAINT `recipe_branches_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_commit_ingredients` ADD CONSTRAINT `recipe_commit_ingredients_commit_id_recipe_commits_id_fk` FOREIGN KEY (`commit_id`) REFERENCES `recipe_commits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_commit_ingredients` ADD CONSTRAINT `recipe_commit_ingredients_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_commit_steps` ADD CONSTRAINT `recipe_commit_steps_commit_id_recipe_commits_id_fk` FOREIGN KEY (`commit_id`) REFERENCES `recipe_commits`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_commits` ADD CONSTRAINT `recipe_commits_branch_id_recipe_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `recipe_branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_commits` ADD CONSTRAINT `recipe_commits_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_stars` ADD CONSTRAINT `recipe_stars_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_stars` ADD CONSTRAINT `recipe_stars_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_tags` ADD CONSTRAINT `recipe_tags_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_tags` ADD CONSTRAINT `recipe_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_forked_from_recipe_id_recipes_id_fk` FOREIGN KEY (`forked_from_recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_gm_comments_request` ON `gm_request_comments` (`gm_request_id`);--> statement-breakpoint
CREATE INDEX `idx_gm_comments_author` ON `gm_request_comments` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_gourmerge_requests_recipe` ON `gourmerge_requests` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_gourmerge_requests_author` ON `gourmerge_requests` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_gourmerge_requests_status` ON `gourmerge_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_gourmerge_requests_source` ON `gourmerge_requests` (`source_branch_id`);--> statement-breakpoint
CREATE INDEX `idx_gourmerge_requests_target` ON `gourmerge_requests` (`target_branch_id`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_name` ON `ingredients` (`name`);--> statement-breakpoint
CREATE INDEX `idx_ingredients_category` ON `ingredients` (`category`);--> statement-breakpoint
CREATE INDEX `idx_branches_head_commit` ON `recipe_branches` (`head_commit_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_ingredients_commit` ON `recipe_commit_ingredients` (`commit_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_ingredients_ingredient` ON `recipe_commit_ingredients` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_steps_commit` ON `recipe_commit_steps` (`commit_id`);--> statement-breakpoint
CREATE INDEX `idx_commit_steps_order` ON `recipe_commit_steps` (`commit_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_commits_branch` ON `recipe_commits` (`branch_id`);--> statement-breakpoint
CREATE INDEX `idx_commits_parent` ON `recipe_commits` (`parent_commit_id`);--> statement-breakpoint
CREATE INDEX `idx_commits_author` ON `recipe_commits` (`author_id`);--> statement-breakpoint
CREATE INDEX `idx_commits_created` ON `recipe_commits` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_recipes_owner` ON `recipes` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_recipes_forked_from` ON `recipes` (`forked_from_recipe_id`);--> statement-breakpoint
CREATE INDEX `idx_recipes_visibility` ON `recipes` (`visibility`);