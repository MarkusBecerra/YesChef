CREATE TABLE `cook_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`cooked_on` text NOT NULL,
	`rating` integer,
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cook_logs_recipe_idx` ON `cook_logs` (`recipe_id`,`cooked_on`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ingredients_recipe_idx` ON `ingredients` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `recipe_tags` (
	`recipe_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `tag_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recipe_tags_tag_idx` ON `recipe_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`notes` text,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`total_minutes` integer,
	`servings` integer,
	`yield_text` text,
	`difficulty` text,
	`category` text,
	`source_url` text,
	`source_name` text,
	`photo_url` text,
	`cost_rating` integer,
	`cost_amount` real,
	`is_favorite` integer DEFAULT false NOT NULL,
	`ingredient_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recipes_title_idx` ON `recipes` (`title`);--> statement-breakpoint
CREATE INDEX `recipes_updated_idx` ON `recipes` (`updated_at`);--> statement-breakpoint
CREATE TABLE `steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `steps_recipe_idx` ON `steps` (`recipe_id`,`position`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);