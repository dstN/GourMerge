CREATE TABLE `ingredient_search_terms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingredient_id` int NOT NULL,
	`locale` varchar(5),
	`kind` enum('name','synonym') NOT NULL,
	`term` varchar(200) NOT NULL,
	`compact` varchar(200) NOT NULL,
	CONSTRAINT `ingredient_search_terms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ingredient_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ingredient_id` int NOT NULL,
	`dataset` varchar(20) NOT NULL,
	`external_id` varchar(50) NOT NULL,
	`dataset_version` varchar(20),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ingredient_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ingredient_sources_dataset_ext` UNIQUE(`dataset`,`external_id`)
);
--> statement-breakpoint
ALTER TABLE `ingredient_search_terms` ADD CONSTRAINT `ingredient_search_terms_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_sources` ADD CONSTRAINT `ingredient_sources_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_ingredient_search_terms_ingredient` ON `ingredient_search_terms` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `idx_ingredient_search_terms_term` ON `ingredient_search_terms` (`term`);--> statement-breakpoint
CREATE INDEX `idx_ingredient_search_terms_compact` ON `ingredient_search_terms` (`compact`);--> statement-breakpoint
CREATE INDEX `idx_ingredient_sources_ingredient` ON `ingredient_sources` (`ingredient_id`);--> statement-breakpoint
-- Hand-written backfill (drizzle-kit only generates DDL). Every Swiss BLV food the old
-- importer wrote is identified by `ingredient_nutrition.source = 'swiss-blv-v7'` plus its
-- numeric `external_id`; from here on `ingredient_sources` is the lookup the importer uses,
-- so the existing rows have to be registered there or the next `seed:swiss` would insert
-- all 1191 foods a second time. A duplicate external_id would make this INSERT fail on the
-- unique key — that is the desired outcome, not something to paper over with IGNORE.
INSERT INTO `ingredient_sources` (`ingredient_id`, `dataset`, `external_id`, `dataset_version`)
SELECT `ingredient_id`, 'swiss-blv', `external_id`, '7.0'
FROM `ingredient_nutrition`
WHERE `source` = 'swiss-blv-v7' AND `external_id` IS NOT NULL;
