ALTER TABLE `corporate_accounts` ADD `cash_balance` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `holdings` ADD `corporate_account_id` text REFERENCES corporate_accounts(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `type` text DEFAULT 'Allocation' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `facility_id` text REFERENCES financing_facilities(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `statements` ADD `corporate_account_id` text REFERENCES corporate_accounts(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `corporate_account_id` text REFERENCES corporate_accounts(id);