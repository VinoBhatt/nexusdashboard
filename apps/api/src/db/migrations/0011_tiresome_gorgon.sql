CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`prepared_by` text NOT NULL,
	`status` text DEFAULT 'Drafted' NOT NULL,
	`risk_method` text,
	`risk_value` text,
	`securities_json` text,
	`corporate_guarantee_source` text,
	`corporate_guarantee_other` text,
	`collateral_details` text,
	`other_security_details` text,
	`processing_fee` real DEFAULT 0 NOT NULL,
	`platform_fee` real DEFAULT 0 NOT NULL,
	`documents_json` text,
	`note_name` text,
	`note_message` text,
	`recall_reason` text,
	`promotional_start` integer,
	`launch_start` integer,
	`launch_end` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`submitted_at` integer,
	`scheduled_at` integer,
	`launched_at` integer,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `islamic_conventional` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `counterparty_name` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `counterparty_registration` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `business_info_json` text;