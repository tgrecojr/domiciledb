CREATE TABLE `location_photo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_id` integer NOT NULL,
	`path_original` text NOT NULL,
	`path_web` text NOT NULL,
	`path_thumb` text NOT NULL,
	`content_hash` text NOT NULL,
	`width` integer,
	`height` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `location_photo_location_idx` ON `location_photo` (`location_id`);--> statement-breakpoint
ALTER TABLE `location` ADD `description` text;