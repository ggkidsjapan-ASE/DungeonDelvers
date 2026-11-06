CREATE TABLE `map_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tiles` text NOT NULL,
	`starts` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_map_templates_created_at` ON `map_templates` (`created_at`);