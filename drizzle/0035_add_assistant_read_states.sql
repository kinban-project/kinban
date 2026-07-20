CREATE TABLE `assistant_read_states` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `reader_email` text NOT NULL,
  `member_email` text NOT NULL,
  `last_read_at` text DEFAULT '' NOT NULL
);

CREATE UNIQUE INDEX `assistant_read_state_reader_conversation_idx`
ON `assistant_read_states` (`group_id`, `reader_email`, `member_email`);
