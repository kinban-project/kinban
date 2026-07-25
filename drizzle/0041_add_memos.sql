CREATE TABLE IF NOT EXISTS `memo_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `name` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `memo_folder_group_name_idx` ON `memo_folders` (`group_id`,`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `memos` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `folder_id` text NOT NULL,
  `author_email` text NOT NULL,
  `target_date` text NOT NULL DEFAULT '',
  `title` text NOT NULL,
  `body` text NOT NULL DEFAULT '',
  `visibility` text NOT NULL DEFAULT 'group',
  `deleted_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memo_group_folder_date_idx` ON `memos` (`group_id`,`folder_id`,`target_date`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `memo_group_updated_idx` ON `memos` (`group_id`,`updated_at`);
