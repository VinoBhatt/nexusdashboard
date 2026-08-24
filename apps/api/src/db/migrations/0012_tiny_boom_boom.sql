CREATE TABLE `kyc_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status_from` text,
	`status_to` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`reason_code` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kyc_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`full_name` text NOT NULL,
	`ic_number` text,
	`dob` text,
	`nationality` text,
	`address` text,
	`gender` text,
	`ocr_overridden` integer DEFAULT false NOT NULL,
	`face_match_score` integer,
	`liveness_passed` integer,
	`jpn_verified` integer,
	`aml_confidence_score` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`verified_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kyc_profiles_user_id_unique` ON `kyc_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cif_id` text NOT NULL,
	`cif_type` text NOT NULL,
	`wallet_type` text NOT NULL,
	`wallet_address` text NOT NULL,
	`chain_id` text DEFAULT 'Arbitrum' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallets_wallet_address_unique` ON `wallets` (`wallet_address`);--> statement-breakpoint
ALTER TABLE `approvals` ADD `confidence_score` integer;--> statement-breakpoint
ALTER TABLE `approvals` ADD `flagged_reason` text;--> statement-breakpoint
ALTER TABLE `approvals` ADD `ctos_result_json` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `risk_profile_tier` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `annual_review_due` text;