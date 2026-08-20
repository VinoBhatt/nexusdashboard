ALTER TABLE `investor_profiles` ADD `investor_ref_no` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `contact_number` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `identification_type` text DEFAULT 'NRIC';--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `identification_number` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `job_title` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `company_name` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `nature_of_business` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `bank_name` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `bank_account_holder` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `bank_account_number` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `address_line1` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `address_line2` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `city` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `country` text DEFAULT 'Malaysia';--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `state` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `postcode` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `referral_code` text;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `declaration_accepted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `investor_profiles` ADD `profile_updated_at` integer;