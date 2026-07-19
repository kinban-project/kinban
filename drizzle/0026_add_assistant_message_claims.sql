ALTER TABLE assistant_messages ADD COLUMN claimed_at text;
ALTER TABLE assistant_messages ADD COLUMN claim_expires_at text;
CREATE INDEX IF NOT EXISTS assistant_messages_claim_idx
  ON assistant_messages (group_id, status, claim_expires_at, created_at);
