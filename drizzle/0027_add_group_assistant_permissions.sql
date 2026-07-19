ALTER TABLE `group_assistants` ADD `can_create_shifts` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `group_assistants` ADD `can_publish_shifts` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `group_assistants` ADD `can_review_daily_work` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `group_assistants` ADD `can_review_monthly_work` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `group_assistants` ADD `can_create_announcements` integer DEFAULT true NOT NULL;
