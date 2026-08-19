CREATE TABLE `issuer_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`registration_number` text,
	`sector` text,
	`contact_person` text,
	`contact_email` text,
	`registered_address` text,
	`kyb_status` text DEFAULT 'Pending' NOT NULL,
	`available_line` real DEFAULT 0 NOT NULL,
	`on_time_rate` real DEFAULT 100 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `issuer_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `purpose` text;