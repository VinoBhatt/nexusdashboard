CREATE TABLE `charge_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`installment_id` text NOT NULL,
	`component` text NOT NULL,
	`type` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`calculated_amount` real NOT NULL,
	`effective_amount` real NOT NULL,
	`reason` text NOT NULL,
	`effective_date` text NOT NULL,
	`approved_by` text NOT NULL,
	`status` text DEFAULT 'APPROVED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`installment_id`) REFERENCES `repayment_installments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `early_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`settlement_date` text NOT NULL,
	`actual_payment_date` text NOT NULL,
	`principal_outstanding` real NOT NULL,
	`accrued_return` real NOT NULL,
	`late_charges` real DEFAULT 0 NOT NULL,
	`other_fees` real DEFAULT 0 NOT NULL,
	`waiver_amount` real DEFAULT 0 NOT NULL,
	`additional_charges` real DEFAULT 0 NOT NULL,
	`final_settlement_amount` real NOT NULL,
	`status` text DEFAULT 'APPROVED' NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `early_settlements_facility_id_unique` ON `early_settlements` (`facility_id`);--> statement-breakpoint
CREATE TABLE `facility_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`payment_reference` text NOT NULL,
	`payment_date` text NOT NULL,
	`method` text,
	`bank` text,
	`received_from` text,
	`amount` real NOT NULL,
	`allocation_json` text NOT NULL,
	`instalment_ids_json` text NOT NULL,
	`trust_status` text DEFAULT 'CONFIRMED' NOT NULL,
	`allocation_status` text DEFAULT 'RECORDED' NOT NULL,
	`payout_status` text DEFAULT 'PENDING' NOT NULL,
	`recorded_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fee_policy_history` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`previous_rate_bps` integer,
	`new_rate_bps` integer NOT NULL,
	`reason` text NOT NULL,
	`effective_date` text NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `held_funds` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`source_payment_id` text NOT NULL,
	`hold_type` text DEFAULT 'OTHER' NOT NULL,
	`original_amount` real NOT NULL,
	`used_amount` real DEFAULT 0 NOT NULL,
	`refunded_amount` real DEFAULT 0 NOT NULL,
	`reason` text,
	`status` text DEFAULT 'HELD' NOT NULL,
	`approved_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_payment_id`) REFERENCES `facility_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `investor_payout_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`payout_id` text NOT NULL,
	`investor_id` text NOT NULL,
	`principal_entitlement` real DEFAULT 0 NOT NULL,
	`gross_scheduled_return` real DEFAULT 0 NOT NULL,
	`gross_late_return` real DEFAULT 0 NOT NULL,
	`platform_fee` real DEFAULT 0 NOT NULL,
	`sst` real DEFAULT 0 NOT NULL,
	`net_return` real DEFAULT 0 NOT NULL,
	`wallet_credit` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PAID' NOT NULL,
	FOREIGN KEY (`payout_id`) REFERENCES `investor_payouts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`investor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `investor_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`principal_total` real DEFAULT 0 NOT NULL,
	`gross_scheduled_return_total` real DEFAULT 0 NOT NULL,
	`gross_late_return_total` real DEFAULT 0 NOT NULL,
	`platform_fee_total` real DEFAULT 0 NOT NULL,
	`sst_total` real DEFAULT 0 NOT NULL,
	`wallet_credit_total` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `facility_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedule_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`version` integer NOT NULL,
	`type` text NOT NULL,
	`effective_date` text NOT NULL,
	`reason` text NOT NULL,
	`approved_by` text NOT NULL,
	`installments_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `deferred_profit_cap_rate_bps` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `deferred_profit_maximum_days` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `tawidh_rate_bps` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `late_interest_rate_bps` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `day_count_basis` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `platform_fee_bps` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `sst_rate_bps` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `delinquent_days` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `default_days` integer;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `facility_principal_outstanding` real;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `principal_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `profit_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `deferred_profit_due` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `deferred_profit_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `tawidh_due` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `tawidh_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `late_interest_due` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `late_interest_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `fees_paid` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `servicing_status` text;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `original_due_date` text;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `superseded` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repayment_installments` ADD `settlement_id` text;