CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text,
	`investor_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
