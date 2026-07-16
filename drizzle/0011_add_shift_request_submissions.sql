CREATE TABLE `shift_request_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`user_email` text NOT NULL,
	`saved_at` text NOT NULL
);
