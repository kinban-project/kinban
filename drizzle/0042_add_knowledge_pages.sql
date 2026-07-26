CREATE TABLE `knowledge_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `name` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_folder_group_name_idx` ON `knowledge_folders` (`group_id`,`name`);
--> statement-breakpoint
CREATE TABLE `knowledge_pages` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `folder_id` text NOT NULL,
  `author_email` text NOT NULL,
  `title` text NOT NULL,
  `body` text DEFAULT '' NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `image_url` text,
  `image_alt` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_page_group_folder_idx` ON `knowledge_pages` (`group_id`,`folder_id`,`updated_at`);
