ALTER TABLE `groups` ADD COLUMN `auto_break_suggestion` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `work_records` ADD COLUMN `planned_break_minutes` integer NOT NULL DEFAULT 0;
