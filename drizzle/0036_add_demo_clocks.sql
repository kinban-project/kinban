CREATE TABLE IF NOT EXISTS `demo_clocks` (
  `scope` text PRIMARY KEY NOT NULL,
  `current_at` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
