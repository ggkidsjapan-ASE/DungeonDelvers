CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_code` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'Villager' NOT NULL,
	`role_icon` text DEFAULT '🏠' NOT NULL,
	`clue_1` text DEFAULT '' NOT NULL,
	`clue_2` text DEFAULT '' NOT NULL,
	`is_werewolf` integer DEFAULT false NOT NULL,
	`vote` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_players_room_code` ON `players` (`room_code`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`teacher_token` text NOT NULL,
	`phase` text DEFAULT 'lobby' NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`prior_werewolves` text DEFAULT '[]' NOT NULL,
	`wolf_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_updated_at` ON `rooms` (`updated_at`);
--> statement-breakpoint
PRAGMA optimize;
