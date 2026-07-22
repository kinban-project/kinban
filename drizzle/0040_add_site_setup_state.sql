CREATE TABLE IF NOT EXISTS `site_setup_state` (
  `id` text PRIMARY KEY NOT NULL,
  `completed_at` text,
  `completed_by` text
);
