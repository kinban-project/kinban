ALTER TABLE `groups` ADD COLUMN `memo_enabled` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `groups` ADD COLUMN `knowledge_enabled` integer NOT NULL DEFAULT 1;
