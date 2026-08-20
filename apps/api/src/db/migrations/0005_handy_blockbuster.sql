CREATE TABLE `auto_invest_rules` (
	`investor_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`min_rate_pct` real,
	`max_tenor_days` integer,
	`risk_tiers` text,
	`amount_per_note` real DEFAULT 100 NOT NULL,
	`budget_cap` real,
	`total_invested` real DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `holdings` ADD `source` text DEFAULT 'manual' NOT NULL;