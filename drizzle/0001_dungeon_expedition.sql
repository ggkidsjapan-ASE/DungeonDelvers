DROP TABLE `players`;
--> statement-breakpoint
DROP TABLE `rooms`;
--> statement-breakpoint
CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `teacher_token` text NOT NULL,
  `phase` text DEFAULT 'lobby' NOT NULL,
  `game_state` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_updated_at` ON `rooms` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `players` (
  `id` text PRIMARY KEY NOT NULL,
  `room_code` text NOT NULL,
  `name` text NOT NULL,
  `role` text DEFAULT 'Warrior' NOT NULL,
  `character_state` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_players_room_code` ON `players` (`room_code`);
