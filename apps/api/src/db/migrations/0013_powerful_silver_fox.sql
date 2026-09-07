CREATE TABLE `campaign_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`payment_to` text,
	`fund_disbursement_date` text,
	`settlement_amount` real,
	`fund_refunded_date` text,
	`remark` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_settlements_facility_id_unique` ON `campaign_settlements` (`facility_id`);--> statement-breakpoint
CREATE TABLE `issuer_board_members` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer_user_id` text NOT NULL,
	`name` text NOT NULL,
	`salutation` text,
	`identity_prefix` text DEFAULT 'NRIC',
	`identity_number` text,
	`dob` text,
	`gender` text,
	`nationality` text,
	`address` text,
	`address_state` text,
	`address_postcode` text,
	`designation` text,
	`designation_other` text,
	`appointment_date` text,
	`resignation_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`issuer_user_id`) REFERENCES `issuer_profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issuer_financials` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer_user_id` text NOT NULL,
	`period_label` text NOT NULL,
	`assets_current_rm` real,
	`assets_non_current_rm` real,
	`liab_current_borrowing_rm` real,
	`liab_current_non_borrowing_rm` real,
	`liab_non_current_loan_rm` real,
	`liab_non_current_non_loan_rm` real,
	`equity_capital_rm` real,
	`equity_share_application_rm` real,
	`equity_share_premium_rm` real,
	`equity_accumulated_profit_rm` real,
	`equity_minority_interest_rm` real,
	`total_revenue_rm` real,
	`operating_cost_rm` real,
	`administrative_cost_rm` real,
	`interest_cost_rm` real,
	`other_cost_rm` real,
	`profit_loss_before_tax_rm` real,
	`profit_loss_after_tax_rm` real,
	`minority_interest_rm` real,
	`net_dividend_rm` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`issuer_user_id`) REFERENCES `issuer_profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issuer_shareholders` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer_user_id` text NOT NULL,
	`shareholder_type` text DEFAULT 'Individual' NOT NULL,
	`shareholder_name` text NOT NULL,
	`salutation` text,
	`identity_prefix` text DEFAULT 'NRIC',
	`identity_number` text,
	`dob` text,
	`gender` text,
	`nationality` text,
	`address` text,
	`address_state` text,
	`address_postcode` text,
	`share_type` text,
	`share_type_other` text,
	`shareholding_units` real,
	`shareholding_amount` real,
	`shareholding_percentage` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`issuer_user_id`) REFERENCES `issuer_profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reschedule_restructure_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`facility_id` text NOT NULL,
	`rr_campaign_id` text,
	`interest_rate_pct` real,
	`tenure_original_months` integer,
	`tenure_rr_months` integer,
	`commencement_date_rr` text,
	`financing_amount_original` real,
	`rr_amount_revised` real,
	`rr_payment_structure` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`facility_id`) REFERENCES `financing_facilities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `campaign_description` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `campaign_application_date` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `campaign_approval_date` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `campaign_url` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `campaign_sector` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `sustainability_category` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `type_of_investment_notes` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `shariah_adviser_name` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `purpose_of_fund_raising` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `purpose_of_fund_raising_other` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `remark` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `is_sarana_scheme` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `sarana_financing_options` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `sarana_financing_scope` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `target_financing_amount` real;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `financing_security` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `issuer_interest_rate_effective` real;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `investor_return_rate_simple` real;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `investor_return_rate_effective` real;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `default_classification` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `default_classification_other` text;--> statement-breakpoint
ALTER TABLE `financing_facilities` ADD `actual_due_repayment_date` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `issuer_id_code` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `date_of_incorporation` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `date_of_commencement` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `country_of_incorporation` text DEFAULT 'Malaysia';--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `type_of_company` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `registered_address_state` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `registered_address_postcode` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `business_address` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `business_address_state` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `business_address_postcode` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `phone_number` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `website` text;--> statement-breakpoint
ALTER TABLE `issuer_profiles` ADD `company_activities` text;