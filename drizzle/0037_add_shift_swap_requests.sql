ALTER TABLE `assistant_announcement_drafts` ADD COLUMN `swap_request_id` text;

CREATE TABLE IF NOT EXISTS `shift_swap_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `source_message_id` text NOT NULL UNIQUE,
  `requester_email` text NOT NULL,
  `plan_id` text NOT NULL,
  `slot_id` text NOT NULL,
  `date` text NOT NULL,
  `start_time` text NOT NULL,
  `end_time` text NOT NULL,
  `role` text NOT NULL DEFAULT '',
  `reason` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'needs_review',
  `announcement_id` text,
  `replacement_email` text,
  `manager_note` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `reviewed_by` text,
  `confirmed_at` text,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS `shift_swap_request_group_status_idx`
  ON `shift_swap_requests` (`group_id`, `status`, `created_at`);

CREATE TABLE IF NOT EXISTS `shift_swap_candidates` (
  `id` text PRIMARY KEY NOT NULL,
  `request_id` text NOT NULL,
  `group_id` text NOT NULL,
  `member_email` text NOT NULL,
  `status` text NOT NULL,
  `note` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`request_id`, `member_email`)
);
CREATE INDEX IF NOT EXISTS `shift_swap_candidate_request_idx`
  ON `shift_swap_candidates` (`request_id`, `status`);
