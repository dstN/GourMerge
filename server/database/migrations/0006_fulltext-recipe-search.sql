-- Custom SQL migration file, put your code below! --

-- FULLTEXT index backing /explore search (q over title + description).
-- Not expressible in the Drizzle schema (mysql-core index() supports only
-- btree/hash), so this is hand-authored. server/api/recipes/explore.get.ts uses
-- MATCH ... AGAINST for queries >= 3 chars and falls back to LIKE for shorter
-- terms (FULLTEXT ignores tokens below innodb_ft_min_token_size, default 3).
ALTER TABLE `recipes` ADD FULLTEXT INDEX `ft_recipes_title_description` (`title`, `description`);
