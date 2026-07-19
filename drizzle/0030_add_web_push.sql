CREATE TABLE `push_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_email` text NOT NULL,
  `endpoint` text NOT NULL,
  `p256dh` text NOT NULL,
  `auth` text NOT NULL,
  `user_agent` text DEFAULT '' NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique`
ON `push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE TABLE `push_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL,
  `user_email` text NOT NULL,
  `subscription_id` text NOT NULL,
  `status` text NOT NULL,
  `http_status` integer,
  `error_code` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_delivery_event_subscription_unique_idx`
ON `push_deliveries` (`event_id`, `subscription_id`);
--> statement-breakpoint
CREATE INDEX `push_delivery_user_created_idx`
ON `push_deliveries` (`user_email`, `created_at`);
