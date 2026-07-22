CREATE TABLE IF NOT EXISTS `auth_identities` (
  `id` text PRIMARY KEY NOT NULL,
  `site_user_id` text NOT NULL,
  `provider` text NOT NULL,
  `provider_subject` text NOT NULL,
  `verified_email` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`provider`, `provider_subject`)
);

CREATE TABLE IF NOT EXISTS `site_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `site_user_id` text NOT NULL,
  `session_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
