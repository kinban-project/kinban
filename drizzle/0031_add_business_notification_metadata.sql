ALTER TABLE group_announcements ADD COLUMN notification_level text NOT NULL DEFAULT 'normal';
ALTER TABLE group_announcements ADD COLUMN category text NOT NULL DEFAULT '';

ALTER TABLE assistant_messages ADD COLUMN event_type text NOT NULL DEFAULT '';
ALTER TABLE assistant_messages ADD COLUMN event_id text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS assistant_message_event_recipient_unique_idx
  ON assistant_messages(group_id, member_email, event_id)
  WHERE event_id <> '';
