ALTER TABLE `work_records` ADD `active_key` text;
CREATE UNIQUE INDEX `work_records_active_key_unique` ON `work_records` (`active_key`) WHERE `active_key` IS NOT NULL;
