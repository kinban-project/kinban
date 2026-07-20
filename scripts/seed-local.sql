-- My Day local scenario seed
-- 7/1-7/31: completed and published shift fixtures
-- 8/1-8/15: shift-request acceptance fixture (closes 7/30)

DELETE FROM work_breaks;
DELETE FROM push_deliveries;
DELETE FROM push_subscriptions;
DELETE FROM monthly_work_claims;
DELETE FROM work_records;
DELETE FROM mcp_confirmations;
DELETE FROM assistant_contexts;
DELETE FROM assistant_message_executions;
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
DELETE FROM shift_slots;
DELETE FROM shift_plans;
DELETE FROM events;
DELETE FROM group_join_requests;
DELETE FROM group_members;
DELETE FROM groups;
DELETE FROM account_profiles;
DELETE FROM api_tokens;

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
  ('member09@local.test', 'パートB');

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-store', 'サンプル店', '勤務枠・シフト・勤務申告のテスト用グループ', 'tanaka@local.test');

-- Local seed only. The raw key is documented in kinban-manager-agent/.env.example.
-- Do not use this key outside the local development database.
INSERT INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-store', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);

INSERT INTO api_tokens (id, owner_email, name, token_type, group_id, scopes, token_hash, token_prefix) VALUES
  ('seed-token-assistant-local', 'tanaka@local.test', 'ローカルシード用 運営支援AIキー', 'assistant', 'seed-group-store',
   '["assistant:read","assistant:reply","shift:read","work:read","announcement:read"]',
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
  ('seed-member-09', 'seed-group-store', 'member09@local.test', 'パートB', '曜日相談可。', 'member', 'active', 1);

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
  ('seed-pref-09', 'seed-group-store', 'member09@local.test', 3, 5, 20, 36, 'any', '曜日は柔軟に相談可能。');

WITH users(user_email) AS (VALUES
  ('tanaka@local.test'), ('member01@local.test'), ('member02@local.test'), ('member03@local.test'),
  ('member04@local.test'), ('member05@local.test'), ('member06@local.test'), ('member07@local.test'),
  ('member08@local.test'), ('member09@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT lower(hex(randomblob(16))), 'seed-group-store', users.user_email, days.day_of_week,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN 'want'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') AND days.day_of_week IN (0, 6) THEN 'want'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN 'possible'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') AND days.day_of_week BETWEEN 1 AND 5 THEN 'want'
    WHEN users.user_email IN ('member06@local.test', 'member07@local.test', 'member08@local.test', 'member09@local.test') THEN 'possible'
    ELSE 'unavailable'
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '09:30'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN '17:00'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') THEN '09:30'
    ELSE '17:00'
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '30:00'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test') THEN '22:00'
    WHEN users.user_email IN ('member04@local.test', 'member05@local.test') THEN '17:00'
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
  ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2))
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

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-night-staff', 'A店スタッフ', 'ナイトクラブのスタッフ勤務を管理するサンプルグループ', 'night-manager@local.test'),
  ('seed-group-night-cast', 'A店キャスト', 'ナイトクラブのキャスト勤務を管理するサンプルグループ', 'night-manager@local.test');
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

-- Regional hospital scenario: weekday outpatient coverage, thin holiday/night emergency coverage.
INSERT INTO account_profiles (user_email, nickname) VALUES
  ('hospital-director@local.test', '院長'),
  ('hospital-doctor-senior@local.test', 'ベテラン医師'),
  ('hospital-resident@local.test', '研修医'),
  ('hospital-nurse-chief@local.test', '看護師長'),
  ('hospital-nurse-senior@local.test', 'ベテラン看護師'),
  ('hospital-nurse-mid@local.test', '中堅看護師'),
  ('hospital-nurse-junior-a@local.test', '若手看護師A'),
  ('hospital-nurse-junior-b@local.test', '若手看護師B'),
  ('hospital-nurse-night@local.test', '夜勤看護師'),
  ('hospital-reception-a@local.test', '受付A'),
  ('hospital-reception-b@local.test', '受付B'),
  ('hospital-aide-a@local.test', '看護助手A'),
  ('hospital-aide-b@local.test', '看護助手B');

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-hospital', '地域病院サンプル', '医師・看護師・受付別の病院勤務テスト用グループ', 'hospital-director@local.test');

INSERT INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-hospital', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);

INSERT INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-hospital-director', 'seed-group-hospital', 'hospital-director@local.test', '院長', '代表管理者。医師・看護師・受付の全体を確認する。', 'owner', 'active', 1),
  ('seed-hospital-doctor-senior', 'seed-group-hospital', 'hospital-doctor-senior@local.test', 'ベテラン医師', '医師。研修医の指導担当。研修医と同じ勤務帯に入れる。', 'member', 'active', 1),
  ('seed-hospital-resident', 'seed-group-hospital', 'hospital-resident@local.test', '研修医', '医師。単独勤務不可。原則としてベテラン医師と組ませる。', 'member', 'active', 1),
  ('seed-hospital-nurse-chief', 'seed-group-hospital', 'hospital-nurse-chief@local.test', '看護師長', '看護師。平日日勤中心。配置と新人フォローを担当。', 'member', 'active', 1),
  ('seed-hospital-nurse-senior', 'seed-group-hospital', 'hospital-nurse-senior@local.test', 'ベテラン看護師', '看護師。夜間は資格者として最低1名必要。', 'member', 'active', 1),
  ('seed-hospital-nurse-mid', 'seed-group-hospital', 'hospital-nurse-mid@local.test', '中堅看護師', '看護師。平日日勤と休日夜間の双方に対応。', 'member', 'active', 1),
  ('seed-hospital-nurse-junior-a', 'seed-group-hospital', 'hospital-nurse-junior-a@local.test', '若手看護師A', '看護師。日勤中心。ベテランまたは中堅と組ませる。', 'member', 'active', 1),
  ('seed-hospital-nurse-junior-b', 'seed-group-hospital', 'hospital-nurse-junior-b@local.test', '若手看護師B', '看護師。平日日勤中心。単独の夜勤配置は避ける。', 'member', 'active', 1),
  ('seed-hospital-nurse-night', 'seed-group-hospital', 'hospital-nurse-night@local.test', '夜勤看護師', '看護師。夜勤対応。休日夜間の固定候補。', 'member', 'active', 1),
  ('seed-hospital-reception-a', 'seed-group-hospital', 'hospital-reception-a@local.test', '受付A', '受付。平日日勤のみ。夜間・休日夜間は配置しない。', 'member', 'active', 1),
  ('seed-hospital-reception-b', 'seed-group-hospital', 'hospital-reception-b@local.test', '受付B', '受付。平日日勤のみ。受付Aの交代要員。', 'member', 'active', 1),
  ('seed-hospital-aide-a', 'seed-group-hospital', 'hospital-aide-a@local.test', '看護助手A', '看護助手。補助業務。医師・看護師の必要人数には含めない。', 'member', 'active', 1),
  ('seed-hospital-aide-b', 'seed-group-hospital', 'hospital-aide-b@local.test', '看護助手B', '看護助手。補助業務。医療資格者枠には含めない。', 'member', 'active', 1);

INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-hospital-pref-director', 'seed-group-hospital', 'hospital-director@local.test', 4, 5, 32, 40, 'any', '全体確認。医師・看護師・受付の不足を優先して確認。'),
  ('seed-hospital-pref-senior-doctor', 'seed-group-hospital', 'hospital-doctor-senior@local.test', 3, 5, 24, 40, 'any', '研修医と同じ勤務帯を優先。'),
  ('seed-hospital-pref-resident', 'seed-group-hospital', 'hospital-resident@local.test', 3, 4, 24, 32, 'any', '単独勤務不可。指導医との組み合わせが必要。'),
  ('seed-hospital-pref-nurse-senior', 'seed-group-hospital', 'hospital-nurse-senior@local.test', 3, 5, 24, 40, 'any', '夜勤対応可。夜間は資格者を最低1名配置。'),
  ('seed-hospital-pref-reception-a', 'seed-group-hospital', 'hospital-reception-a@local.test', 3, 5, 24, 40, 'prefer_off', '平日日勤のみ。'),
  ('seed-hospital-pref-aide-a', 'seed-group-hospital', 'hospital-aide-a@local.test', 2, 4, 16, 32, 'any', '看護助手。補助枠として配置。');

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-hospital-plan-august', 'seed-group-hospital', '8月第1週 病棟シフト', '2026-08-03', '2026-08-09', '08:30', '30:00', 60, 1, '平日日勤を厚め、休日夜間を薄めにする。研修医単独不可。夜勤はベテラン看護師または中堅以上を1名以上配置。受付は平日日勤のみ。', 'published', 'hospital-director@local.test');

WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-03' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-09'
), slot_defs(start_time, end_time, role) AS (
  VALUES ('08:30', '17:30', '医師'), ('08:30', '17:30', '看護師'), ('08:30', '17:30', '受付'),
         ('21:00', '30:00', '医師'), ('21:00', '30:00', '看護師')
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT 'slot-hospital-' || lower(hex(randomblob(8))), 'seed-hospital-plan-august', dates.date, slot_defs.start_time, slot_defs.end_time,
  CASE
    WHEN slot_defs.start_time = '08:30' AND slot_defs.role = '医師' AND strftime('%w', dates.date) BETWEEN '1' AND '5' THEN 2
    WHEN slot_defs.start_time = '08:30' AND slot_defs.role = '看護師' AND strftime('%w', dates.date) BETWEEN '1' AND '5' THEN 3
    WHEN slot_defs.start_time = '08:30' AND slot_defs.role = '看護師' THEN 2
    WHEN slot_defs.start_time = '08:30' AND slot_defs.role = '受付' THEN 1
    WHEN slot_defs.start_time = '21:00' AND slot_defs.role = '医師' THEN 1
    ELSE 2
  END,
  slot_defs.role
FROM dates JOIN slot_defs ON 1 = 1
WHERE slot_defs.start_time = '21:00'
   OR (slot_defs.start_time = '08:30' AND slot_defs.role <> '受付')
   OR (slot_defs.start_time = '08:30' AND slot_defs.role = '受付' AND strftime('%w', dates.date) BETWEEN '1' AND '5');

WITH assignees(date, start_time, role, user_email) AS (VALUES
  ('2026-08-03', '08:30', '医師', 'hospital-doctor-senior@local.test'),
  ('2026-08-03', '08:30', '医師', 'hospital-resident@local.test'),
  ('2026-08-03', '08:30', '看護師', 'hospital-nurse-chief@local.test'),
  ('2026-08-03', '08:30', '看護師', 'hospital-nurse-senior@local.test'),
  ('2026-08-03', '08:30', '看護師', 'hospital-nurse-junior-a@local.test'),
  ('2026-08-03', '08:30', '受付', 'hospital-reception-a@local.test'),
  ('2026-08-08', '08:30', '医師', 'hospital-doctor-senior@local.test'),
  ('2026-08-08', '08:30', '看護師', 'hospital-nurse-mid@local.test'),
  ('2026-08-08', '08:30', '看護師', 'hospital-nurse-junior-b@local.test'),
  ('2026-08-08', '21:00', '医師', 'hospital-doctor-senior@local.test'),
  ('2026-08-08', '21:00', '看護師', 'hospital-nurse-senior@local.test'),
  ('2026-08-08', '21:00', '看護師', 'hospital-nurse-night@local.test'),
  ('2026-08-09', '21:00', '医師', 'hospital-doctor-senior@local.test'),
  ('2026-08-09', '21:00', '看護師', 'hospital-nurse-night@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email
FROM shift_slots slots JOIN assignees
  ON assignees.date = slots.date AND assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id = 'seed-hospital-plan-august';

INSERT INTO work_records (id, group_id, plan_id, slot_id, user_email, scheduled_date, scheduled_start_time, scheduled_end_time, started_at, ended_at, claimed_start_at, claimed_end_at, claimed_break_minutes, status, employee_note, manager_note, approved_by, approved_at)
SELECT 'wr-hospital-' || lower(hex(randomblob(8))), 'seed-group-hospital', slots.plan_id, slots.id, assignments.user_email, slots.date, slots.start_time, slots.end_time,
  slots.date || 'T' || slots.start_time || ':00+09:00',
  CASE WHEN slots.end_time = '30:00' THEN date(slots.date, '+1 day') || 'T06:00:00+09:00' ELSE slots.date || 'T' || slots.end_time || ':00+09:00' END,
  slots.date || 'T' || slots.start_time || ':05:00+09:00',
  CASE WHEN slots.end_time = '30:00' THEN date(slots.date, '+1 day') || 'T06:05:00+09:00' ELSE slots.date || 'T' || slots.end_time || ':05:00+09:00' END,
  CASE WHEN assignments.user_email = 'hospital-nurse-night@local.test' THEN 60 ELSE 45 END,
  CASE WHEN assignments.user_email = 'hospital-resident@local.test' THEN 'submitted'
       WHEN assignments.user_email = 'hospital-nurse-night@local.test' AND slots.date = '2026-08-09' THEN 'rejected'
       ELSE 'approved' END,
  CASE WHEN assignments.user_email = 'hospital-resident@local.test' THEN '研修医。ベテラン医師と同じ勤務帯で勤務。' ELSE '' END,
  CASE WHEN assignments.user_email = 'hospital-nurse-night@local.test' AND slots.date = '2026-08-09' THEN '休日夜間の休憩時間を確認してください。' ELSE '' END,
  CASE WHEN assignments.user_email = 'hospital-resident@local.test' THEN NULL ELSE 'hospital-director@local.test' END,
  CASE WHEN assignments.user_email = 'hospital-resident@local.test' THEN NULL ELSE '2026-08-10T09:00:00.000Z' END
FROM shift_slots slots JOIN shift_assignments assignments ON assignments.slot_id = slots.id
WHERE slots.plan_id = 'seed-hospital-plan-august';

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-hospital-request-august', 'seed-group-hospital', 'seed-hospital-plan-august', '8月第2週勤務希望', '2026-07-25', '2026-07-30', 'closed', 'hospital-director@local.test');
INSERT INTO group_announcements (id, group_id, created_by, title, body) VALUES
  ('seed-hospital-announcement-01', 'seed-group-hospital', 'hospital-director@local.test', '休日夜間の体制について', '休日夜間は受付なし。緊急時は看護師が初期対応し、必要に応じて医師へ連絡してください。研修医単独の配置は行いません。');

INSERT INTO audit_logs (id, group_id, user_email, action, entity_type, entity_id, summary, details, created_at) VALUES
  ('seed-audit-01', 'seed-group-store', 'tanaka@local.test', 'shift.publish', 'shiftPlan', 'seed-plan-second-half', '7月後半シフトを公開', '{"status":"published"}', '2026-07-16T08:00:00.000Z'),
  ('seed-audit-02', 'seed-group-store', 'member02@local.test', 'work.submit', 'workRecord', 'seed-july-submit', '7月18日の勤務申告を申請', '{}', '2026-07-17T09:10:00.000Z'),
  ('seed-audit-03', 'seed-group-store', 'member01@local.test', 'work.review', 'workRecord', 'seed-july-review', '勤務申告を承認', '{"status":"approved"}', '2026-07-17T12:00:00.000Z'),
  ('seed-audit-04', 'seed-group-store', 'member03@local.test', 'work.review', 'workRecord', 'seed-july-reject', '勤務申告を差し戻し', '{"status":"rejected"}', '2026-07-17T13:00:00.000Z');
