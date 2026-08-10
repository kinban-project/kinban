CREATE TABLE IF NOT EXISTS `agent_usage_records` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text,
  `actor_email` text DEFAULT '' NOT NULL,
  `user_category` text DEFAULT 'unknown' NOT NULL,
  `model` text NOT NULL,
  `status` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text NOT NULL,
  `duration_ms` integer DEFAULT 0 NOT NULL,
  `input_tokens` integer,
  `output_tokens` integer,
  `total_tokens` integer,
  `reasoning_tokens` integer,
  `cached_input_tokens` integer,
  `pricing_profile_id` text NOT NULL,
  `jpy_per_usd` integer DEFAULT 160 NOT NULL,
  `estimated_usd_micros` integer,
  `estimated_jpy_micros` integer,
  `error_message` text DEFAULT '' NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_usage_group_created_idx` ON `agent_usage_records` (`group_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_usage_model_created_idx` ON `agent_usage_records` (`model`,`created_at`);
