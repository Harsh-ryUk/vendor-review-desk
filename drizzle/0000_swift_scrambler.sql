CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`company` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`tax_id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`account_key` text NOT NULL,
	`bank_code` text NOT NULL,
	`run_id` text NOT NULL,
	`created_at` text NOT NULL
);
