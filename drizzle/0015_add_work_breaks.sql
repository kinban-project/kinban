CREATE TABLE `work_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`work_record_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
