CREATE TABLE `corporate_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`deployed_funds` real DEFAULT 0 NOT NULL,
	`nav` real DEFAULT 0 NOT NULL,
	`weighted_yield` real DEFAULT 0 NOT NULL,
	`collection_rate` real DEFAULT 0 NOT NULL,
	`realised` real DEFAULT 0 NOT NULL,
	`performing` real DEFAULT 0 NOT NULL,
	`overdue` real DEFAULT 0 NOT NULL,
	`defaulted` real DEFAULT 0 NOT NULL,
	`watchlist` real DEFAULT 0 NOT NULL,
	`maker_checker_enabled` integer DEFAULT true NOT NULL,
	`approval_threshold` real DEFAULT 50000 NOT NULL,
	`order_limit` real DEFAULT 150000 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `corporate_users` (
	`id` text PRIMARY KEY NOT NULL,
	`corporate_account_id` text NOT NULL,
	`user_id` text NOT NULL,
	`corp_role` text NOT NULL,
	FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`corporate_account_id` text NOT NULL,
	`subwallet_id` text,
	`amount` real NOT NULL,
	`status` text DEFAULT 'Pending Checker' NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subwallet_id`) REFERENCES `subwallets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `corporate_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `corporate_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subwallets` (
	`id` text PRIMARY KEY NOT NULL,
	`corporate_account_id` text NOT NULL,
	`name` text NOT NULL,
	`deployed_amount` real DEFAULT 0 NOT NULL,
	`performance_pct` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_metrics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`metric_key` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`value` real NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_metrics_snapshots`("id", "account_id", "metric_key", "snapshot_date", "value") SELECT "id", "account_id", "metric_key", "snapshot_date", "value" FROM `metrics_snapshots`;--> statement-breakpoint
DROP TABLE `metrics_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_metrics_snapshots` RENAME TO `metrics_snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;