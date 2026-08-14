CREATE TABLE `collection_recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collection_id` int NOT NULL,
	`recipe_id` int NOT NULL,
	`added_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `collection_recipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_collection_recipes_unique` UNIQUE(`collection_id`,`recipe_id`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_id` BINARY(16) NOT NULL,
	`owner_id` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`slug` varchar(300) NOT NULL,
	`description` text,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_collections_public_id` UNIQUE(`public_id`),
	CONSTRAINT `idx_collections_owner_slug` UNIQUE(`owner_id`,`slug`)
);
--> statement-breakpoint
ALTER TABLE `collection_recipes` ADD CONSTRAINT `collection_recipes_collection_id_collections_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collection_recipes` ADD CONSTRAINT `collection_recipes_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `collections` ADD CONSTRAINT `collections_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_collections_owner` ON `collections` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_collections_visibility` ON `collections` (`visibility`);