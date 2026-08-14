-- My Day local scenario seed
-- 7/1-7/31: completed and published shift fixtures
-- 8/1-8/15: shift-request acceptance fixture (closes 7/30)

CREATE TABLE IF NOT EXISTS knowledge_folders (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_folder_group_name_idx ON knowledge_folders(group_id, name);
CREATE TABLE IF NOT EXISTS knowledge_pages (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  author_email TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  image_url TEXT,
  image_alt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS knowledge_page_group_folder_idx ON knowledge_pages(group_id, folder_id, updated_at);
CREATE TABLE IF NOT EXISTS knowledge_assets (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calendar_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_subscription_group_user_idx
  ON calendar_subscriptions(group_id, user_email);

CREATE TABLE IF NOT EXISTS shift_assignment_scenarios (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  seed TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  base_version INTEGER NOT NULL DEFAULT 1,
  assignments_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS shift_assignment_scenario_plan_idx
  ON shift_assignment_scenarios(plan_id, updated_at);

CREATE TABLE IF NOT EXISTS agent_usage_records (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT,
  actor_email TEXT DEFAULT '' NOT NULL,
  user_category TEXT DEFAULT 'unknown' NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0 NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  reasoning_tokens INTEGER,
  cached_input_tokens INTEGER,
  pricing_profile_id TEXT NOT NULL,
  jpy_per_usd INTEGER DEFAULT 160 NOT NULL,
  estimated_usd_micros INTEGER,
  estimated_jpy_micros INTEGER,
  error_message TEXT DEFAULT '' NOT NULL,
  metadata_json TEXT DEFAULT '{}' NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DELETE FROM work_breaks;
DELETE FROM push_deliveries;
DELETE FROM push_subscriptions;
DELETE FROM monthly_work_claims;
DELETE FROM work_records;
DELETE FROM mcp_confirmations;
DELETE FROM assistant_contexts;
DELETE FROM assistant_message_executions;
DELETE FROM agent_usage_records;
DELETE FROM shift_swap_candidates;
DELETE FROM shift_swap_requests;
DELETE FROM assistant_announcement_drafts;
DELETE FROM assistant_messages;
DELETE FROM assistant_read_states;
DELETE FROM group_assistants;
DELETE FROM audit_logs;
DELETE FROM announcement_replies;
DELETE FROM announcement_reads;
DELETE FROM group_announcements;
DELETE FROM shift_requests;
DELETE FROM shift_request_submissions;
DELETE FROM shift_request_periods;
DELETE FROM shift_availability;
DELETE FROM group_preferences;
DELETE FROM shift_assignments;
DELETE FROM shift_assignment_scenarios;
DELETE FROM shift_slots;
DELETE FROM shift_plans;
DELETE FROM events;
DELETE FROM group_join_requests;
DELETE FROM group_members;
DELETE FROM groups;
DELETE FROM account_profiles;
DELETE FROM api_tokens;
DELETE FROM calendar_subscriptions;
DELETE FROM demo_clocks;
DELETE FROM group_invitations;
DELETE FROM site_invitations;
DELETE FROM site_users;
DELETE FROM knowledge_pages;
DELETE FROM knowledge_folders;
DELETE FROM memos;
DELETE FROM memo_folders;
DELETE FROM knowledge_assets;

INSERT INTO demo_clocks (scope, current_at) VALUES
  ('public-demo', '2026-07-21T09:00:00+09:00');

INSERT INTO account_profiles (user_email, nickname) VALUES
  ('tanaka@local.test', '店長'),
  ('member01@local.test', '副店長'),
  ('member02@local.test', '学生A'),
  ('member03@local.test', '学生B'),
  ('member04@local.test', '主婦A'),
  ('member05@local.test', '主婦B'),
  ('member06@local.test', 'フリーターA'),
  ('member07@local.test', 'フリーターB'),
  ('member08@local.test', 'パートA'),
  ('member09@local.test', 'パートB'),
  ('reserve-manager@local.test', '予備管理者'),
  ('reserve-member-1@local.test', '予備メンバー1'),
  ('reserve-member-2@local.test', '予備メンバー2'),
  ('reserve-member-3@local.test', '予備メンバー3');

INSERT INTO site_users (id, user_email, display_name, status, is_site_admin, can_create_groups) VALUES
  ('seed-site-owner', 'tanaka@local.test', '店長', 'active', 1, 1),
  ('seed-site-editor', 'member01@local.test', '副店長', 'active', 0, 1),
  ('seed-site-member-02', 'member02@local.test', '学生A', 'active', 0, 0),
  ('seed-site-member-03', 'member03@local.test', '学生B', 'active', 0, 0),
  ('seed-site-member-04', 'member04@local.test', '主婦A', 'active', 0, 0),
  ('seed-site-member-05', 'member05@local.test', '主婦B', 'active', 0, 0),
  ('seed-site-member-06', 'member06@local.test', 'フリーターA', 'active', 0, 0),
  ('seed-site-member-07', 'member07@local.test', 'フリーターB', 'active', 0, 0),
  ('seed-site-member-08', 'member08@local.test', 'パートA', 'active', 0, 0),
  ('seed-site-member-09', 'member09@local.test', 'パートB', 'active', 0, 0),
  ('seed-site-reserve-manager', 'reserve-manager@local.test', '予備管理者', 'active', 0, 0),
  ('seed-site-reserve-member-1', 'reserve-member-1@local.test', '予備メンバー1', 'active', 0, 0),
  ('seed-site-reserve-member-2', 'reserve-member-2@local.test', '予備メンバー2', 'active', 0, 0),
  ('seed-site-reserve-member-3', 'reserve-member-3@local.test', '予備メンバー3', 'active', 0, 0),
  ('seed-site-night-manager', 'night-manager@local.test', '店長（ナイトクラブ）', 'active', 0, 1),
  ('seed-site-night-staff-a', 'night-staff-a@local.test', 'スタッフA', 'active', 0, 0),
  ('seed-site-night-staff-b', 'night-staff-b@local.test', 'スタッフB', 'active', 0, 0),
  ('seed-site-night-staff-c', 'night-staff-c@local.test', 'スタッフC', 'active', 0, 0),
  ('seed-site-night-cast-a', 'night-cast-a@local.test', 'キャストA', 'active', 0, 0),
  ('seed-site-night-cast-b', 'night-cast-b@local.test', 'キャストB', 'active', 0, 0),
  ('seed-site-night-cast-c', 'night-cast-c@local.test', 'キャストC', 'active', 0, 0),
  ('seed-site-night-cast-d', 'night-cast-d@local.test', 'キャストD', 'active', 0, 0),
  ('seed-site-night-cast-e', 'night-cast-e@local.test', 'キャストE', 'active', 0, 0),
  ('seed-site-night-cast-f', 'night-cast-f@local.test', 'キャストF', 'active', 0, 0);

INSERT INTO groups (id, name, description, owner_email, labor_consecutive_days_limit) VALUES
  ('seed-group-store', 'サンプル店', '勤務枠・シフト・勤務申告のテスト用グループ', 'tanaka@local.test', 7);

-- Local seed only. The raw key is documented in kinban-manager-agent/.env.example.
-- Do not use this key outside the local development database.
INSERT INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-store', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);

INSERT INTO api_tokens (id, owner_email, name, token_type, group_id, scopes, token_hash, token_prefix) VALUES
  ('seed-token-assistant-local', 'tanaka@local.test', 'ローカルシード用 運営支援APIキー', 'assistant', 'seed-group-store',
   '["assistant:read","assistant:reply","shift:read","work:read","announcement:read","agent:usage:write"]',
   '9a9bbd08d3ca4272e0cb36b76dab96b2484f7dc4b4e732795ee65bb9dcd81bc1', 'mcp_local_s');

INSERT INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-member-owner', 'seed-group-store', 'tanaka@local.test', '店長', '代表管理者。月次締めを実行できます。', 'owner', 'active', 1),
  ('seed-member-01', 'seed-group-store', 'member01@local.test', '副店長', '日々の承認担当。', 'editor', 'active', 1),
  ('seed-member-02', 'seed-group-store', 'member02@local.test', '学生A', '土日と夕方を希望。22時以降は不可。', 'member', 'active', 1),
  ('seed-member-03', 'seed-group-store', 'member03@local.test', '学生B', '平日夕方を希望。試験期間は短時間。', 'member', 'active', 1),
  ('seed-member-04', 'seed-group-store', 'member04@local.test', '主婦A', '平日日中を希望。土日は休み希望。', 'member', 'active', 1),
  ('seed-member-05', 'seed-group-store', 'member05@local.test', '主婦B', '平日日中を中心に希望。', 'member', 'active', 1),
  ('seed-member-06', 'seed-group-store', 'member06@local.test', 'フリーターA', '夕方以降を中心に希望。', 'member', 'active', 1),
  ('seed-member-07', 'seed-group-store', 'member07@local.test', 'フリーターB', '深夜帯も対応可能。', 'member', 'active', 1),
  ('seed-member-08', 'seed-group-store', 'member08@local.test', 'パートA', '週3日程度。', 'member', 'active', 1),
  ('seed-member-09', 'seed-group-store', 'member09@local.test', 'パートB', '曜日相談可。', 'member', 'active', 1),
  ('seed-member-reserve-manager', 'seed-group-store', 'reserve-manager@local.test', '予備管理者', '初期状態は利用停止。解除後は管理者候補として全時間帯・週7日まで勤務可能。', 'editor', 'inactive', 1),
  ('seed-member-reserve-1', 'seed-group-store', 'reserve-member-1@local.test', '予備メンバー1', '初期状態は利用停止。解除後は全時間帯・週7日まで勤務可能。', 'member', 'inactive', 1),
  ('seed-member-reserve-2', 'seed-group-store', 'reserve-member-2@local.test', '予備メンバー2', '初期状態は利用停止。解除後は全時間帯・週7日まで勤務可能。', 'member', 'inactive', 1),
  ('seed-member-reserve-3', 'seed-group-store', 'reserve-member-3@local.test', '予備メンバー3', '初期状態は利用停止。解除後は全時間帯・週7日まで勤務可能。', 'member', 'inactive', 1);

-- 管理者メモ: 同じシフトに入れると会話が長くなりやすいため、主婦A・主婦Bは可能なら別日に配置する。
UPDATE group_members
SET admin_note = '平日日中を希望。主婦Bとは会話が弾みやすいため、可能なら同じシフトを避ける。'
WHERE id = 'seed-member-04';
UPDATE group_members
SET admin_note = '平日日中を希望。主婦Aとは会話が弾みやすいため、可能なら同じシフトを避ける。'
WHERE id = 'seed-member-05';

-- 飲食店の担当適性: 店長・副店長・フリーターAはホール／厨房の両方、学生・主婦・パートはホール、フリーターBは厨房。
UPDATE group_members SET admin_note = '代表管理者。ホール・厨房の両方を担当可能。' WHERE id = 'seed-member-owner';
UPDATE group_members SET admin_note = '日々の承認担当。ホール・厨房の両方を担当可能。' WHERE id = 'seed-member-01';
UPDATE group_members SET admin_note = '土日と夕方を希望。22時以降は不可。担当はホール。' WHERE id = 'seed-member-02';
UPDATE group_members SET admin_note = '平日夕方を希望。試験期間は短時間。担当はホール。' WHERE id = 'seed-member-03';
UPDATE group_members SET admin_note = '平日日中を希望。主婦Bとは会話が弾みやすいため、可能なら同じシフトを避ける。担当はホール。' WHERE id = 'seed-member-04';
UPDATE group_members SET admin_note = '平日日中を希望。主婦Aとは会話が弾みやすいため、可能なら同じシフトを避ける。担当はホール。' WHERE id = 'seed-member-05';
UPDATE group_members SET admin_note = '夕方以降を中心に希望。ホール・厨房の両方を担当可能。' WHERE id = 'seed-member-06';
UPDATE group_members SET admin_note = '深夜帯も対応可能。担当は厨房。' WHERE id = 'seed-member-07';
UPDATE group_members SET admin_note = '週3日程度。担当はホール。' WHERE id = 'seed-member-08';
UPDATE group_members SET admin_note = '曜日相談可。担当はホール。' WHERE id = 'seed-member-09';

INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-pref-owner', 'seed-group-store', 'tanaka@local.test', 5, 6, 40, 60, 'any', '店舗運営のため曜日・時間は柔軟に調整可能。'),
  ('seed-pref-01', 'seed-group-store', 'member01@local.test', 5, 6, 40, 60, 'any', '副店長。全時間帯を調整可能。'),
  ('seed-pref-02', 'seed-group-store', 'member02@local.test', 2, 4, 8, 20, 'prefer_off', '土日と夕方を希望。22時以降は勤務不可。'),
  ('seed-pref-03', 'seed-group-store', 'member03@local.test', 2, 4, 8, 20, 'prefer_off', '平日夕方を希望。試験期間は短時間。'),
  ('seed-pref-04', 'seed-group-store', 'member04@local.test', 2, 3, 8, 16, 'prefer_off', '平日日中を希望。土日は休み希望。'),
  ('seed-pref-05', 'seed-group-store', 'member05@local.test', 3, 4, 12, 24, 'prefer_off', '平日日中を中心に希望。'),
  ('seed-pref-06', 'seed-group-store', 'member06@local.test', 4, 5, 24, 36, 'any', '夕方以降を中心に希望。'),
  ('seed-pref-07', 'seed-group-store', 'member07@local.test', 4, 5, 24, 36, 'any', '深夜帯も対応可能。'),
  ('seed-pref-08', 'seed-group-store', 'member08@local.test', 3, 4, 16, 28, 'any', '週3日程度。曜日相談可。'),
  ('seed-pref-09', 'seed-group-store', 'member09@local.test', 3, 5, 20, 36, 'any', '曜日は柔軟に相談可能。'),
  ('seed-pref-reserve-manager', 'seed-group-store', 'reserve-manager@local.test', 0, 7, 0, 80, 'any', '予備管理者。全時間帯勤務可能。希望日数・時間は柔軟に調整。初期状態は利用停止。'),
  ('seed-pref-reserve-1', 'seed-group-store', 'reserve-member-1@local.test', 0, 7, 0, 80, 'any', '予備メンバー1。全時間帯勤務可能。希望日数・時間は柔軟に調整。初期状態は利用停止。'),
  ('seed-pref-reserve-2', 'seed-group-store', 'reserve-member-2@local.test', 0, 7, 0, 80, 'any', '予備メンバー2。全時間帯勤務可能。希望日数・時間は柔軟に調整。初期状態は利用停止。'),
  ('seed-pref-reserve-3', 'seed-group-store', 'reserve-member-3@local.test', 0, 7, 0, 80, 'any', '予備メンバー3。全時間帯勤務可能。希望日数・時間は柔軟に調整。初期状態は利用停止。');

WITH users(user_email) AS (VALUES
  ('tanaka@local.test'), ('member01@local.test'), ('member02@local.test'), ('member03@local.test'),
  ('member04@local.test'), ('member05@local.test'), ('member06@local.test'), ('member07@local.test'),
  ('member08@local.test'), ('member09@local.test'), ('reserve-manager@local.test'),
  ('reserve-member-1@local.test'), ('reserve-member-2@local.test'), ('reserve-member-3@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT lower(hex(randomblob(16))), 'seed-group-store', users.user_email, days.day_of_week,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN 'want'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') AND days.day_of_week IN (0, 6) THEN 'want'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN 'possible'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') AND days.day_of_week BETWEEN 1 AND 5 THEN 'want'
    WHEN users.user_email IN ('member06@local.test', 'member07@local.test', 'member08@local.test', 'member09@local.test') THEN 'possible'
    WHEN users.user_email IN ('reserve-manager@local.test', 'reserve-member-1@local.test', 'reserve-member-2@local.test', 'reserve-member-3@local.test') THEN 'possible'
    ELSE 'unavailable'
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '09:30'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN '17:00'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') THEN '09:30'
    WHEN users.user_email IN ('reserve-manager@local.test', 'reserve-member-1@local.test', 'reserve-member-2@local.test', 'reserve-member-3@local.test') THEN '00:00'
    ELSE '17:00'
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '30:00'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN '22:00'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') THEN '17:00'
    WHEN users.user_email IN ('reserve-manager@local.test', 'reserve-member-1@local.test', 'reserve-member-2@local.test', 'reserve-member-3@local.test') THEN '30:00'
    ELSE '30:00'
  END,
  CASE
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN '夕方中心。22時以降は不可。'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') THEN '平日日中を希望。'
    WHEN users.user_email IN ('member06@local.test', 'member07@local.test') THEN '夕方・深夜も対応可能。'
    ELSE ''
  END
FROM users CROSS JOIN days;

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-plan-june', 'seed-group-store', '6月末締めテスト', '2026-06-30', '2026-06-30', '09:30', '26:00', 30, 1, '月末締め操作を確認するための1日分データです。', 'published', 'tanaka@local.test'),
  ('seed-plan-first-half', 'seed-group-store', '7月前半シフト', '2026-07-01', '2026-07-15', '09:30', '26:00', 30, 1, '終了済みの通常運用データです。', 'published', 'tanaka@local.test'),
  ('seed-plan-second-half', 'seed-group-store', '7月後半シフト', '2026-07-16', '2026-07-31', '09:30', '26:00', 30, 1, '公開済み。個人カレンダーにも担当予定を反映します。', 'published', 'tanaka@local.test'),
  ('seed-plan-august-first', 'seed-group-store', '8月前半シフト', '2026-08-01', '2026-08-15', '09:30', '26:00', 30, 1, '希望受付中。締切は7月30日です。', 'draft', 'tanaka@local.test');

WITH dates(date) AS (SELECT '2026-06-30'),
slot_defs(start_time, end_time, role, required_count) AS (VALUES
  ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
  ('17:00', '22:00', 'ホール', 1), ('17:00', '22:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-june-' || lower(hex(randomblob(8))), 'seed-plan-june', dates.date, start_time, end_time, required_count, role
FROM dates CROSS JOIN slot_defs;

WITH RECURSIVE dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-15'),
slot_defs(start_time, end_time, role, required_count) AS (VALUES
  ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
  ('14:00', '17:00', 'ホール', 1), ('14:00', '17:00', '厨房', 1),
  ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2),
  ('22:00', '26:00', 'ホール', 1), ('22:00', '26:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-july1-' || lower(hex(randomblob(8))), 'seed-plan-first-half', dates.date, start_time, end_time, required_count, role
FROM dates CROSS JOIN slot_defs;

WITH RECURSIVE dates(date) AS (SELECT '2026-07-16' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31'),
slot_defs(start_time, end_time, role, required_count) AS (VALUES
  ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
  ('14:00', '17:00', 'ホール', 1), ('14:00', '17:00', '厨房', 1),
  ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2),
  ('22:00', '26:00', 'ホール', 1), ('22:00', '26:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-july2-' || lower(hex(randomblob(8))), 'seed-plan-second-half', dates.date, start_time, end_time, required_count, role
FROM dates CROSS JOIN slot_defs;

WITH RECURSIVE dates(date) AS (SELECT '2026-08-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'),
slot_defs(start_time, end_time, role, required_count) AS (VALUES
  ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
  ('14:00', '17:00', 'ホール', 1), ('14:00', '17:00', '厨房', 1),
  ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2),
  ('22:00', '26:00', 'ホール', 1), ('22:00', '26:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-aug1-' || lower(hex(randomblob(8))), 'seed-plan-august-first', dates.date, start_time, end_time, required_count, role
FROM dates CROSS JOIN slot_defs;

WITH assignees(start_time, role, user_email) AS (VALUES
  ('09:30', 'ホール', 'tanaka@local.test'), ('09:30', 'ホール', 'member04@local.test'),
  ('09:30', '厨房', 'member01@local.test'), ('09:30', '厨房', 'member05@local.test'),
  ('14:00', 'ホール', 'member02@local.test'), ('14:00', '厨房', 'member06@local.test'),
  ('17:00', 'ホール', 'member07@local.test'), ('17:00', 'ホール', 'member08@local.test'),
  ('17:00', '厨房', 'member03@local.test'), ('17:00', '厨房', 'member09@local.test'),
  ('22:00', 'ホール', 'member06@local.test'), ('22:00', '厨房', 'member07@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email
FROM shift_slots slots JOIN assignees ON assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id IN ('seed-plan-first-half', 'seed-plan-second-half')
  AND NOT (slots.plan_id = 'seed-plan-second-half' AND slots.date = '2026-07-22' AND slots.start_time = '17:00' AND slots.role = '厨房' AND assignees.user_email = 'member03@local.test');

-- Published shifts are also represented as read-only personal calendar events.
-- This mirrors the normal publish flow so the home calendar works after a seed reset.
INSERT INTO events (id, owner_email, group_id, shift_plan_id, title, date, end_date, start_time, end_time, category, notes, completed)
SELECT
  'seed-calendar-' || slots.id,
  'tanaka@local.test',
  'seed-group-store',
  slots.plan_id,
  COALESCE(NULLIF(slots.role, ''), 'サンプル店'),
  slots.date,
  CASE WHEN CAST(substr(slots.end_time, 1, 2) AS INTEGER) >= 24 THEN date(slots.date, '+1 day') ELSE slots.date END,
  slots.start_time,
  CASE WHEN CAST(substr(slots.end_time, 1, 2) AS INTEGER) >= 24 THEN printf('%02d:%s', CAST(substr(slots.end_time, 1, 2) AS INTEGER) - 24, substr(slots.end_time, 4, 2)) ELSE slots.end_time END,
  '仕事',
  '公開済みシフト',
  0
FROM shift_slots slots
WHERE slots.plan_id IN ('seed-plan-first-half', 'seed-plan-second-half')
  AND EXISTS (SELECT 1 FROM shift_assignments assignments WHERE assignments.slot_id = slots.id);

WITH assignees(start_time, role, user_email) AS (VALUES
  ('09:30', 'ホール', 'tanaka@local.test'), ('09:30', 'ホール', 'member04@local.test'),
  ('09:30', '厨房', 'member01@local.test'), ('09:30', '厨房', 'member05@local.test'),
  ('17:00', 'ホール', 'member02@local.test'), ('17:00', '厨房', 'member03@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email
FROM shift_slots slots JOIN assignees
  ON assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id = 'seed-plan-june';

UPDATE work_records SET
  status = 'submitted',
  claimed_start_at = '2026-06-30T17:00:00+09:00',
  claimed_end_at = '2026-06-30T22:00:00+09:00',
  approved_by = NULL,
  approved_at = NULL
WHERE scheduled_date = '2026-06-30' AND user_email = 'member02@local.test';

WITH assignees(start_time, role, user_email) AS (VALUES
  ('09:30', 'ホール', 'tanaka@local.test'), ('09:30', 'ホール', 'member04@local.test'),
  ('09:30', '厨房', 'member01@local.test'), ('09:30', '厨房', 'member05@local.test'),
  ('17:00', 'ホール', 'member02@local.test'), ('17:00', '厨房', 'member03@local.test'))
INSERT INTO work_records (id, group_id, plan_id, slot_id, user_email, scheduled_date, scheduled_start_time, scheduled_end_time, started_at, ended_at, claimed_start_at, claimed_end_at, claimed_break_minutes, status, employee_note, manager_note, approved_by, approved_at)
SELECT 'wr-june-' || lower(hex(randomblob(8))), 'seed-group-store', slots.plan_id, slots.id, assignees.user_email, slots.date, slots.start_time, slots.end_time,
  CASE WHEN assignees.user_email = 'member05@local.test' THEN slots.date || 'T09:42:00+09:00' ELSE slots.date || 'T' || slots.start_time || ':00+09:00' END,
  CASE WHEN assignees.user_email = 'member04@local.test' THEN NULL ELSE slots.date || 'T' || slots.end_time || ':00+09:00' END,
  CASE WHEN assignees.user_email IN ('member02@local.test', 'member03@local.test') THEN slots.date || 'T' || slots.start_time || ':05:00+09:00' ELSE slots.date || 'T' || slots.start_time || ':00+09:00' END,
  CASE WHEN assignees.user_email = 'member04@local.test' THEN NULL ELSE slots.date || 'T' || slots.end_time || ':00+09:00' END,
  CASE WHEN assignees.user_email = 'member01@local.test' THEN 45 ELSE 0 END,
  CASE assignees.user_email WHEN 'member02@local.test' THEN 'submitted' WHEN 'member03@local.test' THEN 'rejected' WHEN 'member04@local.test' THEN 'unsubmitted' WHEN 'member05@local.test' THEN 'working' ELSE 'approved' END,
  CASE assignees.user_email WHEN 'member03@local.test' THEN '開始時刻を確認して再申告してください。' WHEN 'member04@local.test' THEN '' ELSE '' END,
  CASE assignees.user_email WHEN 'member03@local.test' THEN '申告時間を確認してください。' ELSE '' END,
  CASE assignees.user_email WHEN 'member01@local.test' THEN 'member01@local.test' WHEN 'tanaka@local.test' THEN 'tanaka@local.test' ELSE NULL END,
  CASE assignees.user_email WHEN 'member01@local.test' THEN '2026-07-01T12:00:00.000Z' WHEN 'tanaka@local.test' THEN '2026-07-01T12:10:00.000Z' ELSE NULL END
FROM shift_slots slots JOIN assignees ON assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id = 'seed-plan-june';

WITH assignees(start_time, role, user_email) AS (VALUES
  ('09:30', 'ホール', 'tanaka@local.test'), ('09:30', 'ホール', 'member04@local.test'),
  ('09:30', '厨房', 'member01@local.test'), ('09:30', '厨房', 'member05@local.test'),
  ('14:00', 'ホール', 'member02@local.test'), ('14:00', '厨房', 'member06@local.test'),
  ('17:00', 'ホール', 'member07@local.test'), ('17:00', 'ホール', 'member08@local.test'),
  ('17:00', '厨房', 'member03@local.test'), ('17:00', '厨房', 'member09@local.test'),
  ('22:00', 'ホール', 'member06@local.test'), ('22:00', '厨房', 'member07@local.test'))
INSERT INTO work_records (id, group_id, plan_id, slot_id, user_email, scheduled_date, scheduled_start_time, scheduled_end_time, started_at, ended_at, claimed_start_at, claimed_end_at, claimed_break_minutes, status, employee_note, manager_note, approved_by, approved_at)
SELECT 'wr-july-' || lower(hex(randomblob(8))), 'seed-group-store', slots.plan_id, slots.id, assignees.user_email, slots.date, slots.start_time, slots.end_time,
  CASE WHEN slots.end_time = '26:00' THEN slots.date || 'T22:05:00+09:00' ELSE slots.date || 'T' || slots.start_time || ':00+09:00' END,
  CASE WHEN assignees.user_email = 'member06@local.test' AND slots.date = '2026-07-07' THEN NULL WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:05:00+09:00' ELSE slots.date || 'T' || slots.end_time || ':00+09:00' END,
  CASE WHEN slots.end_time = '26:00' THEN slots.date || 'T22:00:00+09:00' ELSE slots.date || 'T' || slots.start_time || ':05:00+09:00' END,
  CASE WHEN assignees.user_email = 'member05@local.test' AND slots.date = '2026-07-19' THEN NULL WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00' ELSE slots.date || 'T' || slots.end_time || ':00+09:00' END,
  CASE WHEN assignees.user_email = 'member04@local.test' THEN 30 ELSE 0 END,
  CASE
    WHEN slots.date = '2026-07-18' AND assignees.user_email = 'member02@local.test' THEN 'submitted'
    WHEN slots.date = '2026-07-19' AND assignees.user_email = 'member05@local.test' THEN 'unsubmitted'
    WHEN slots.date = '2026-07-20' AND assignees.user_email = 'member06@local.test' THEN 'rejected'
    WHEN slots.date = '2026-07-07' AND assignees.user_email = 'member06@local.test' THEN 'working'
    ELSE 'approved'
  END,
  CASE WHEN slots.date = '2026-07-20' AND assignees.user_email = 'member06@local.test' THEN '休憩時間を確認して再申告してください。' ELSE '' END,
  CASE WHEN slots.date = '2026-07-20' AND assignees.user_email = 'member06@local.test' THEN 'シフトとの差分を確認してください。' ELSE '' END,
  CASE WHEN NOT (slots.date = '2026-07-18' AND assignees.user_email = 'member02@local.test') AND NOT (slots.date = '2026-07-19' AND assignees.user_email = 'member05@local.test') AND NOT (slots.date = '2026-07-20' AND assignees.user_email = 'member06@local.test') AND NOT (slots.date = '2026-07-07' AND assignees.user_email = 'member06@local.test') THEN 'member01@local.test' ELSE NULL END,
  CASE WHEN NOT (slots.date = '2026-07-18' AND assignees.user_email = 'member02@local.test') AND NOT (slots.date = '2026-07-19' AND assignees.user_email = 'member05@local.test') AND NOT (slots.date = '2026-07-20' AND assignees.user_email = 'member06@local.test') AND NOT (slots.date = '2026-07-07' AND assignees.user_email = 'member06@local.test') THEN '2026-07-17T12:00:00.000Z' ELSE NULL END
FROM shift_slots slots JOIN assignees ON assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id IN ('seed-plan-first-half', 'seed-plan-second-half');

INSERT INTO work_breaks (id, work_record_id, started_at, ended_at)
SELECT 'break-' || lower(hex(randomblob(8))), id, date(scheduled_date) || 'T12:00:00+09:00', date(scheduled_date) || 'T12:45:00+09:00'
FROM work_records WHERE user_email = 'member01@local.test' AND scheduled_date = '2026-06-30';

INSERT INTO monthly_work_claims (id, group_id, user_email, month_key, status, submitted_at, approved_at, approved_by, manager_note) VALUES
  ('monthly-june-tanaka', 'seed-group-store', 'tanaka@local.test', '2026-06', 'approved', '2026-07-01T09:00:00.000Z', '2026-07-01T10:00:00.000Z', 'tanaka@local.test', '月末確認済み'),
  ('monthly-june-member01', 'seed-group-store', 'member01@local.test', '2026-06', 'approved', '2026-07-01T09:10:00.000Z', '2026-07-01T10:05:00.000Z', 'tanaka@local.test', ''),
  ('monthly-june-member02', 'seed-group-store', 'member02@local.test', '2026-06', 'submitted', '2026-07-01T09:20:00.000Z', NULL, NULL, ''),
  ('monthly-june-member03', 'seed-group-store', 'member03@local.test', '2026-06', 'rejected', '2026-07-01T09:30:00.000Z', NULL, NULL, '6月30日の申告内容を確認してください'),
  ('monthly-june-member04', 'seed-group-store', 'member04@local.test', '2026-06', 'unsubmitted', NULL, NULL, NULL, ''),
  ('monthly-june-member05', 'seed-group-store', 'member05@local.test', '2026-06', 'unsubmitted', NULL, NULL, NULL, '勤務終了の記録を確認してください');

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-request-june', 'seed-group-store', 'seed-plan-june', '6月末締めテスト（受付終了）', '2026-06-15', '2026-06-20', 'closed', 'tanaka@local.test'),
  ('seed-request-first-half', 'seed-group-store', 'seed-plan-first-half', '7月前半希望（受付終了）', '2026-06-10', '2026-06-20', 'closed', 'tanaka@local.test'),
  ('seed-request-second-half', 'seed-group-store', 'seed-plan-second-half', '7月後半希望（受付終了）', '2026-07-10', '2026-07-20', 'closed', 'tanaka@local.test'),
  ('seed-request-august-first', 'seed-group-store', 'seed-plan-august-first', '8月前半希望', '2026-07-20', '2026-07-30', 'open', 'tanaka@local.test');

INSERT INTO shift_request_submissions (id, period_id, user_email, saved_at) VALUES
  ('seed-submission-02', 'seed-request-august-first', 'member02@local.test', '2026-07-20T09:10:00.000Z'),
  ('seed-submission-04', 'seed-request-august-first', 'member04@local.test', '2026-07-20T10:20:00.000Z'),
  ('seed-submission-05', 'seed-request-august-first', 'member05@local.test', '2026-07-20T11:30:00.000Z'),
  ('seed-submission-07', 'seed-request-august-first', 'member07@local.test', '2026-07-20T12:40:00.000Z');

INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note) VALUES
  ('seed-request-row-01', 'seed-request-august-first', 'member02@local.test', '2026-08-01', '17:00', '22:00', 'want', '夕方から希望。'),
  ('seed-request-row-02', 'seed-request-august-first', 'member04@local.test', '2026-08-02', '09:30', '14:00', 'off', '家庭の予定で休み希望。'),
  ('seed-request-row-03', 'seed-request-august-first', 'member05@local.test', '2026-08-04', '09:30', '14:00', 'want', '日中希望。'),
  ('seed-request-row-04', 'seed-request-august-first', 'member07@local.test', '2026-08-08', '17:00', '22:00', 'want', '夜の時間帯を希望。');

INSERT INTO group_announcements (id, group_id, created_by, title, body) VALUES
  ('seed-announcement-01', 'seed-group-store', 'tanaka@local.test', '8月前半シフト希望について', '8月前半の勤務希望を7月30日までに入力してください。'),
  ('seed-announcement-02', 'seed-group-store', 'member01@local.test', '月末締めテストのお知らせ', '6月30日分の勤務申告を確認し、順次承認します。');

INSERT INTO announcement_reads (id, announcement_id, user_email) VALUES
  ('seed-read-01', 'seed-announcement-01', 'member02@local.test'),
  ('seed-read-02', 'seed-announcement-01', 'member05@local.test'),
  ('seed-read-03', 'seed-announcement-01', 'member07@local.test'),
  ('seed-read-04', 'seed-announcement-02', 'member04@local.test');

INSERT INTO announcement_replies (id, announcement_id, user_email, body) VALUES
  ('seed-reply-01', 'seed-announcement-01', 'member02@local.test', '確認しました。'),
  ('seed-reply-02', 'seed-announcement-02', 'member04@local.test', '6月30日分を確認しました。');

-- Night club scenario: one store is represented by two existing groups, staff and cast.
INSERT INTO account_profiles (user_email, nickname) VALUES
  ('night-manager@local.test', '店長'),
  ('night-staff-a@local.test', 'スタッフA'), ('night-staff-b@local.test', 'スタッフB'), ('night-staff-c@local.test', 'スタッフC'),
  ('night-cast-a@local.test', 'キャストA'), ('night-cast-b@local.test', 'キャストB'), ('night-cast-c@local.test', 'キャストC'),
  ('night-cast-d@local.test', 'キャストD'), ('night-cast-e@local.test', 'キャストE'), ('night-cast-f@local.test', 'キャストF');

INSERT INTO groups (id, name, description, owner_email, labor_consecutive_days_limit) VALUES
  ('seed-group-night-staff', 'A店スタッフ', 'ナイトクラブのスタッフ勤務を管理するサンプルグループ', 'night-manager@local.test', 7),
  ('seed-group-night-cast', 'A店キャスト', 'ナイトクラブのキャスト勤務を管理するサンプルグループ', 'night-manager@local.test', 7);
INSERT INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-night-staff', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true),
  ('seed-group-night-cast', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);
INSERT INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-night-staff-manager', 'seed-group-night-staff', 'night-manager@local.test', '店長', 'A店スタッフとA店キャストの両方を管理。シフトには入らない。', 'owner', 'active', 1),
  ('seed-night-staff-a', 'seed-group-night-staff', 'night-staff-a@local.test', 'スタッフA', 'スタッフ専任。', 'member', 'active', 1),
  ('seed-night-staff-b', 'seed-group-night-staff', 'night-staff-b@local.test', 'スタッフB', 'スタッフ専任。', 'member', 'active', 1),
  ('seed-night-staff-c', 'seed-group-night-staff', 'night-staff-c@local.test', 'スタッフC', 'スタッフ専任。', 'member', 'active', 1),
  ('seed-night-cast-manager', 'seed-group-night-cast', 'night-manager@local.test', '店長', 'A店スタッフとA店キャストの両方を管理。シフトには入らない。', 'owner', 'active', 1),
  ('seed-night-cast-a', 'seed-group-night-cast', 'night-cast-a@local.test', 'キャストA', '同伴で遅刻することがある。理由を備考に残す。', 'member', 'active', 1),
  ('seed-night-cast-b', 'seed-group-night-cast', 'night-cast-b@local.test', 'キャストB', '通常勤務。延長営業にも対応可能。', 'member', 'active', 1),
  ('seed-night-cast-c', 'seed-group-night-cast', 'night-cast-c@local.test', 'キャストC', '週末中心。', 'member', 'active', 1),
  ('seed-night-cast-d', 'seed-group-night-cast', 'night-cast-d@local.test', 'キャストD', '通常勤務。', 'member', 'active', 1),
  ('seed-night-cast-e', 'seed-group-night-cast', 'night-cast-e@local.test', 'キャストE', '金土中心。', 'member', 'active', 1),
  ('seed-night-cast-f', 'seed-group-night-cast', 'night-cast-f@local.test', 'キャストF', '祝日前の増員候補。', 'member', 'active', 1);
INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-night-staff-pref-manager', 'seed-group-night-staff', 'night-manager@local.test', 0, 0, 0, 0, 'any', '店長は管理専任でシフトには入らない。'),
  ('seed-night-staff-pref-a', 'seed-group-night-staff', 'night-staff-a@local.test', 3, 5, 24, 45, 'any', 'スタッフ専任。'),
  ('seed-night-staff-pref-b', 'seed-group-night-staff', 'night-staff-b@local.test', 3, 5, 24, 45, 'any', 'スタッフ専任。'),
  ('seed-night-staff-pref-c', 'seed-group-night-staff', 'night-staff-c@local.test', 2, 4, 16, 36, 'any', 'スタッフ専任。'),
  ('seed-night-cast-pref-manager', 'seed-group-night-cast', 'night-manager@local.test', 0, 0, 0, 0, 'any', '店長は管理専任でシフトには入らない。'),
  ('seed-night-cast-pref-a', 'seed-group-night-cast', 'night-cast-a@local.test', 3, 5, 24, 40, 'any', '同伴で開始が遅れる場合は理由を申告。'),
  ('seed-night-cast-pref-b', 'seed-group-night-cast', 'night-cast-b@local.test', 4, 5, 32, 40, 'any', '延長営業にも対応可能。'),
  ('seed-night-cast-pref-c', 'seed-group-night-cast', 'night-cast-c@local.test', 3, 4, 24, 32, 'any', '週末中心。'),
  ('seed-night-cast-pref-d', 'seed-group-night-cast', 'night-cast-d@local.test', 3, 5, 24, 40, 'any', '通常勤務。'),
  ('seed-night-cast-pref-e', 'seed-group-night-cast', 'night-cast-e@local.test', 2, 4, 16, 32, 'prefer_off', '金土中心。'),
  ('seed-night-cast-pref-f', 'seed-group-night-cast', 'night-cast-f@local.test', 2, 4, 16, 32, 'prefer_off', '祝日前の勤務を希望。');

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-night-staff-plan-july', 'seed-group-night-staff', 'A店スタッフ 7月シフト', '2026-07-17', '2026-07-23', '17:00', '26:00', 60, 1, '月曜は休業。営業日はスタッフを17:00〜26:00に1名配置。店長は割り当てない。', 'published', 'night-manager@local.test'),
  ('seed-night-cast-plan-july', 'seed-group-night-cast', 'A店キャスト 7月シフト', '2026-07-17', '2026-07-23', '18:00', '26:00', 60, 1, '平日は18:00〜26:00を1名、20:00〜22:00を1名。休日前は18:00〜26:00を2名、20:00〜24:00を2名。', 'published', 'night-manager@local.test');

WITH RECURSIVE dates(date) AS (SELECT '2026-07-17' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-23')
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-night-staff-' || lower(hex(randomblob(8))), 'seed-night-staff-plan-july', date, '17:00', '26:00', 1, 'スタッフ' FROM dates
WHERE strftime('%w', date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-07-17' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-23'),
defs(start_time, end_time, normal_count, busy_count) AS (
  SELECT '18:00', '26:00', 1, 2
  UNION ALL SELECT '20:00', '22:00', 1, 2
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-night-cast-' || lower(hex(randomblob(8))), 'seed-night-cast-plan-july', dates.date, defs.start_time, defs.end_time,
  CASE WHEN dates.date IN ('2026-07-17', '2026-07-18', '2026-07-19') THEN defs.busy_count ELSE defs.normal_count END, 'キャスト'
FROM dates CROSS JOIN defs
WHERE strftime('%w', dates.date) <> '1';
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-night-cast-late-' || lower(hex(randomblob(8))), 'seed-night-cast-plan-july', dates.date, '20:00', '24:00', 2, 'キャスト'
FROM (SELECT '2026-07-17' AS date UNION ALL SELECT '2026-07-18' UNION ALL SELECT '2026-07-19') dates;

WITH assignees(date, user_email) AS (VALUES
  ('2026-07-17', 'night-staff-a@local.test'), ('2026-07-18', 'night-staff-b@local.test'), ('2026-07-19', 'night-staff-c@local.test'),
  ('2026-07-20', 'night-staff-a@local.test'), ('2026-07-21', 'night-staff-b@local.test'), ('2026-07-22', 'night-staff-c@local.test'), ('2026-07-23', 'night-staff-a@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email FROM shift_slots slots JOIN assignees ON assignees.date = slots.date
WHERE slots.plan_id = 'seed-night-staff-plan-july';
WITH assignees(date, start_time, end_time, user_email) AS (VALUES
  ('2026-07-17', '18:00', '26:00', 'night-cast-a@local.test'), ('2026-07-17', '18:00', '26:00', 'night-cast-b@local.test'), ('2026-07-17', '20:00', '22:00', 'night-cast-c@local.test'), ('2026-07-17', '20:00', '22:00', 'night-cast-d@local.test'), ('2026-07-17', '20:00', '24:00', 'night-cast-e@local.test'), ('2026-07-17', '20:00', '24:00', 'night-cast-f@local.test'),
  ('2026-07-18', '18:00', '26:00', 'night-cast-b@local.test'), ('2026-07-18', '18:00', '26:00', 'night-cast-c@local.test'), ('2026-07-18', '20:00', '22:00', 'night-cast-d@local.test'), ('2026-07-18', '20:00', '22:00', 'night-cast-e@local.test'), ('2026-07-18', '20:00', '24:00', 'night-cast-a@local.test'), ('2026-07-18', '20:00', '24:00', 'night-cast-f@local.test'),
  ('2026-07-19', '18:00', '26:00', 'night-cast-c@local.test'), ('2026-07-19', '18:00', '26:00', 'night-cast-d@local.test'), ('2026-07-19', '20:00', '22:00', 'night-cast-e@local.test'), ('2026-07-19', '20:00', '22:00', 'night-cast-f@local.test'), ('2026-07-19', '20:00', '24:00', 'night-cast-a@local.test'), ('2026-07-19', '20:00', '24:00', 'night-cast-b@local.test'),
  ('2026-07-20', '18:00', '26:00', 'night-cast-d@local.test'), ('2026-07-20', '20:00', '22:00', 'night-cast-e@local.test'),
  ('2026-07-21', '18:00', '26:00', 'night-cast-e@local.test'), ('2026-07-21', '20:00', '22:00', 'night-cast-f@local.test'),
  ('2026-07-22', '18:00', '26:00', 'night-cast-f@local.test'), ('2026-07-22', '20:00', '22:00', 'night-cast-a@local.test'),
  ('2026-07-23', '18:00', '26:00', 'night-cast-a@local.test'), ('2026-07-23', '20:00', '22:00', 'night-cast-b@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email FROM shift_slots slots JOIN assignees
  ON assignees.date = slots.date AND assignees.start_time = slots.start_time AND assignees.end_time = slots.end_time
WHERE slots.plan_id = 'seed-night-cast-plan-july';

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-night-staff-request-july', 'seed-group-night-staff', 'seed-night-staff-plan-july', 'A店スタッフ 7月希望', '2026-07-10', '2026-07-15', 'closed', 'night-manager@local.test'),
  ('seed-night-cast-request-july', 'seed-group-night-cast', 'seed-night-cast-plan-july', 'A店キャスト 7月希望', '2026-07-10', '2026-07-15', 'closed', 'night-manager@local.test');
INSERT INTO group_announcements (id, group_id, created_by, title, body) VALUES
  ('seed-night-staff-announcement-01', 'seed-group-night-staff', 'night-manager@local.test', 'A店スタッフの勤務について', 'スタッフは17:00〜26:00の勤務枠です。開始・終了・休憩の打刻を忘れずに行ってください。'),
  ('seed-night-cast-announcement-01', 'seed-group-night-cast', 'night-manager@local.test', 'A店キャストの勤務について', '休日前は増員枠があります。同伴などで遅れる場合は勤務申告の備考に理由を残してください。');

-- Demo clock and attendance scenario normalization.
-- The demo date is intentionally fixed so all three scenarios can be reviewed
-- consistently. July 20 is the previous day and remains unapproved.
UPDATE demo_clocks
SET current_at = '2026-07-21T09:00:00+09:00'
WHERE scope = 'public-demo';

-- The restaurant runs daily time-clock operations. Keep the previous day
-- pending, keep one older rejection for the review flow, and leave one older
-- day unsubmitted to demonstrate a missing declaration.
UPDATE work_records
SET status = 'submitted', approved_by = NULL, approved_at = NULL,
    manager_note = '', updated_at = '2026-07-21T09:00:00+09:00'
WHERE group_id = 'seed-group-store' AND scheduled_date = '2026-07-20';
UPDATE work_records
SET status = 'rejected', approved_by = NULL, approved_at = NULL,
    manager_note = '終了時刻を確認して再申告してください。',
    updated_at = '2026-07-21T09:00:00+09:00'
WHERE group_id = 'seed-group-store'
  AND scheduled_date = '2026-07-18'
  AND user_email = 'member07@local.test';
UPDATE work_records
SET status = 'unsubmitted', approved_by = NULL, approved_at = NULL,
    manager_note = '', updated_at = '2026-07-21T09:00:00+09:00'
WHERE group_id = 'seed-group-store'
  AND scheduled_date = '2026-07-19'
  AND user_email = 'member05@local.test';

-- Nightclub: time-clock operation is active for both staff and cast groups.
-- Past days are approved except for one realistic exception; July 20 is
-- submitted and waiting for the manager. 26:00 is stored as next-day 02:00
-- in timestamps while retaining the original 26:00 schedule text.
INSERT INTO work_records (
  id, group_id, plan_id, slot_id, user_email, scheduled_date,
  scheduled_start_time, scheduled_end_time, started_at, ended_at,
  claimed_start_at, claimed_end_at, claimed_break_minutes, status,
  employee_note, manager_note, approved_by, approved_at
)
SELECT
  'wr-night-' || lower(hex(randomblob(8))),
  CASE WHEN slots.plan_id = 'seed-night-staff-plan-july'
    THEN 'seed-group-night-staff' ELSE 'seed-group-night-cast' END,
  slots.plan_id,
  slots.id,
  assignments.user_email,
  slots.date,
  slots.start_time,
  slots.end_time,
  slots.date || 'T' || slots.start_time || ':05:00+09:00',
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-19' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T01:00:00+09:00'
    WHEN assignments.user_email = 'night-cast-b@local.test'
      AND slots.date = '2026-07-18' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T03:00:00+09:00'
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:05:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:05:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':05:00+09:00'
  END,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  CASE WHEN slots.end_time = '26:00' THEN 45 ELSE 0 END,
  CASE
    WHEN slots.date = '2026-07-20' THEN 'submitted'
    WHEN slots.date = '2026-07-19'
      AND assignments.user_email = 'night-cast-a@local.test' THEN 'rejected'
    ELSE 'approved'
  END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-19'
      THEN '同伴のため開始が遅れました。'
    WHEN assignments.user_email = 'night-cast-b@local.test' AND slots.date = '2026-07-18'
      THEN '延長営業で終了が遅くなりました。'
    ELSE ''
  END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-19'
      THEN '開始時刻と理由を確認して再申告してください。'
    ELSE ''
  END,
  CASE WHEN slots.date < '2026-07-20' AND NOT (
    slots.date = '2026-07-19' AND assignments.user_email = 'night-cast-a@local.test'
  ) THEN 'night-manager@local.test' ELSE NULL END,
  CASE WHEN slots.date < '2026-07-20' AND NOT (
    slots.date = '2026-07-19' AND assignments.user_email = 'night-cast-a@local.test'
  ) THEN '2026-07-20T09:00:00.000Z' ELSE NULL END
FROM shift_slots slots
JOIN shift_assignments assignments ON assignments.slot_id = slots.id
WHERE slots.plan_id IN ('seed-night-staff-plan-july', 'seed-night-cast-plan-july')
  AND slots.date <= '2026-07-20';

INSERT INTO work_breaks (id, work_record_id, started_at, ended_at)
SELECT
  'break-night-' || lower(hex(randomblob(8))),
  records.id,
  records.scheduled_date || 'T23:30:00+09:00',
  date(records.scheduled_date, '+1 day') || 'T00:15:00+09:00'
FROM work_records records
WHERE records.group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND records.scheduled_end_time = '26:00';

-- Do not pre-create attendance records for future days. The published shift
-- remains visible as a schedule, while actual time-clock data starts on the
-- previous day and can be entered for today by the demo user.
DELETE FROM work_breaks
WHERE work_record_id IN (
  SELECT id FROM work_records
  WHERE group_id = 'seed-group-store' AND scheduled_date > '2026-07-20'
);
DELETE FROM work_records
WHERE group_id = 'seed-group-store' AND scheduled_date > '2026-07-20';

-- Normalize the labels used by the demo cards and calendars. The original
-- fixtures used legacy encoded labels; IDs and business conditions are kept.
-- Normalize declared timestamps. Older fixtures accidentally generated values
-- such as 09:30:05:00, which made the start time unparsable in the UI. Except
-- for rejected/unsubmitted records, declarations follow the scheduled slot.
UPDATE work_records
SET claimed_start_at = scheduled_date || 'T' || scheduled_start_time || ':05+09:00',
    claimed_end_at = CASE
      WHEN scheduled_end_time = '26:00' THEN date(scheduled_date, '+1 day') || 'T02:00:00+09:00'
      WHEN scheduled_end_time = '24:00' THEN date(scheduled_date, '+1 day') || 'T00:00:00+09:00'
      ELSE scheduled_date || 'T' || scheduled_end_time || ':00+09:00'
    END
WHERE group_id = 'seed-group-store'
  AND status <> 'rejected'
  AND scheduled_date <= '2026-07-20';

-- July 19 actual stamps: exact, a few minutes off, and roughly 30 minutes
-- off are intentionally mixed for the attendance comparison screen.
UPDATE work_records
SET started_at = '2026-07-19T14:03:00+09:00',
    ended_at = '2026-07-19T17:02:00+09:00'
WHERE group_id = 'seed-group-store' AND scheduled_date = '2026-07-19'
  AND user_email = 'member02@local.test' AND scheduled_start_time = '14:00';
UPDATE work_records
SET started_at = '2026-07-19T17:02:00+09:00',
    ended_at = '2026-07-19T22:04:00+09:00'
WHERE group_id = 'seed-group-store' AND scheduled_date = '2026-07-19'
  AND user_email = 'member03@local.test' AND scheduled_start_time = '17:00';
UPDATE work_records
SET started_at = '2026-07-19T14:30:00+09:00',
    ended_at = '2026-07-19T17:30:00+09:00'
WHERE group_id = 'seed-group-store' AND scheduled_date = '2026-07-19'
  AND user_email = 'member06@local.test' AND scheduled_start_time = '14:00';
UPDATE work_records
SET started_at = '2026-07-19T22:04:00+09:00',
    ended_at = '2026-07-20T02:03:00+09:00'
WHERE group_id = 'seed-group-store' AND scheduled_date = '2026-07-19'
  AND user_email = 'member07@local.test' AND scheduled_start_time = '22:00';

UPDATE account_profiles SET nickname = CASE user_email
  WHEN 'tanaka@local.test' THEN '店長'
  WHEN 'member01@local.test' THEN '副店長'
  WHEN 'member02@local.test' THEN '学生A'
  WHEN 'member03@local.test' THEN '学生B'
  WHEN 'member04@local.test' THEN '主婦A'
  WHEN 'member05@local.test' THEN '主婦B'
  WHEN 'member06@local.test' THEN 'フリーターA'
  WHEN 'member07@local.test' THEN 'フリーターB'
  WHEN 'member08@local.test' THEN 'パートA'
  WHEN 'member09@local.test' THEN 'パートB'
  ELSE nickname END
WHERE user_email LIKE 'member%@local.test' OR user_email = 'tanaka@local.test';

UPDATE groups SET name = 'サンプル店', description = '飲食店のシフト・打刻・日次承認サンプル'
WHERE id = 'seed-group-store';
UPDATE groups SET name = 'A店スタッフ', description = 'ナイトクラブのスタッフ勤務サンプル'
WHERE id = 'seed-group-night-staff';
UPDATE groups SET name = 'A店キャスト', description = 'ナイトクラブのキャスト勤務サンプル'
WHERE id = 'seed-group-night-cast';

UPDATE shift_slots SET role = CASE role
  WHEN '繝帙・繝ｫ' THEN 'ホール'
  WHEN '蜴ｨ謌ｿ' THEN '厨房'
  ELSE role END
WHERE plan_id IN ('seed-plan-june','seed-plan-first-half','seed-plan-second-half','seed-plan-august-first');

UPDATE group_members SET display_name = CASE user_email
  WHEN 'tanaka@local.test' THEN '店長'
  WHEN 'member01@local.test' THEN '副店長'
  WHEN 'member02@local.test' THEN '学生A'
  WHEN 'member03@local.test' THEN '学生B'
  WHEN 'member04@local.test' THEN '主婦A'
  WHEN 'member05@local.test' THEN '主婦B'
  WHEN 'member06@local.test' THEN 'フリーターA'
  WHEN 'member07@local.test' THEN 'フリーターB'
  WHEN 'member08@local.test' THEN 'パートA'
  WHEN 'member09@local.test' THEN 'パートB'
  ELSE display_name END,
  admin_note = CASE user_email
  WHEN 'tanaka@local.test' THEN '代表管理者。全体確認を行う。'
  WHEN 'member01@local.test' THEN '副店長。店長の補佐。'
  WHEN 'member02@local.test' THEN '学生。夕方・土日中心。22:00以降は勤務不可。'
  WHEN 'member03@local.test' THEN '学生。平日夕方中心。短時間勤務。'
  WHEN 'member04@local.test' THEN '主婦。平日日中中心。'
  WHEN 'member05@local.test' THEN '主婦。平日日中中心。主婦Aとは同じシフトを避ける。'
  WHEN 'member06@local.test' THEN 'フリーター。夕方から深夜まで対応。'
  WHEN 'member07@local.test' THEN 'フリーター。深夜帯も対応。'
  WHEN 'member08@local.test' THEN 'パート。週3日程度。'
  WHEN 'member09@local.test' THEN 'パート。曜日相談可。'
  ELSE admin_note END
WHERE group_id = 'seed-group-store';

UPDATE group_assistants SET display_name = 'KINBANアシスタント'
WHERE group_id IN ('seed-group-store','seed-group-night-staff','seed-group-night-cast');

UPDATE account_profiles SET nickname = CASE user_email
  WHEN 'night-manager@local.test' THEN '店長'
  WHEN 'night-staff-a@local.test' THEN 'スタッフA'
  WHEN 'night-staff-b@local.test' THEN 'スタッフB'
  WHEN 'night-staff-c@local.test' THEN 'スタッフC'
  WHEN 'night-cast-a@local.test' THEN 'キャストA'
  WHEN 'night-cast-b@local.test' THEN 'キャストB'
  WHEN 'night-cast-c@local.test' THEN 'キャストC'
  WHEN 'night-cast-d@local.test' THEN 'キャストD'
  WHEN 'night-cast-e@local.test' THEN 'キャストE'
  WHEN 'night-cast-f@local.test' THEN 'キャストF'
  ELSE nickname END
WHERE user_email LIKE 'night-%@local.test';

UPDATE group_members SET display_name = CASE user_email
  WHEN 'night-manager@local.test' THEN '店長'
  WHEN 'night-staff-a@local.test' THEN 'スタッフA'
  WHEN 'night-staff-b@local.test' THEN 'スタッフB'
  WHEN 'night-staff-c@local.test' THEN 'スタッフC'
  WHEN 'night-cast-a@local.test' THEN 'キャストA'
  WHEN 'night-cast-b@local.test' THEN 'キャストB'
  WHEN 'night-cast-c@local.test' THEN 'キャストC'
  WHEN 'night-cast-d@local.test' THEN 'キャストD'
  WHEN 'night-cast-e@local.test' THEN 'キャストE'
  WHEN 'night-cast-f@local.test' THEN 'キャストF'
  ELSE display_name END
WHERE group_id IN ('seed-group-night-staff','seed-group-night-cast');

INSERT INTO audit_logs (id, group_id, user_email, action, entity_type, entity_id, summary, details, created_at) VALUES
  ('seed-audit-01', 'seed-group-store', 'tanaka@local.test', 'shift.publish', 'shiftPlan', 'seed-plan-second-half', '7月後半シフトを公開', '{"status":"published"}', '2026-07-16T08:00:00.000Z'),
  ('seed-audit-02', 'seed-group-store', 'member02@local.test', 'work.submit', 'workRecord', 'seed-july-submit', '7月18日の勤務申告を申請', '{}', '2026-07-17T09:10:00.000Z'),
  ('seed-audit-03', 'seed-group-store', 'member01@local.test', 'work.review', 'workRecord', 'seed-july-review', '勤務申告を承認', '{"status":"approved"}', '2026-07-17T12:00:00.000Z'),
  ('seed-audit-04', 'seed-group-store', 'member03@local.test', 'work.review', 'workRecord', 'seed-july-reject', '勤務申告を差し戻し', '{"status":"rejected"}', '2026-07-17T13:00:00.000Z');
-- Nightclub monthly schedule override: July published/assigned and August open for requests.
DELETE FROM work_breaks
WHERE work_record_id IN (SELECT id FROM work_records WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM work_records WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');
DELETE FROM shift_request_submissions
WHERE period_id IN (SELECT id FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_requests
WHERE period_id IN (SELECT id FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');
DELETE FROM shift_assignments
WHERE slot_id IN (SELECT id FROM shift_slots WHERE plan_id IN (SELECT id FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast')));
DELETE FROM shift_slots
WHERE plan_id IN (SELECT id FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');

UPDATE groups SET name = 'A店スタッフ', description = 'ナイトクラブのスタッフ勤務サンプル' WHERE id = 'seed-group-night-staff';
UPDATE groups SET name = 'A店キャスト', description = 'ナイトクラブのキャスト勤務サンプル' WHERE id = 'seed-group-night-cast';
UPDATE group_assistants SET display_name = 'KINBANアシスタント' WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');
UPDATE account_profiles SET nickname = CASE user_email
  WHEN 'night-manager@local.test' THEN '店長'
  WHEN 'night-staff-a@local.test' THEN 'スタッフA'
  WHEN 'night-staff-b@local.test' THEN 'スタッフB'
  WHEN 'night-staff-c@local.test' THEN 'スタッフC'
  WHEN 'night-cast-a@local.test' THEN 'キャストA'
  WHEN 'night-cast-b@local.test' THEN 'キャストB'
  WHEN 'night-cast-c@local.test' THEN 'キャストC'
  WHEN 'night-cast-d@local.test' THEN 'キャストD'
  WHEN 'night-cast-e@local.test' THEN 'キャストE'
  WHEN 'night-cast-f@local.test' THEN 'キャストF'
  ELSE nickname END
WHERE user_email LIKE 'night-%@local.test';
UPDATE group_members SET display_name = CASE user_email
  WHEN 'night-manager@local.test' THEN '店長'
  WHEN 'night-staff-a@local.test' THEN 'スタッフA'
  WHEN 'night-staff-b@local.test' THEN 'スタッフB'
  WHEN 'night-staff-c@local.test' THEN 'スタッフC'
  WHEN 'night-cast-a@local.test' THEN 'キャストA'
  WHEN 'night-cast-b@local.test' THEN 'キャストB'
  WHEN 'night-cast-c@local.test' THEN 'キャストC'
  WHEN 'night-cast-d@local.test' THEN 'キャストD'
  WHEN 'night-cast-e@local.test' THEN 'キャストE'
  WHEN 'night-cast-f@local.test' THEN 'キャストF'
  ELSE display_name END,
  admin_note = CASE user_email
    WHEN 'night-manager@local.test' THEN 'スタッフとキャストの両方を管理。シフトには入らない。'
    WHEN 'night-cast-a@local.test' THEN '同伴で遅刻することがある。理由を備考に残す。'
    WHEN 'night-cast-b@local.test' THEN '延長営業にも対応可能。'
    WHEN 'night-cast-c@local.test' THEN '週末中心。'
    WHEN 'night-cast-e@local.test' THEN '金土中心。'
    WHEN 'night-cast-f@local.test' THEN '祝日前の勤務候補。'
    ELSE admin_note END
WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-night-staff-plan-july-month', 'seed-group-night-staff', '7月スタッフシフト', '2026-07-01', '2026-07-31', '17:00', '26:00', 60, 1, '月曜休業。営業日はスタッフ1名を17:00〜26:00に配置。', 'published', 'night-manager@local.test'),
  ('seed-night-cast-plan-july-month', 'seed-group-night-cast', '7月キャストシフト', '2026-07-01', '2026-07-31', '18:00', '26:00', 60, 1, '平日は18:00〜26:00を1名、20:00〜22:00を1名。休日前は18:00〜26:00を2名、20:00〜24:00を2名。', 'published', 'night-manager@local.test'),
  ('seed-night-staff-plan-august-month', 'seed-group-night-staff', '8月スタッフシフト', '2026-08-01', '2026-08-31', '17:00', '26:00', 60, 1, '月曜休業。希望受付中。', 'draft', 'night-manager@local.test'),
  ('seed-night-cast-plan-august-month', 'seed-group-night-cast', '8月キャストシフト', '2026-08-01', '2026-08-31', '18:00', '26:00', 60, 1, '月曜休業。希望受付中。', 'draft', 'night-manager@local.test');

WITH RECURSIVE dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31')
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-staff-jul-' || replace(date, '-', ''), 'seed-night-staff-plan-july-month', date, '17:00', '26:00', 1, 'スタッフ'
FROM dates WHERE strftime('%w', date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31'), defs(start_time, end_time, weekday_count, weekend_count) AS (VALUES ('18:00', '26:00', 1, 2), ('20:00', '22:00', 1, 2))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-cast-jul-' || replace(dates.date, '-', '') || '-' || replace(defs.start_time, ':', ''), 'seed-night-cast-plan-july-month', dates.date, defs.start_time, defs.end_time, CASE WHEN strftime('%w', dates.date) IN ('0', '5', '6') THEN defs.weekend_count ELSE defs.weekday_count END, 'キャスト'
FROM dates CROSS JOIN defs WHERE strftime('%w', dates.date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-08-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-31')
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-staff-aug-' || replace(date, '-', ''), 'seed-night-staff-plan-august-month', date, '17:00', '26:00', 1, 'スタッフ'
FROM dates WHERE strftime('%w', date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-08-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-31'), defs(start_time, end_time, weekday_count, weekend_count) AS (VALUES ('18:00', '26:00', 1, 2), ('20:00', '22:00', 1, 2))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-cast-aug-' || replace(dates.date, '-', '') || '-' || replace(defs.start_time, ':', ''), 'seed-night-cast-plan-august-month', dates.date, defs.start_time, defs.end_time, CASE WHEN strftime('%w', dates.date) IN ('0', '5', '6') THEN defs.weekend_count ELSE defs.weekday_count END, 'キャスト'
FROM dates CROSS JOIN defs WHERE strftime('%w', dates.date) <> '1';

WITH members(idx, user_email) AS (VALUES (0, 'night-staff-a@local.test'), (1, 'night-staff-b@local.test'), (2, 'night-staff-c@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT 'night-assignment-' || slots.id, slots.id, members.user_email FROM shift_slots slots CROSS JOIN members
WHERE slots.plan_id = 'seed-night-staff-plan-july-month' AND members.idx = (CAST(julianday(slots.date) - julianday('2026-07-01') AS INTEGER) % 3);

WITH members(idx, user_email) AS (VALUES (0, 'night-cast-a@local.test'), (1, 'night-cast-b@local.test'), (2, 'night-cast-c@local.test'), (3, 'night-cast-d@local.test'), (4, 'night-cast-e@local.test'), (5, 'night-cast-f@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT 'night-cast-assignment-' || slots.id || '-' || members.idx, slots.id, members.user_email FROM shift_slots slots CROSS JOIN members
WHERE slots.plan_id = 'seed-night-cast-plan-july-month' AND ((members.idx - (CAST(julianday(slots.date) - julianday('2026-07-01') AS INTEGER) % 6 + 6) % 6) < slots.required_count);

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-night-staff-request-july-month', 'seed-group-night-staff', 'seed-night-staff-plan-july-month', '7月スタッフ希望（受付終了）', '2026-06-20', '2026-06-25', 'closed', 'night-manager@local.test'),
  ('seed-night-cast-request-july-month', 'seed-group-night-cast', 'seed-night-cast-plan-july-month', '7月キャスト希望（受付終了）', '2026-06-20', '2026-06-25', 'closed', 'night-manager@local.test'),
  ('seed-night-staff-request-august-month', 'seed-group-night-staff', 'seed-night-staff-plan-august-month', '8月スタッフ希望', '2026-07-20', '2026-07-30', 'open', 'night-manager@local.test'),
  ('seed-night-cast-request-august-month', 'seed-group-night-cast', 'seed-night-cast-plan-august-month', '8月キャスト希望', '2026-07-20', '2026-07-30', 'open', 'night-manager@local.test');
INSERT INTO shift_request_submissions (id, period_id, user_email, saved_at, request_comment) VALUES
  ('seed-night-aug-sub-staff-a', 'seed-night-staff-request-august-month', 'night-staff-a@local.test', '2026-07-21T10:00:00+09:00', '平日中心で希望します。'),
  ('seed-night-aug-sub-cast-a', 'seed-night-cast-request-august-month', 'night-cast-a@local.test', '2026-07-21T10:10:00+09:00', '同伴で遅れる日は備考に記載します。');

-- The final monthly schedule above is the source of truth for the demo
-- attendance records. Keep these writes after the schedule rebuild.
INSERT INTO work_records (
  id, group_id, plan_id, slot_id, user_email, scheduled_date,
  scheduled_start_time, scheduled_end_time, started_at, ended_at,
  claimed_start_at, claimed_end_at, claimed_break_minutes, status,
  employee_note, manager_note, approved_by, approved_at
)
SELECT
  'wr-night-final-' || lower(hex(randomblob(8))),
  CASE WHEN slots.plan_id = 'seed-night-staff-plan-july-month'
    THEN 'seed-group-night-staff' ELSE 'seed-group-night-cast' END,
  slots.plan_id,
  slots.id,
  assignments.user_email,
  slots.date,
  slots.start_time,
  slots.end_time,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  CASE WHEN slots.end_time = '26:00' THEN 45 ELSE 0 END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12' THEN 'rejected'
    WHEN slots.date = '2026-07-19' THEN 'submitted'
    ELSE 'approved'
  END,
  '',
  CASE WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12'
    THEN '早上がりの理由と申告時刻を確認してください。' ELSE '' END,
  CASE WHEN slots.date < '2026-07-19'
    AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
    THEN 'night-manager@local.test' ELSE NULL END,
  CASE WHEN slots.date < '2026-07-19'
    AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
    THEN '2026-07-20T09:00:00.000Z' ELSE NULL END
FROM shift_slots slots
JOIN shift_assignments assignments ON assignments.slot_id = slots.id
WHERE slots.plan_id IN ('seed-night-staff-plan-july-month', 'seed-night-cast-plan-july-month')
  AND slots.date <= '2026-07-20'
  AND assignments.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test');

UPDATE work_records
SET ended_at = date(scheduled_date, '+1 day') || 'T01:15:00+09:00',
    claimed_end_at = date(scheduled_date, '+1 day') || 'T01:15:00+09:00',
    employee_note = '客数が少なく、25:15で早上がりしました。'
WHERE group_id = 'seed-group-night-staff' AND user_email = 'night-staff-a@local.test'
  AND scheduled_date = '2026-07-04' AND scheduled_end_time = '26:00';
UPDATE work_records
SET ended_at = date(scheduled_date, '+1 day') || 'T03:00:00+09:00',
    claimed_end_at = date(scheduled_date, '+1 day') || 'T03:00:00+09:00',
    employee_note = '繁忙日のため26:00を超えて延長しました。'
WHERE group_id = 'seed-group-night-staff' AND user_email = 'night-staff-a@local.test'
  AND scheduled_date = '2026-07-11' AND scheduled_end_time = '26:00';
UPDATE work_records
SET started_at = scheduled_date || 'T18:20:00+09:00',
    claimed_start_at = scheduled_date || 'T18:20:00+09:00',
    employee_note = '同伴対応のため20分遅刻しました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test'
  AND scheduled_date = '2026-07-05' AND scheduled_start_time = '18:00';
UPDATE work_records
SET ended_at = date(scheduled_date, '+1 day') || 'T01:30:00+09:00',
    claimed_end_at = date(scheduled_date, '+1 day') || 'T01:30:00+09:00',
    employee_note = '客数が少なく、25:30で早上がりしました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test'
  AND scheduled_date = '2026-07-12' AND scheduled_end_time = '26:00';
UPDATE work_records
SET started_at = scheduled_date || 'T18:10:00+09:00',
    claimed_start_at = scheduled_date || 'T18:10:00+09:00',
    employee_note = '同伴対応のため開始が少し遅れました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test'
  AND scheduled_date = '2026-07-19' AND scheduled_start_time = '18:00';

INSERT INTO work_breaks (id, work_record_id, started_at, ended_at)
SELECT
  'break-night-final-' || lower(hex(randomblob(8))),
  records.id,
  records.scheduled_date || 'T23:30:00+09:00',
  date(records.scheduled_date, '+1 day') || 'T00:15:00+09:00'
FROM work_records records
WHERE records.group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND records.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test')
  AND records.scheduled_end_time = '26:00';

-- Recreate personal calendar events for the final published nightclub plans.
-- The calendar API starts from events and then filters them by assignment.
INSERT INTO events (
  id, owner_email, group_id, shift_plan_id, title, date, end_date,
  start_time, end_time, category, notes, completed
)
SELECT
  'seed-night-calendar-' || slots.id,
  plans.created_by,
  plans.group_id,
  plans.id,
  COALESCE(NULLIF(slots.role, ''), groups.name),
  slots.date,
  CASE WHEN CAST(substr(slots.end_time, 1, 2) AS INTEGER) >= 24
    THEN date(slots.date, '+1 day') ELSE slots.date END,
  slots.start_time,
  CASE WHEN CAST(substr(slots.end_time, 1, 2) AS INTEGER) >= 24
    THEN printf('%02d:%s', CAST(substr(slots.end_time, 1, 2) AS INTEGER) - 24, substr(slots.end_time, 4, 2))
    ELSE slots.end_time END,
  '仕事',
  '公開済みシフト',
  0
FROM shift_slots slots
JOIN shift_plans plans ON plans.id = slots.plan_id
JOIN groups ON groups.id = plans.group_id
WHERE plans.status = 'published'
  AND plans.id IN ('seed-night-staff-plan-july-month', 'seed-night-cast-plan-july-month')
  AND EXISTS (SELECT 1 FROM shift_assignments assignments WHERE assignments.slot_id = slots.id);

-- Nightclub demo attendance and work memos for staff A and cast A.
-- Other members are intentionally left without attendance records so the
-- management screens show both populated and unsubmitted cases.
DELETE FROM work_breaks
WHERE work_record_id IN (
  SELECT id FROM work_records
  WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
    AND user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test')
);
DELETE FROM work_records
WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test');

INSERT INTO work_records (
  id, group_id, plan_id, slot_id, user_email, scheduled_date,
  scheduled_start_time, scheduled_end_time, started_at, ended_at,
  claimed_start_at, claimed_end_at, claimed_break_minutes, status,
  employee_note, manager_note, approved_by, approved_at
)
SELECT
  'wr-night-demo-' || lower(hex(randomblob(8))),
  CASE WHEN slots.plan_id = 'seed-night-staff-plan-july-month'
    THEN 'seed-group-night-staff' ELSE 'seed-group-night-cast' END,
  slots.plan_id,
  slots.id,
  assignments.user_email,
  slots.date,
  slots.start_time,
  slots.end_time,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-05' AND slots.start_time = '18:00'
      THEN slots.date || 'T18:20:00+09:00'
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-19' AND slots.start_time = '18:00'
      THEN slots.date || 'T18:10:00+09:00'
    ELSE slots.date || 'T' || slots.start_time || ':00+09:00'
  END,
  CASE
    WHEN assignments.user_email = 'night-staff-a@local.test'
      AND slots.date = '2026-07-04' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T01:15:00+09:00'
    WHEN assignments.user_email = 'night-staff-a@local.test'
      AND slots.date = '2026-07-11' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T03:00:00+09:00'
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-12' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T01:30:00+09:00'
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-05' AND slots.start_time = '18:00'
      THEN slots.date || 'T18:20:00+09:00'
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-19' AND slots.start_time = '18:00'
      THEN slots.date || 'T18:10:00+09:00'
    ELSE slots.date || 'T' || slots.start_time || ':00+09:00'
  END,
  CASE
    WHEN assignments.user_email = 'night-staff-a@local.test'
      AND slots.date = '2026-07-04' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T01:15:00+09:00'
    WHEN assignments.user_email = 'night-staff-a@local.test'
      AND slots.date = '2026-07-11' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T03:00:00+09:00'
    WHEN assignments.user_email = 'night-cast-a@local.test'
      AND slots.date = '2026-07-12' AND slots.end_time = '26:00'
      THEN date(slots.date, '+1 day') || 'T01:30:00+09:00'
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  CASE WHEN slots.end_time = '26:00' THEN 45 ELSE 0 END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12' THEN 'rejected'
    WHEN slots.date = '2026-07-19' THEN 'submitted'
    ELSE 'approved'
  END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-05'
      THEN '同伴対応のため20分遅刻しました。'
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-19'
      THEN '同伴対応のため開始が少し遅れました。'
    WHEN assignments.user_email = 'night-staff-a@local.test' AND slots.date = '2026-07-04'
      THEN '客数が少なく、25:15で早上がりしました。'
    WHEN assignments.user_email = 'night-staff-a@local.test' AND slots.date = '2026-07-11'
      THEN '繁忙日のため26:00を超えて延長しました。'
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12'
      THEN '客数が少なく、25:30で早上がりしました。'
    ELSE ''
  END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12'
      THEN '早上がりの理由と申告時刻を確認してください。'
    ELSE ''
  END,
  CASE
    WHEN slots.date < '2026-07-19'
      AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
      THEN 'night-manager@local.test'
    ELSE NULL
  END,
  CASE
    WHEN slots.date < '2026-07-19'
      AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
      THEN '2026-07-20T09:00:00.000Z'
    ELSE NULL
  END
FROM shift_slots slots
JOIN shift_assignments assignments ON assignments.slot_id = slots.id
WHERE slots.plan_id IN ('seed-night-staff-plan-july-month', 'seed-night-cast-plan-july-month')
  AND slots.date <= '2026-07-20'
  AND assignments.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test');

INSERT INTO work_breaks (id, work_record_id, started_at, ended_at)
SELECT
  'break-night-demo-' || lower(hex(randomblob(8))),
  records.id,
  records.scheduled_date || 'T23:30:00+09:00',
  date(records.scheduled_date, '+1 day') || 'T00:15:00+09:00'
FROM work_records records
WHERE records.group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND records.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test')
  AND records.scheduled_end_time = '26:00';

INSERT OR IGNORE INTO memo_folders (id, group_id, name, created_by) VALUES
  ('memo-folder-night-staff-daily', 'seed-group-night-staff', '日報', 'night-manager@local.test'),
  ('memo-folder-night-staff-improvement', 'seed-group-night-staff', '課題・改善', 'night-manager@local.test'),
  ('memo-folder-night-cast-daily', 'seed-group-night-cast', '日報', 'night-manager@local.test'),
  ('memo-folder-night-cast-improvement', 'seed-group-night-cast', '課題・改善', 'night-manager@local.test');

INSERT INTO memos (id, group_id, folder_id, author_email, target_date, title, body, visibility, created_at, updated_at) VALUES
  ('memo-night-staff-a-0701', 'seed-group-night-staff', 'memo-folder-night-staff-daily', 'night-staff-a@local.test', '2026-07-01', '7/1 日報', '開店準備とスタッフ間の引継ぎを確認。大きな問題なし。', 'managers', '2026-07-01T23:00:00+09:00', '2026-07-01T23:00:00+09:00'),
  ('memo-night-staff-a-0704', 'seed-group-night-staff', 'memo-folder-night-staff-daily', 'night-staff-a@local.test', '2026-07-04', '7/4 日報', '客数が少なく、25:15で早上がり。閉店作業は通常どおり完了。', 'managers', '2026-07-05T02:00:00+09:00', '2026-07-05T02:00:00+09:00'),
  ('memo-night-staff-a-0711', 'seed-group-night-staff', 'memo-folder-night-staff-improvement', 'night-staff-a@local.test', '2026-07-10', '繁忙日の延長連絡', '繁忙日に26:00を超えて延長した。延長が決まった時点で管理者へ共有する流れを明確にしたい。', 'managers', '2026-07-11T03:30:00+09:00', '2026-07-11T03:30:00+09:00'),
  ('memo-night-staff-a-0716', 'seed-group-night-staff', 'memo-folder-night-staff-daily', 'night-staff-a@local.test', '2026-07-16', '7/16 日報', '通常営業。新人スタッフへの開店準備説明を実施。', 'managers', '2026-07-17T02:30:00+09:00', '2026-07-17T02:30:00+09:00'),
  ('memo-night-cast-a-0703', 'seed-group-night-cast', 'memo-folder-night-cast-daily', 'night-cast-a@local.test', '2026-07-03', '7/3 日報', '同伴のお客様について来店時間を確認。勤務開始時に状況を共有した。', 'managers', '2026-07-04T02:30:00+09:00', '2026-07-04T02:30:00+09:00'),
  ('memo-night-cast-a-0705', 'seed-group-night-cast', 'memo-folder-night-cast-daily', 'night-cast-a@local.test', '2026-07-05', '7/5 日報', '同伴対応で20分遅刻。勤務申告の備考にも理由を記載した。', 'managers', '2026-07-06T02:30:00+09:00', '2026-07-06T02:30:00+09:00'),
  ('memo-night-cast-a-0712', 'seed-group-night-cast', 'memo-folder-night-cast-improvement', 'night-cast-a@local.test', '2026-07-12', '早上がり時の連絡方法', '客数が少ない日の早上がりについて、退勤前に管理者へ連絡する運用を確認したい。', 'managers', '2026-07-13T02:00:00+09:00', '2026-07-13T02:00:00+09:00'),
  ('memo-night-cast-a-0719', 'seed-group-night-cast', 'memo-folder-night-cast-daily', 'night-cast-a@local.test', '2026-07-19', '7/19 日報', '同伴対応で開始が少し遅れた。次回は開始前に連絡する。', 'managers', '2026-07-20T02:30:00+09:00', '2026-07-20T02:30:00+09:00');
-- Nightclub cast slots are two-hour blocks. Rebuild the July/August schedules so
-- normal days show an early shift (18:00-22:00) and a late shift (20:00-close).
DELETE FROM work_breaks
WHERE work_record_id IN (SELECT id FROM work_records WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM work_records WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');
DELETE FROM shift_request_submissions
WHERE period_id IN (SELECT id FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_requests
WHERE period_id IN (SELECT id FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_request_periods WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');
DELETE FROM shift_assignments
WHERE slot_id IN (SELECT id FROM shift_slots WHERE plan_id IN (SELECT id FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast')));
DELETE FROM shift_slots
WHERE plan_id IN (SELECT id FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast'));
DELETE FROM shift_plans WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast');

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-night-staff-plan-july-month', 'seed-group-night-staff', '7月スタッフシフト', '2026-07-01', '2026-07-31', '17:00', '26:00', 60, 1, '月曜休業。営業日はスタッフ1名を17:00〜26:00に配置。', 'published', 'night-manager@local.test'),
  ('seed-night-cast-plan-july-month', 'seed-group-night-cast', '7月キャストシフト', '2026-07-01', '2026-07-31', '18:00', '26:00', 120, 1, '2時間枠。通常日は早出18:00〜22:00と遅出20:00〜26:00、金土日・祝前日は各2名。', 'published', 'night-manager@local.test'),
  ('seed-night-staff-plan-august-month', 'seed-group-night-staff', '8月スタッフシフト', '2026-08-01', '2026-08-31', '17:00', '26:00', 60, 1, '月曜休業。希望受付中。', 'draft', 'night-manager@local.test'),
  ('seed-night-cast-plan-august-month', 'seed-group-night-cast', '8月キャストシフト', '2026-08-01', '2026-08-31', '18:00', '26:00', 120, 1, '2時間枠。希望受付中。', 'draft', 'night-manager@local.test');

WITH RECURSIVE dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31')
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-staff-jul-' || replace(date, '-', ''), 'seed-night-staff-plan-july-month', date, '17:00', '26:00', 1, 'スタッフ'
FROM dates WHERE strftime('%w', date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31'), blocks(start_time, end_time) AS (VALUES ('18:00', '20:00'), ('20:00', '22:00'), ('22:00', '24:00'), ('24:00', '26:00'))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-cast-jul-' || replace(dates.date, '-', '') || '-' || replace(blocks.start_time, ':', ''), 'seed-night-cast-plan-july-month', dates.date, blocks.start_time, blocks.end_time,
  CASE WHEN strftime('%w', dates.date) IN ('0', '5', '6') AND blocks.start_time = '20:00' THEN 4
       WHEN strftime('%w', dates.date) IN ('0', '5', '6') THEN 2
       WHEN blocks.start_time = '20:00' THEN 2 ELSE 1 END,
  'キャスト'
FROM dates CROSS JOIN blocks WHERE strftime('%w', dates.date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-08-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-31'), blocks(start_time, end_time) AS (VALUES ('18:00', '20:00'), ('20:00', '22:00'), ('22:00', '24:00'), ('24:00', '26:00'))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-cast-aug-' || replace(dates.date, '-', '') || '-' || replace(blocks.start_time, ':', ''), 'seed-night-cast-plan-august-month', dates.date, blocks.start_time, blocks.end_time,
  CASE WHEN strftime('%w', dates.date) IN ('0', '5', '6') AND blocks.start_time = '20:00' THEN 4
       WHEN strftime('%w', dates.date) IN ('0', '5', '6') THEN 2
       WHEN blocks.start_time = '20:00' THEN 2 ELSE 1 END,
  'キャスト'
FROM dates CROSS JOIN blocks WHERE strftime('%w', dates.date) <> '1';

WITH RECURSIVE dates(date) AS (SELECT '2026-08-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-31')
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'night-staff-aug-' || replace(date, '-', ''), 'seed-night-staff-plan-august-month', date, '17:00', '26:00', 1, 'スタッフ'
FROM dates WHERE strftime('%w', date) <> '1';

WITH members(idx, user_email) AS (VALUES (0, 'night-staff-a@local.test'), (1, 'night-staff-b@local.test'), (2, 'night-staff-c@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT 'night-assignment-' || slots.id, slots.id, members.user_email FROM shift_slots slots CROSS JOIN members
WHERE slots.plan_id = 'seed-night-staff-plan-july-month' AND members.idx = (CAST(julianday(slots.date) - julianday('2026-07-01') AS INTEGER) % 3);

WITH members(idx, user_email) AS (VALUES (0, 'night-cast-a@local.test'), (1, 'night-cast-b@local.test'), (2, 'night-cast-c@local.test'), (3, 'night-cast-d@local.test'), (4, 'night-cast-e@local.test'), (5, 'night-cast-f@local.test')),
slot_days AS (
  SELECT slots.*, CAST(julianday(slots.date) - julianday('2026-07-01') AS INTEGER) % 6 AS day_index
  FROM shift_slots slots
  WHERE slots.plan_id = 'seed-night-cast-plan-july-month'
)
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT 'night-cast-assignment-' || slots.id || '-' || members.idx, slots.id, members.user_email
FROM slot_days slots CROSS JOIN members
WHERE ((members.idx -
  CASE
    WHEN slots.start_time = '18:00' THEN slots.day_index
    WHEN slots.start_time = '20:00' THEN (slots.day_index + 2) % 6
    ELSE (slots.day_index + 3) % 6
  END + 6) % 6) < slots.required_count;

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-night-staff-request-july-month', 'seed-group-night-staff', 'seed-night-staff-plan-july-month', '7月スタッフ希望（受付終了）', '2026-06-20', '2026-06-25', 'closed', 'night-manager@local.test'),
  ('seed-night-cast-request-july-month', 'seed-group-night-cast', 'seed-night-cast-plan-july-month', '7月キャスト希望（受付終了）', '2026-06-20', '2026-06-25', 'closed', 'night-manager@local.test'),
  ('seed-night-staff-request-august-month', 'seed-group-night-staff', 'seed-night-staff-plan-august-month', '8月スタッフ希望', '2026-07-20', '2026-07-30', 'open', 'night-manager@local.test'),
  ('seed-night-cast-request-august-month', 'seed-group-night-cast', 'seed-night-cast-plan-august-month', '8月キャスト希望', '2026-07-20', '2026-07-30', 'open', 'night-manager@local.test');

-- Final monthly schedule attendance fixture for staff A and cast A.
INSERT INTO work_records (
  id, group_id, plan_id, slot_id, user_email, scheduled_date,
  scheduled_start_time, scheduled_end_time, started_at, ended_at,
  claimed_start_at, claimed_end_at, claimed_break_minutes, status,
  employee_note, manager_note, approved_by, approved_at
)
SELECT
  'wr-night-final2-' || lower(hex(randomblob(8))),
  CASE WHEN slots.plan_id = 'seed-night-staff-plan-july-month'
    THEN 'seed-group-night-staff' ELSE 'seed-group-night-cast' END,
  slots.plan_id, slots.id, assignments.user_email, slots.date,
  slots.start_time, slots.end_time,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE
    WHEN slots.end_time = '26:00' THEN date(slots.date, '+1 day') || 'T02:00:00+09:00'
    WHEN slots.end_time = '24:00' THEN date(slots.date, '+1 day') || 'T00:00:00+09:00'
    ELSE slots.date || 'T' || slots.end_time || ':00+09:00'
  END,
  CASE WHEN slots.end_time = '26:00' THEN 45 ELSE 0 END,
  CASE
    WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12' THEN 'rejected'
    WHEN slots.date = '2026-07-19' THEN 'submitted'
    ELSE 'approved'
  END,
  '',
  CASE WHEN assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12'
    THEN '早上がりの理由と申告時刻を確認してください。' ELSE '' END,
  CASE WHEN slots.date < '2026-07-19'
    AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
    THEN 'night-manager@local.test' ELSE NULL END,
  CASE WHEN slots.date < '2026-07-19'
    AND NOT (assignments.user_email = 'night-cast-a@local.test' AND slots.date = '2026-07-12')
    THEN '2026-07-20T09:00:00.000Z' ELSE NULL END
FROM shift_slots slots
JOIN shift_assignments assignments ON assignments.slot_id = slots.id
WHERE slots.plan_id IN ('seed-night-staff-plan-july-month', 'seed-night-cast-plan-july-month')
  AND slots.date <= '2026-07-20'
  AND assignments.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test');

UPDATE work_records
SET ended_at = date(scheduled_date, '+1 day') || 'T01:15:00+09:00', claimed_end_at = date(scheduled_date, '+1 day') || 'T01:15:00+09:00', employee_note = '客数が少なく、25:15で早上がりしました。'
WHERE group_id = 'seed-group-night-staff' AND user_email = 'night-staff-a@local.test' AND scheduled_date = '2026-07-04' AND scheduled_end_time = '26:00';
UPDATE work_records
SET ended_at = date(scheduled_date, '+1 day') || 'T03:00:00+09:00', claimed_end_at = date(scheduled_date, '+1 day') || 'T03:00:00+09:00', employee_note = '繁忙日のため26:00を超えて延長しました。'
WHERE group_id = 'seed-group-night-staff' AND user_email = 'night-staff-a@local.test' AND scheduled_date = '2026-07-10' AND scheduled_end_time = '26:00';
UPDATE work_records
SET started_at = scheduled_date || 'T20:20:00+09:00', claimed_start_at = scheduled_date || 'T20:20:00+09:00', employee_note = '同伴対応のため20分遅刻しました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test' AND scheduled_date = '2026-07-05' AND scheduled_start_time = '20:00';
UPDATE work_records
SET ended_at = scheduled_date || 'T19:30:00+09:00', claimed_end_at = scheduled_date || 'T19:30:00+09:00', employee_note = '客数が少なく、19:30で早上がりしました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test' AND scheduled_date = '2026-07-12' AND scheduled_start_time = '18:00';
UPDATE work_records
SET started_at = scheduled_date || 'T18:10:00+09:00', claimed_start_at = scheduled_date || 'T18:10:00+09:00', employee_note = '同伴対応のため開始が少し遅れました。'
WHERE group_id = 'seed-group-night-cast' AND user_email = 'night-cast-a@local.test' AND scheduled_date = '2026-07-19' AND scheduled_start_time = '18:00';

UPDATE work_records
SET started_at = date(scheduled_date, '+1 day') || 'T00:00:00+09:00',
    claimed_start_at = date(scheduled_date, '+1 day') || 'T00:00:00+09:00'
WHERE group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test')
  AND scheduled_start_time = '24:00';

INSERT INTO work_breaks (id, work_record_id, started_at, ended_at)
SELECT 'break-night-final2-' || lower(hex(randomblob(8))), records.id, records.scheduled_date || 'T23:30:00+09:00', date(records.scheduled_date, '+1 day') || 'T00:15:00+09:00'
FROM work_records records
WHERE records.group_id IN ('seed-group-night-staff', 'seed-group-night-cast')
  AND records.user_email IN ('night-staff-a@local.test', 'night-cast-a@local.test')
  AND records.scheduled_end_time = '26:00';

-- Nightclub business guides. One guide per group, with a reusable illustration
-- embedded in the staff guide for the preview and member AI context.
INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-night-staff-guide', 'seed-group-night-staff', '業務ガイド', 'night-manager@local.test'),
  ('knowledge-folder-night-cast-guide', 'seed-group-night-cast', '業務ガイド', 'night-manager@local.test');

INSERT INTO knowledge_pages (
  id, group_id, folder_id, author_email, title, body, status, image_url, image_alt,
  created_at, updated_at
) VALUES
  (
    'knowledge-night-staff-opening-check',
    'seed-group-night-staff',
    'knowledge-folder-night-staff-guide',
    'night-manager@local.test',
    '開店前チェックとスタッフの引継ぎ',
    '# 開店前チェックとスタッフの引継ぎ\n\n営業開始前に、次の順番で確認します。\n\n1. 店内・バックヤードの安全確認をする。\n2. 予約・連絡事項・当日の配置を確認する。\n3. キャストの出勤状況と変更事項を確認する。\n4. 不足や設備不良があれば、開店前に店長へ連絡する。\n5. 引継ぎ事項は業務メモの「日報」または「課題・改善」に残す。\n\n![開店前の勤務確認イメージ](/knowledge/nightclub-opening-check.png)\n\n## 勤務時間の変更\n\n客数による早上がりや繁忙日の延長が決まった場合は、退勤前に店長へ共有します。実際の開始・終了時刻と理由は勤務申告の備考にも記録してください。',
    'published',
    '/knowledge/nightclub-opening-check.png',
    '開店前に勤務予定と引継ぎを確認するスタッフのイラスト',
    '2026-07-20T12:00:00+09:00',
    '2026-07-20T12:00:00+09:00'
  ),
  (
    'knowledge-night-cast-attendance-notes',
    'seed-group-night-cast',
    'knowledge-folder-night-cast-guide',
    'night-manager@local.test',
    '同伴・遅刻・早上がりの勤務申告',
    '# 同伴・遅刻・早上がりの勤務申告\n\n同伴などで予定時刻に遅れる場合は、勤務開始後に実際の開始時刻と理由を勤務申告の備考へ残します。例：\n\n> 同伴対応のため20分遅刻しました。\n\n客数が少なく早上がりした場合や、繁忙日に延長した場合も、実際の終了時刻を入力し、理由を一言添えてください。\n\n- 遅刻：実際の開始時刻と理由を記録\n- 早上がり：実際の終了時刻と客数などの理由を記録\n- 延長：実際の終了時刻と延長理由を記録\n\n管理者はシフト予定との差分と備考を確認し、問題がなければ日次承認します。',
    'published',
    NULL,
    '',
    '2026-07-20T12:05:00+09:00',
    '2026-07-20T12:05:00+09:00'
  );

-- SQLite keeps backslashes literally in seed strings; normalize the Markdown
-- line breaks so the preview renders headings and lists correctly.
UPDATE knowledge_pages
SET body = replace(body, '\n', char(10))
WHERE id IN ('knowledge-night-staff-opening-check', 'knowledge-night-cast-attendance-notes');

-- Sample store guide and a few member work memos for the demo scenario.
INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-store-guide', 'seed-group-store', '業務ガイド', 'tanaka@local.test');

INSERT INTO knowledge_pages (
  id, group_id, folder_id, author_email, title, body, status, image_url, image_alt,
  created_at, updated_at
) VALUES (
  'knowledge-store-shift-basics',
  'seed-group-store',
  'knowledge-folder-store-guide',
  'tanaka@local.test',
  'サンプル店のシフト運用ガイド',
  '# サンプル店のシフト運用ガイド\n\n## 勤務前\n\n- シフト一覧で自分の担当と時間を確認します。\n- 開始時刻になったら勤務開始を記録します。\n- 変更や遅刻がある場合は、勤務申告の備考に理由を残します。\n\n## 勤務後\n\n- 休憩時間を確認して勤務終了を記録します。\n- 早上がり・延長・欠勤など、予定と違う場合は具体的に記入します。\n- 店舗の改善提案は業務メモの「課題・改善」に残します。\n\n> 困ったときは、まず店長または副店長へ連絡してください。',
  'published',
  NULL,
  '',
  '2026-07-20T12:10:00+09:00',
  '2026-07-20T12:10:00+09:00'
);

UPDATE knowledge_pages
SET body = replace(body, '\n', char(10))
WHERE id = 'knowledge-store-shift-basics';

INSERT OR IGNORE INTO memo_folders (id, group_id, name, created_by) VALUES
  ('memo-folder-store-daily', 'seed-group-store', '日報', 'tanaka@local.test'),
  ('memo-folder-store-improvement', 'seed-group-store', '課題・改善', 'tanaka@local.test');

INSERT INTO memos (id, group_id, folder_id, author_email, target_date, title, body, visibility, created_at, updated_at) VALUES
  ('memo-store-tanaka-0701', 'seed-group-store', 'memo-folder-store-daily', 'tanaka@local.test', '2026-07-01', '7/1 日報', '月初の配置を確認。ホールと厨房の引継ぎは問題なし。', 'managers', '2026-07-01T20:00:00+09:00', '2026-07-01T20:00:00+09:00'),
  ('memo-store-member02-0705', 'seed-group-store', 'memo-folder-store-daily', 'member02@local.test', '2026-07-05', '7/5 日報', '夕方から勤務。ピーク前に備品の補充を確認した。', 'managers', '2026-07-05T22:30:00+09:00', '2026-07-05T22:30:00+09:00'),
  ('memo-store-member04-0708', 'seed-group-store', 'memo-folder-store-daily', 'member04@local.test', '2026-07-08', '7/8 日報', '昼の時間帯は落ち着いていた。退勤時に厨房へ引継ぎを行った。', 'managers', '2026-07-08T17:30:00+09:00', '2026-07-08T17:30:00+09:00'),
  ('memo-store-member06-0712', 'seed-group-store', 'memo-folder-store-improvement', 'member06@local.test', '2026-07-12', '夕方の補充動線', '17時台にホールと厨房の補充が重なるため、置き場所を決めると作業が短くなりそう。', 'managers', '2026-07-12T23:00:00+09:00', '2026-07-12T23:00:00+09:00'),
  ('memo-store-tanaka-0716', 'seed-group-store', 'memo-folder-store-improvement', 'tanaka@local.test', '2026-07-16', '後半シフトの確認事項', '日跨ぎ枠の終了時刻と翌日の予定を、公開前にもう一度確認する。', 'managers', '2026-07-16T12:00:00+09:00', '2026-07-16T12:00:00+09:00');

-- 焼き肉店の実務検証シナリオ。
-- 店長は配置対象外。ポジション適性は group_members.admin_note に記載し、
-- 運営支援AIが希望・可否・人員不足と合わせて割当案を作れるようにする。
INSERT INTO account_profiles (user_email, nickname) VALUES
  ('yakiniku-manager@local.test', '焼肉店長'),
  ('yakiniku-submanager@local.test', '副店長（焼肉店）'),
  ('yakiniku-hall-a@local.test', 'ホールA'),
  ('yakiniku-hall-b@local.test', 'ホールB'),
  ('yakiniku-kitchen-a@local.test', '厨房A'),
  ('yakiniku-kitchen-b@local.test', '厨房B'),
  ('yakiniku-wash-a@local.test', '洗い場A'),
  ('yakiniku-flex-a@local.test', '兼任A');

INSERT INTO site_users (id, user_email, display_name, status, is_site_admin, can_create_groups) VALUES
  ('seed-site-yakiniku-manager', 'yakiniku-manager@local.test', '焼肉店長', 'active', 0, 1),
  ('seed-site-yakiniku-submanager', 'yakiniku-submanager@local.test', '副店長（焼肉店）', 'active', 0, 0),
  ('seed-site-yakiniku-hall-a', 'yakiniku-hall-a@local.test', 'ホールA', 'active', 0, 0),
  ('seed-site-yakiniku-hall-b', 'yakiniku-hall-b@local.test', 'ホールB', 'active', 0, 0),
  ('seed-site-yakiniku-kitchen-a', 'yakiniku-kitchen-a@local.test', '厨房A', 'active', 0, 0),
  ('seed-site-yakiniku-kitchen-b', 'yakiniku-kitchen-b@local.test', '厨房B', 'active', 0, 0),
  ('seed-site-yakiniku-wash-a', 'yakiniku-wash-a@local.test', '洗い場A', 'active', 0, 0),
  ('seed-site-yakiniku-flex-a', 'yakiniku-flex-a@local.test', '兼任A', 'active', 0, 0);

INSERT INTO groups (id, name, description, owner_email, labor_consecutive_days_limit) VALUES
  ('seed-group-yakiniku', '焼肉店（実務検証）', 'ポジション適性を考慮した焼肉店のシフト割当テスト用グループ', 'yakiniku-manager@local.test', 6);

INSERT INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-yakiniku', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);

INSERT INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-yakiniku-manager', 'seed-group-yakiniku', 'yakiniku-manager@local.test', '焼肉店長', '店舗責任者。シフトには入らず、最終判断と公開を担当。', 'owner', 'active', 1),
  ('seed-yakiniku-submanager', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', '副店長', 'ホール・厨房の両方を担当可能。繁忙日のリーダー候補。', 'editor', 'active', 1),
  ('seed-yakiniku-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'ホールA', 'ホール接客・ウェイティング担当。厨房には原則入らない。', 'member', 'active', 1),
  ('seed-yakiniku-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'ホールB', 'ホール接客・ドリンク担当。ピーク帯の接客経験あり。', 'member', 'active', 1),
  ('seed-yakiniku-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', '厨房A', '肉場・仕込み担当。ホール配置は不可。', 'member', 'active', 1),
  ('seed-yakiniku-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', '厨房B', 'サラダ場・スープ場・仕込み担当。ピーク帯の厨房を優先。', 'member', 'active', 1),
  ('seed-yakiniku-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', '洗い場A', '洗い場担当。繁忙時間は厨房補助も可能。', 'member', 'active', 1),
  ('seed-yakiniku-flex-a', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', '兼任A', 'ホール・ドリンク・洗い場を担当可能。人員不足時の調整候補。', 'member', 'active', 1);

INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-yakiniku-pref-manager', 'seed-group-yakiniku', 'yakiniku-manager@local.test', 0, 0, 0, 0, 'any', '店舗責任者。シフトには入らない。'),
  ('seed-yakiniku-pref-submanager', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 3, 6, 18, 40, 'any', 'ホール・厨房の両方を担当可能。繁忙日のリーダー候補。'),
  ('seed-yakiniku-pref-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 2, 5, 12, 32, 'any', 'ホール接客・ウェイティング担当。'),
  ('seed-yakiniku-pref-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 2, 5, 12, 32, 'any', 'ホール接客・ドリンク担当。'),
  ('seed-yakiniku-pref-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', 2, 5, 12, 32, 'any', '肉場・仕込み担当。'),
  ('seed-yakiniku-pref-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', 2, 5, 12, 32, 'any', 'サラダ場・スープ場・仕込み担当。'),
  ('seed-yakiniku-pref-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', 2, 5, 12, 32, 'any', '洗い場担当。繁忙時間は厨房補助も可能。'),
  ('seed-yakiniku-pref-flex-a', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 2, 5, 12, 32, 'any', 'ホール・ドリンク・洗い場を担当可能。');

WITH users(user_email) AS (VALUES
  ('yakiniku-submanager@local.test'), ('yakiniku-hall-a@local.test'), ('yakiniku-hall-b@local.test'),
  ('yakiniku-kitchen-a@local.test'), ('yakiniku-kitchen-b@local.test'), ('yakiniku-wash-a@local.test'),
  ('yakiniku-flex-a@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT 'yakiniku-availability-' || lower(hex(randomblob(8))), 'seed-group-yakiniku', users.user_email,
  days.day_of_week, 'possible', '10:00', '24:00', '昼・夜のポジション枠に合わせて調整可能。'
FROM users CROSS JOIN days;

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-yakiniku-plan-august-first', 'seed-group-yakiniku', '焼肉店 8月前半シフト', '2026-08-01', '2026-08-15', '11:00', '23:00', 60, 1,
   '店長は配置対象外。平日は昼2名・夜3名の計5名、土日は昼3名・夜4名の計7名。肉場・サラダ場・スープ場・洗い場・ホール・ドリンクの適性を考慮して割り当てる。', 'draft', 'yakiniku-manager@local.test');

WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-01'
  UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'yakiniku-slot-' || date || '-lunch-hall', 'seed-yakiniku-plan-august-first', date, '11:00', '15:00',
  CASE WHEN strftime('%w', date) IN ('0', '6') THEN 2 ELSE 1 END, 'ホール'
FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-lunch-kitchen', 'seed-yakiniku-plan-august-first', date, '11:00', '15:00', 1, '厨房'
FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-dinner-hall', 'seed-yakiniku-plan-august-first', date, '17:00', '23:00',
  CASE WHEN strftime('%w', date) IN ('0', '6') THEN 2 ELSE 1 END, 'ホール'
FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-dinner-kitchen', 'seed-yakiniku-plan-august-first', date, '17:00', '23:00', 1, '厨房'
FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-dinner-wash', 'seed-yakiniku-plan-august-first', date, '17:00', '23:00', 1, '洗い場'
FROM dates;

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-yakiniku-request-august-first', 'seed-group-yakiniku', 'seed-yakiniku-plan-august-first', '焼肉店 8月前半希望', '2026-07-20', '2026-07-30', 'open', 'yakiniku-manager@local.test');

INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-yakiniku-guide', 'seed-group-yakiniku', '業務ガイド', 'yakiniku-manager@local.test');
INSERT INTO knowledge_pages (id, group_id, folder_id, author_email, title, body, status, image_url, image_alt, created_at, updated_at) VALUES
  ('knowledge-yakiniku-position-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店のポジション運用',
   '# 焼肉店のポジション運用\n\n- 肉場・サラダ場・スープ場・洗い場は厨房系の適性を確認する。\n- ホール・ウェイティング・ドリンクは接客系の適性を確認する。\n- 急な欠勤時は、兼任Aと副店長を代替候補として確認する。\n- AIの割当案はたたき台として使い、最終公開前に店長がポジションを確認する。',
   'published', NULL, '', '2026-07-21T12:00:00+09:00', '2026-07-21T12:00:00+09:00');
UPDATE knowledge_pages SET body = replace(body, '\\n', char(10)) WHERE id = 'knowledge-yakiniku-position-guide';

-- 担当マスタのサンプル。担当なしの既存枠は従来どおり全員候補のままにし、
-- 担当付き枠を作ったときだけ member_duties の明示登録を候補条件にする。
INSERT OR IGNORE INTO group_duties (id, group_id, name, description, display_order, status) VALUES
  ('duty-store-hall', 'seed-group-store', 'ホール', '接客・配膳を担当できます。', 1, 'active'),
  ('duty-store-kitchen', 'seed-group-store', '厨房', '調理・仕込みを担当できます。', 2, 'active');
INSERT OR IGNORE INTO member_duties (id, group_id, user_email, duty_id) VALUES
  ('member-duty-store-owner-hall', 'seed-group-store', 'tanaka@local.test', 'duty-store-hall'),
  ('member-duty-store-owner-kitchen', 'seed-group-store', 'tanaka@local.test', 'duty-store-kitchen'),
  ('member-duty-store-sub-hall', 'seed-group-store', 'member01@local.test', 'duty-store-hall'),
  ('member-duty-store-sub-kitchen', 'seed-group-store', 'member01@local.test', 'duty-store-kitchen'),
  ('member-duty-store-student-a', 'seed-group-store', 'member02@local.test', 'duty-store-hall'),
  ('member-duty-store-student-b', 'seed-group-store', 'member03@local.test', 'duty-store-hall'),
  ('member-duty-store-housewife-a', 'seed-group-store', 'member04@local.test', 'duty-store-hall'),
  ('member-duty-store-housewife-b', 'seed-group-store', 'member05@local.test', 'duty-store-hall'),
  ('member-duty-store-free-a-hall', 'seed-group-store', 'member06@local.test', 'duty-store-hall'),
  ('member-duty-store-free-a-kitchen', 'seed-group-store', 'member06@local.test', 'duty-store-kitchen'),
  ('member-duty-store-free-b-kitchen', 'seed-group-store', 'member07@local.test', 'duty-store-kitchen'),
  ('member-duty-store-part-a', 'seed-group-store', 'member08@local.test', 'duty-store-hall'),
  ('member-duty-store-part-b', 'seed-group-store', 'member09@local.test', 'duty-store-hall');

INSERT OR IGNORE INTO group_duties (id, group_id, name, description, display_order, status) VALUES
  ('duty-yakiniku-meat', 'seed-group-yakiniku', '肉場', '肉の盛り付け・提供を担当できます。', 1, 'active'),
  ('duty-yakiniku-salad-soup', 'seed-group-yakiniku', 'サラダ場・スープ場', 'サラダ・スープ・仕込みを担当できます。', 2, 'active'),
  ('duty-yakiniku-drink', 'seed-group-yakiniku', 'ドリンク場', 'ドリンク作成・提供を担当できます。', 3, 'active'),
  ('duty-yakiniku-wash', 'seed-group-yakiniku', '洗い場', '洗い場を担当できます。', 4, 'active'),
  ('duty-yakiniku-hall', 'seed-group-yakiniku', 'ホール接客', '接客・配膳を担当できます。', 5, 'active'),
  ('duty-yakiniku-waiting', 'seed-group-yakiniku', 'ウェイティング', '受付・案内を担当できます。', 6, 'active');
INSERT OR IGNORE INTO member_duties (id, group_id, user_email, duty_id) VALUES
  ('member-duty-yakiniku-manager-hall', 'seed-group-yakiniku', 'yakiniku-manager@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-manager-waiting', 'seed-group-yakiniku', 'yakiniku-manager@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-sub-hall', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-sub-waiting', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-a-waiting', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-b-drink', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', 'duty-yakiniku-meat'),
  ('member-duty-yakiniku-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', 'duty-yakiniku-salad-soup'),
  ('member-duty-yakiniku-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-flex-hall', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-flex-drink', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-wash', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-wash');

-- 焼肉店の代表枠に担当を紐付ける。既存の担当なし枠はそのまま残し、
-- 担当別の充足・未充足と担当不可の候補除外をシードで確認できるようにする。
UPDATE shift_slots
SET duty_id = 'duty-yakiniku-hall', duty_name_snapshot = 'ホール接客'
WHERE plan_id = 'seed-yakiniku-plan-august-first' AND role = 'ホール';
UPDATE shift_slots
SET duty_id = 'duty-yakiniku-meat', duty_name_snapshot = '肉場'
WHERE plan_id = 'seed-yakiniku-plan-august-first' AND role = '厨房';
UPDATE shift_slots
SET duty_id = 'duty-yakiniku-wash', duty_name_snapshot = '洗い場'
WHERE plan_id = 'seed-yakiniku-plan-august-first' AND role = '洗い場';
-- 8/8の昼厨房は、担当可能者1名に対して2名必要な未充足ケース。
UPDATE shift_slots
SET required_count = 2
WHERE id = 'yakiniku-slot-2026-08-08-lunch-kitchen';

-- 焼肉店ポジション割当デモの拡張。既存の8名に、利用可能な予備枠を2名追加し、
-- 代表的な時間帯・担当・希望差分・未充足・適性外を同じ下書きで確認できるようにする。
INSERT INTO account_profiles (user_email, nickname) VALUES
  ('yakiniku-hall-c@local.test', 'ホールC'),
  ('yakiniku-flex-b@local.test', '兼任B');
INSERT INTO site_users (id, user_email, display_name, status, is_site_admin, can_create_groups) VALUES
  ('seed-site-yakiniku-hall-c', 'yakiniku-hall-c@local.test', 'ホールC', 'active', 0, 0),
  ('seed-site-yakiniku-flex-b', 'yakiniku-flex-b@local.test', '兼任B', 'active', 0, 0);
INSERT INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-yakiniku-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'ホールC', 'ホール接客・ウェイティング担当。土日ピークにも対応可能。', 'member', 'active', 1),
  ('seed-yakiniku-flex-b', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', '兼任B', 'ドリンク・ウェイティング・洗い場を担当可能。平日中心の調整候補。', 'member', 'active', 1);
INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-yakiniku-pref-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 2, 5, 12, 32, 'prefer', '土日のピーク帯も可能。ホール接客を優先。'),
  ('seed-yakiniku-pref-flex-b', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 1, 4, 8, 24, 'avoid', '平日中心。ドリンク・ウェイティング・洗い場の兼任候補。');
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT 'yakiniku-availability-' || lower(hex(randomblob(8))), 'seed-group-yakiniku', user_email,
  day_of_week, 'possible', '14:00', '24:00', 'ポジション枠に合わせて調整可能。'
FROM (SELECT 'yakiniku-hall-c@local.test' AS user_email UNION ALL SELECT 'yakiniku-flex-b@local.test') users
CROSS JOIN (SELECT 0 AS day_of_week UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) days;
INSERT OR IGNORE INTO member_duties (id, group_id, user_email, duty_id) VALUES
  ('member-duty-yakiniku-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-c-waiting', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-drink', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-b-waiting', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-wash', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-wash');

-- 1日1担当を保ちつつ、時間帯ごとに必要な担当をcoverageDutyIdsで表現する。
DELETE FROM shift_assignments WHERE slot_id IN (SELECT id FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first');
DELETE FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first';
WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-01'
  UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role, duty_id, duty_name_snapshot, coverage_duty_ids)
SELECT 'yakiniku-slot-' || date || '-1400-hall', 'seed-yakiniku-plan-august-first', date, '14:00', '17:00', 1, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1400-kitchen', 'seed-yakiniku-plan-august-first', date, '14:00', '17:00', 1, '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1700-hall', 'seed-yakiniku-plan-august-first', date, '17:00', '18:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1700-kitchen', 'seed-yakiniku-plan-august-first', date, '17:00', '18:00', 1, '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1800-hall', 'seed-yakiniku-plan-august-first', date, '18:00', '19:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-drink"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1800-kitchen', 'seed-yakiniku-plan-august-first', date, '18:00', '19:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-meat","duty-yakiniku-salad-soup"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1900-hall', 'seed-yakiniku-plan-august-first', date, '19:00', '21:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 4 ELSE 3 END, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-drink"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-1900-kitchen', 'seed-yakiniku-plan-august-first', date, '19:00', '21:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-meat","duty-yakiniku-salad-soup"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-2100-hall', 'seed-yakiniku-plan-august-first', date, '21:00', '24:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting"]' FROM dates
UNION ALL SELECT 'yakiniku-slot-' || date || '-2100-kitchen', 'seed-yakiniku-plan-august-first', date, '21:00', '24:00', CASE WHEN strftime('%w', date) IN ('0','6') THEN 3 ELSE 2 END, 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-meat","duty-yakiniku-salad-soup"]' FROM dates;

-- 代表例：通常充足、土日ピークの体制不足、担当不可の割当を混在させる。
INSERT INTO shift_assignments (id, slot_id, user_email) VALUES
  ('yakiniku-assignment-0801-1400-hall', 'yakiniku-slot-2026-08-01-1400-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1400-kitchen', 'yakiniku-slot-2026-08-01-1400-kitchen', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1700-hall-a', 'yakiniku-slot-2026-08-01-1700-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1700-hall-b', 'yakiniku-slot-2026-08-01-1700-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0801-1700-kitchen', 'yakiniku-slot-2026-08-01-1700-kitchen', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1800-hall-a', 'yakiniku-slot-2026-08-01-1800-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1800-hall-b', 'yakiniku-slot-2026-08-01-1800-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0801-1800-kitchen-a', 'yakiniku-slot-2026-08-01-1800-kitchen', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1800-kitchen-b', 'yakiniku-slot-2026-08-01-1800-kitchen', 'yakiniku-kitchen-b@local.test'),
  ('yakiniku-assignment-0808-1900-hall-a', 'yakiniku-slot-2026-08-08-1900-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0808-1900-hall-b', 'yakiniku-slot-2026-08-08-1900-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0808-1900-kitchen-wrong', 'yakiniku-slot-2026-08-08-1900-kitchen', 'yakiniku-hall-a@local.test');

UPDATE groups
SET name = '焼肉店（ポジション割当デモ）',
    description = '担当可能範囲を見ながら、焼肉店の時間帯別ポジション割当・体制不足・希望差分を確認するデモシナリオ'
WHERE id = 'seed-group-yakiniku';
UPDATE shift_plans
SET notes = '店長は配置対象外。平日と土日で必要人数を変え、肉場・サラダ場・スープ場・ドリンク場・洗い場・ホール接客・ウェイティングの適性と希望差分を確認する下書きデモ。'
WHERE id = 'seed-yakiniku-plan-august-first';
UPDATE knowledge_pages
SET body = replace('# 焼肉店のポジション割当デモ\n\n## 担当の考え方\n\n- 肉場、サラダ場・スープ場、ドリンク場、洗い場、ホール接客、ウェイティングを別の担当として確認します。\n- ホール接客は配膳・接客、ウェイティングは受付・案内です。混雑時は別担当として体制を確認します。\n- 兼任者は不足時の候補ですが、同じ時間帯に複数枠へ重ねず、主担当を一つに置きます。\n\n## 試すケース\n\n1. 平日夕方：人数は足りても担当適性が偏るケース。\n2. 土日ピーク：必要人数と担当の体制不足が同時に出るケース。\n3. 欠勤想定：肉場・ホール候補が減ったときの候補と不足を確認するケース。\n\n割当案は下書きとして確認し、公開前に店長が担当と希望差分を確認します。', '\\n', char(10))
WHERE id = 'knowledge-yakiniku-position-guide';
