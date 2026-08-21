ALTER TABLE `orders` ADD `secondary_listing_id` text REFERENCES secondary_listings(id);--> statement-breakpoint
ALTER TABLE `orders` ADD `units` real;