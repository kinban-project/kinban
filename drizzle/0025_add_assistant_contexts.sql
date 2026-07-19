CREATE TABLE IF NOT EXISTS assistant_contexts (
  id text PRIMARY KEY NOT NULL,
  token_hash text NOT NULL UNIQUE,
  group_id text NOT NULL,
  mode text NOT NULL,
  member_email text,
  message_id text,
  issued_by text NOT NULL,
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS assistant_contexts_group_expires_idx
  ON assistant_contexts (group_id, expires_at);
