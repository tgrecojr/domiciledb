CREATE TABLE `ai_interaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`action` text NOT NULL,
	`model` text NOT NULL,
	`prompt_text` text NOT NULL,
	`image_refs` text,
	`request_summary` text,
	`response` text,
	`outcome` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_name_unique` ON `category` (`name`);--> statement-breakpoint
CREATE TABLE `document` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text DEFAULT 'receipt' NOT NULL,
	`path` text NOT NULL,
	`content_hash` text NOT NULL,
	`filename` text NOT NULL,
	`warranty_expires_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `document_item_idx` ON `document` (`item_id`);--> statement-breakpoint
CREATE TABLE `household` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`location_id` integer,
	`category_id` integer,
	`title` text NOT NULL,
	`description` text,
	`manufacturer` text,
	`model_number` text,
	`serial_number` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`lifecycle_date` text,
	`condition` text,
	`age_estimate` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_replacement_cost` integer,
	`current_replacement_valued_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `item_household_idx` ON `item` (`household_id`);--> statement-breakpoint
CREATE INDEX `item_location_idx` ON `item` (`location_id`);--> statement-breakpoint
CREATE INDEX `item_status_idx` ON `item` (`status`);--> statement-breakpoint
CREATE INDEX `item_lifecycle_idx` ON `item` (`lifecycle_status`);--> statement-breakpoint
CREATE TABLE `item_tag` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'room' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `location_household_idx` ON `location` (`household_id`);--> statement-breakpoint
CREATE TABLE `photo` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`path_original` text NOT NULL,
	`path_web` text NOT NULL,
	`path_thumb` text NOT NULL,
	`content_hash` text NOT NULL,
	`width` integer,
	`height` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photo_item_idx` ON `photo` (`item_id`);--> statement-breakpoint
CREATE TABLE `policy` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`coverage_b_personal_property` integer,
	`coverage_a_dwelling` integer,
	`coverage_c_loss_of_use` integer,
	`deductible` integer,
	`policy_number` text,
	`insurer` text,
	`source` text DEFAULT 'user' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reminder` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`kind` text NOT NULL,
	`due_at` text NOT NULL,
	`dismissed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminder_due_idx` ON `reminder` (`due_at`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_name_unique` ON `tag` (`name`);--> statement-breakpoint
CREATE TABLE `valuation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`valued_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `valuation_item_idx` ON `valuation` (`item_id`);