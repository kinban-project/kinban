CREATE TABLE IF NOT EXISTS `calendar_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `user_email` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `token_prefix` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `last_used_at` text,
  `revoked_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `calendar_subscription_group_user_idx` ON `calendar_subscriptions` (`group_id`,`user_email`);
