CREATE TABLE `ingredient_nutrition` (
	`ingredient_id` int NOT NULL,
	`energy_kcal_100g` decimal(8,2),
	`energy_kj_100g` decimal(8,2),
	`fat_100g` decimal(8,2),
	`saturated_fat_100g` decimal(8,2),
	`carbs_100g` decimal(8,2),
	`sugars_100g` decimal(8,2),
	`starch_100g` decimal(8,2),
	`fiber_100g` decimal(8,2),
	`protein_100g` decimal(8,2),
	`salt_100g` decimal(8,2),
	`alcohol_100g` decimal(8,2),
	`water_100g` decimal(8,2),
	`density_g_per_ml` decimal(6,3),
	`grams_per_piece` int,
	`micros` json DEFAULT ('{}'),
	`source` varchar(50) NOT NULL DEFAULT 'swiss-blv-v7',
	`external_id` varchar(50),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingredient_nutrition_ingredient_id` PRIMARY KEY(`ingredient_id`)
);
--> statement-breakpoint
ALTER TABLE `ingredients` ADD `synonyms` json DEFAULT ('{}') NOT NULL;--> statement-breakpoint
ALTER TABLE `ingredient_nutrition` ADD CONSTRAINT `ingredient_nutrition_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_nutrition_source_ext` ON `ingredient_nutrition` (`source`,`external_id`);