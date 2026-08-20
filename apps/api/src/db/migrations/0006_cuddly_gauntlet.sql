CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`facility_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action
);
