CREATE TABLE `assistant_announcement_drafts` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `source_message_id` text NOT NULL,
  `requester_email` text NOT NULL,
  `slot_id` text NOT NULL,
  `date` text NOT NULL,
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `role` text DEFAULT '' NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `status` text DEFAULT 'needs_review' NOT NULL,
  `manager_note` text DEFAULT '' NOT NULL,
  `announcement_id` text,
  `created_by` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_announcement_drafts_source_message_id_unique`
ON `assistant_announcement_drafts` (`source_message_id`);
--> statement-breakpoint
CREATE INDEX `assistant_announcement_draft_group_status_idx`
ON `assistant_announcement_drafts` (`group_id`, `status`, `created_at`);
