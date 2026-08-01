CREATE TABLE IF NOT EXISTS `shift_assignment_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `plan_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text DEFAULT '' NOT NULL,
  `created_by` text NOT NULL,
  `seed` text DEFAULT '' NOT NULL,
  `settings_json` text DEFAULT '{}' NOT NULL,
  `base_version` integer DEFAULT 1 NOT NULL,
  `assignments_json` text DEFAULT '{}' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `shift_assignment_scenario_plan_idx` ON `shift_assignment_scenarios` (`plan_id`,`updated_at`);
