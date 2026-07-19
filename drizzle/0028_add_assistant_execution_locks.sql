ALTER TABLE `assistant_messages` ADD `claim_id` text;
--> statement-breakpoint
CREATE TABLE `assistant_message_executions` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `message_id` text NOT NULL,
  `operation` text NOT NULL,
  `target` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_message_execution_unique_idx`
ON `assistant_message_executions` (`message_id`, `operation`, `target`);
