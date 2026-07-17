CREATE TABLE `monthly_work_claims` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `user_email` text NOT NULL,
  `month_key` text NOT NULL,
  `status` text DEFAULT 'unsubmitted' NOT NULL,
  `submitted_at` text,
  `approved_at` text,
  `approved_by` text,
  `manager_note` text DEFAULT '' NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
