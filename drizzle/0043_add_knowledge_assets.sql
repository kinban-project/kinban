CREATE TABLE `knowledge_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `object_key` text NOT NULL,
  `file_name` text NOT NULL,
  `content_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_assets_object_key_idx` ON `knowledge_assets` (`object_key`);
