ALTER TABLE `groups` ADD COLUMN `labor_planned_break_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_daily_hours_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_weekly_hours_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_rest_interval_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_consecutive_days_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_weekly_rest_warning` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_daily_hours_limit_minutes` integer NOT NULL DEFAULT 480;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_weekly_hours_limit_minutes` integer NOT NULL DEFAULT 2400;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_rest_interval_minutes` integer NOT NULL DEFAULT 660;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_consecutive_days_limit` integer NOT NULL DEFAULT 6;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_weekly_rest_days_required` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `labor_four_week_rest_days_required` integer NOT NULL DEFAULT 4;
