CREATE TABLE `group_assistants` (
  `group_id` text PRIMARY KEY NOT NULL,
  `display_name` text DEFAULT 'KINBANアシスタント' NOT NULL,
  `role` text DEFAULT 'editor' NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE `assistant_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `member_email` text NOT NULL,
  `sender_type` text DEFAULT 'member' NOT NULL,
  `sender_email` text,
  `body` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX `assistant_messages_group_member_created_idx`
ON `assistant_messages` (`group_id`, `member_email`, `created_at`);

INSERT INTO `group_assistants` (`group_id`)
SELECT `id` FROM `groups`;
