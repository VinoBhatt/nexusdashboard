-- Stage 1 promised this backfill in a schema.ts comment but never shipped it,
-- so every pre-Stage-1 facility has facility_principal_outstanding NULL.
UPDATE `financing_facilities` SET `facility_principal_outstanding` = `principal_amount` WHERE `facility_principal_outstanding` IS NULL;--> statement-breakpoint
ALTER TABLE `fee_policy_history` ADD `policy_field` text DEFAULT 'platformFeeBps' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `facility_payments_facility_reference_unique` ON `facility_payments` (`facility_id`,`payment_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `investor_payouts_payment_id_unique` ON `investor_payouts` (`payment_id`);