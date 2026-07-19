ALTER TABLE `api_tokens` ADD `token_type` text DEFAULT 'personal' NOT NULL;
ALTER TABLE `api_tokens` ADD `group_id` text;
ALTER TABLE `api_tokens` ADD `scopes` text DEFAULT '[]' NOT NULL;

CREATE TABLE `mcp_confirmations` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `group_id` text NOT NULL,
  `action` text NOT NULL,
  `entity_id` text DEFAULT '' NOT NULL,
  `issued_by` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX `mcp_confirmations_lookup_idx`
ON `mcp_confirmations` (`group_id`, `action`, `entity_id`, `used_at`, `expires_at`);
