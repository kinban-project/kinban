CREATE TABLE IF NOT EXISTS `site_users` (
  `id` text PRIMARY KEY NOT NULL,
  `user_email` text NOT NULL UNIQUE,
  `display_name` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'invited',
  `is_site_admin` integer NOT NULL DEFAULT 0,
  `can_create_groups` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `site_invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `invited_by` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `status` text NOT NULL DEFAULT 'pending',
  `expires_at` text NOT NULL,
  `accepted_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS `site_invitation_email_status_idx`
  ON `site_invitations` (`email`, `status`);

ALTER TABLE `groups` ADD COLUMN `visibility` text NOT NULL DEFAULT 'private';
ALTER TABLE `groups` ADD COLUMN `participation_mode` text NOT NULL DEFAULT 'invite_only';

CREATE TABLE IF NOT EXISTS `group_invitations` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `invitee_email` text NOT NULL,
  `invited_by` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `expires_at` text NOT NULL,
  `accepted_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`group_id`, `invitee_email`, `status`)
);
CREATE INDEX IF NOT EXISTS `group_invitation_email_status_idx`
  ON `group_invitations` (`invitee_email`, `status`);
