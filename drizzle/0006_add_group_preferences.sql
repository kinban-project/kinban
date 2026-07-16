CREATE TABLE `group_preferences` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `user_email` text NOT NULL,
  `min_days` integer DEFAULT 0 NOT NULL,
  `max_days` integer DEFAULT 7 NOT NULL,
  `min_hours` integer DEFAULT 0 NOT NULL,
  `max_hours` integer DEFAULT 40 NOT NULL,
  `weekend_policy` text DEFAULT 'any' NOT NULL,
  `free_comment` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
