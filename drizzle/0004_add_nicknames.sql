CREATE TABLE `account_profiles` (
  `user_email` text PRIMARY KEY NOT NULL,
  `nickname` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE `group_members` ADD `display_name` text;
