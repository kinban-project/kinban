CREATE TABLE `shift_availability` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `user_email` text NOT NULL,
  `day_of_week` integer NOT NULL,
  `status` text DEFAULT 'available' NOT NULL,
  `start_time` text DEFAULT '' NOT NULL,
  `end_time` text DEFAULT '' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_request_periods` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `plan_id` text NOT NULL,
  `name` text NOT NULL,
  `opens_on` text NOT NULL,
  `closes_on` text NOT NULL,
  `status` text DEFAULT 'open' NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `period_id` text NOT NULL,
  `user_email` text NOT NULL,
  `date` text NOT NULL,
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `preference` text DEFAULT 'possible' NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
