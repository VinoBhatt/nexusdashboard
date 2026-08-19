CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`applicant_name` text NOT NULL,
	`risk_level` text DEFAULT 'Standard' NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`notes` text,
	`submitted_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text,
	`subject_id` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`investor_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` real NOT NULL,
	`bank` text,
	`reference` text,
	`receipt_document_id` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`file_key` text,
	`file_name` text NOT NULL,
	`content_type` text,
	`size_bytes` integer,
	`status` text DEFAULT 'Pending' NOT NULL,
	`uploaded_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `financing_facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`product_group` text NOT NULL,
	`financing_type` text NOT NULL,
	`risk_tier` text NOT NULL,
	`rate_pct` real NOT NULL,
	`tenor_days` integer NOT NULL,
	`days_elapsed` integer DEFAULT 0 NOT NULL,
	`min_investment` real NOT NULL,
	`max_investment` real NOT NULL,
	`funding_progress_pct` real DEFAULT 0 NOT NULL,
	`principal_amount` real NOT NULL,
	`service_fee_pct` real DEFAULT 0 NOT NULL,
	`issuer_name` text NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`first_payment_date` text,
	`last_payment_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` text PRIMARY KEY NOT NULL,
	`investor_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`status` text NOT NULL,
	`amount_invested` real NOT NULL,
	`expected_return` real DEFAULT 0 NOT NULL,
	`actual_return` real DEFAULT 0 NOT NULL,
	`eligible_for_sale` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `investor_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cash_balance` real DEFAULT 0 NOT NULL,
	`total_deposits` real DEFAULT 0 NOT NULL,
	`total_withdrawals` real DEFAULT 0 NOT NULL,
	`total_invested` real DEFAULT 0 NOT NULL,
	`annualised_yield` real DEFAULT 0 NOT NULL,
	`expected_returns` real DEFAULT 0 NOT NULL,
	`expected_this_month` real DEFAULT 0 NOT NULL,
	`overdue_this_month` real DEFAULT 0 NOT NULL,
	`outstanding` real DEFAULT 0 NOT NULL,
	`defaulted` real DEFAULT 0 NOT NULL,
	`kyc_status` text DEFAULT 'Pending' NOT NULL,
	`job_type` text,
	`income_range` text,
	`net_worth` text,
	`source_of_funds` text,
	`objective` text,
	`risk_appetite` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `metrics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`metric_key` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`value` real NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repayment_installments` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`installment_no` integer NOT NULL,
	`due_date` text NOT NULL,
	`principal_due` real DEFAULT 0 NOT NULL,
	`profit_due` real DEFAULT 0 NOT NULL,
	`fee_due` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Upcoming' NOT NULL,
	`paid_at` integer,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `secondary_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`holding_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`units` real NOT NULL,
	`price_per_unit` real NOT NULL,
	`status` text DEFAULT 'Open' NOT NULL,
	`listed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `holdings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`active_role` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `statements` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`period_label` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'Generating' NOT NULL,
	`file_key` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`status` text NOT NULL,
	`reference_json` text,
	`occurred_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`is_demo_reviewer` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`investor_id` text NOT NULL,
	`amount` real NOT NULL,
	`fee` real DEFAULT 1 NOT NULL,
	`net_amount` real NOT NULL,
	`reason` text,
	`proof_document_id` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
