ALTER TABLE `bonus_credits` ADD `corporate_account_id` text REFERENCES corporate_accounts(id);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bonus_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`investor_id` text,
	`corporate_account_id` text,
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
	FOREIGN KEY (`corporate_account_id`) REFERENCES `corporate_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_bonus_credits`("id", "investor_id", "corporate_account_id", "bonus_type", "amount", "effective_date", "reference", "related_investor_id", "facility_id", "reason", "approved_by", "transaction_id", "created_at") SELECT "id", "investor_id", "corporate_account_id", "bonus_type", "amount", "effective_date", "reference", "related_investor_id", "facility_id", "reason", "approved_by", "transaction_id", "created_at" FROM `bonus_credits`;--> statement-breakpoint
DROP TABLE `bonus_credits`;--> statement-breakpoint
ALTER TABLE `__new_bonus_credits` RENAME TO `bonus_credits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `communications` ADD `specific_corporate_account_id` text REFERENCES corporate_accounts(id);--> statement-breakpoint
ALTER TABLE `notifications` ADD `corporate_account_id` text REFERENCES corporate_accounts(id);
