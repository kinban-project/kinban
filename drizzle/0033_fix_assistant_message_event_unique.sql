DROP INDEX IF EXISTS assistant_message_event_recipient_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS assistant_message_event_recipient_unique_idx
  ON assistant_messages(group_id, member_email, event_id)
  WHERE event_id <> '';
