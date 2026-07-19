ALTER TABLE assistant_message_executions ADD COLUMN status text NOT NULL DEFAULT 'processing';
ALTER TABLE assistant_message_executions ADD COLUMN error_code text NOT NULL DEFAULT '';
ALTER TABLE assistant_message_executions ADD COLUMN attempt_count integer NOT NULL DEFAULT 1;
ALTER TABLE assistant_message_executions ADD COLUMN updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP;
