CREATE TABLE `creature_designs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`character_class` text,
	`color` text NOT NULL,
	`parts` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_creature_designs_kind_created_at` ON `creature_designs` (`kind`,`created_at`);