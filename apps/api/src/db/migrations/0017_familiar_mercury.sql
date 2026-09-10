CREATE TABLE `bonus_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`investor_id` text NOT NULL,
	`bonus_type` text NOT NULL,
	`amount` real NOT NULL,
	`effective_date` text NOT NULL,
	`reference` text,
	`related_investor_id` text,
	`facility_id` text,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`transaction_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `communications` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text,
	`audience` text NOT NULL,
	`specific_investor_id` text,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`send_date` text NOT NULL,
	`sender` text NOT NULL,
	`recipient_ids_json` text NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`specific_investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
