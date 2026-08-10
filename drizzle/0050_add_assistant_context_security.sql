ALTER TABLE assistant_contexts ADD COLUMN audience TEXT NOT NULL DEFAULT 'agent-runtime';
ALTER TABLE assistant_contexts ADD COLUMN scopes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE assistant_contexts ADD COLUMN revoked_at TEXT;
CREATE INDEX IF NOT EXISTS assistant_contexts_token_expiry_idx ON assistant_contexts (token_hash, expires_at);
