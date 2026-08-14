CREATE TABLE IF NOT EXISTS `group_duties` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `display_order` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `group_duties_group_idx` ON `group_duties` (`group_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `member_duties` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `user_email` text NOT NULL,
  `duty_id` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `member_duties_unique_idx` ON `member_duties` (`group_id`,`user_email`,`duty_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `member_duties_duty_idx` ON `member_duties` (`group_id`,`duty_id`);
--> statement-breakpoint
ALTER TABLE `shift_slots` ADD COLUMN `duty_id` text;
--> statement-breakpoint
ALTER TABLE `shift_slots` ADD COLUMN `duty_name_snapshot` text;
