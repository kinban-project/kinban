-- My Day local scenario seed
-- 6/30: monthly closing test fixture
-- 7/1-7/31: normal operation, approval, rejection, punch and gap fixtures

DELETE FROM work_breaks;
DELETE FROM monthly_work_claims;
DELETE FROM work_records;
DELETE FROM mcp_confirmations;
DELETE FROM assistant_contexts;
DELETE FROM assistant_messages;
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
DELETE FROM attachments;
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
INSERT INTO group_assistants (group_id, display_name, role, status) VALUES
  ('seed-group-store', 'KINBANアシスタント', 'editor', 'active');

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
  ('seed-plan-second-half', 'seed-group-store', '7月後半シフト', '2026-07-16', '2026-07-31', '09:30', '26:00', 30, 1, '公開済み。希望・割当・勤務申告を確認できます。', 'published', 'tanaka@local.test'),
  ('seed-plan-august-first', 'seed-group-store', '8月前半シフト（受付前）', '2026-08-01', '2026-08-15', '09:30', '26:00', 30, 1, '次回受付前の下書きデータです。', 'draft', 'tanaka@local.test');

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
  ('seed-request-second-half', 'seed-group-store', 'seed-plan-second-half', '7月後半希望', '2026-07-10', '2026-07-20', 'open', 'tanaka@local.test'),
  ('seed-request-august-first', 'seed-group-store', 'seed-plan-august-first', '8月前半希望（受付前）', '2026-07-25', '2026-07-31', 'upcoming', 'tanaka@local.test');

INSERT INTO shift_request_submissions (id, period_id, user_email, saved_at) VALUES
  ('seed-submission-02', 'seed-request-second-half', 'member02@local.test', '2026-07-17T09:10:00.000Z'),
  ('seed-submission-04', 'seed-request-second-half', 'member04@local.test', '2026-07-17T10:20:00.000Z'),
  ('seed-submission-05', 'seed-request-second-half', 'member05@local.test', '2026-07-17T11:30:00.000Z'),
  ('seed-submission-07', 'seed-request-second-half', 'member07@local.test', '2026-07-17T12:40:00.000Z');

INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note) VALUES
  ('seed-request-row-01', 'seed-request-second-half', 'member02@local.test', '2026-07-18', '17:00', '22:00', 'want', '夕方から希望。'),
  ('seed-request-row-02', 'seed-request-second-half', 'member04@local.test', '2026-07-19', '09:30', '14:00', 'off', '家庭の予定で休み希望。'),
  ('seed-request-row-03', 'seed-request-second-half', 'member05@local.test', '2026-07-21', '09:30', '14:00', 'want', '日中希望。'),
  ('seed-request-row-04', 'seed-request-second-half', 'member07@local.test', '2026-07-24', '22:00', '26:00', 'want', '深夜帯も対応可能。');

INSERT INTO group_announcements (id, group_id, created_by, title, body) VALUES
  ('seed-announcement-01', 'seed-group-store', 'tanaka@local.test', '7月後半シフトについて', '7月後半の勤務希望を7月20日までに確認してください。'),
  ('seed-announcement-02', 'seed-group-store', 'member01@local.test', '月末締めテストのお知らせ', '6月30日分の勤務申告を確認し、順次承認します。');

INSERT INTO announcement_reads (id, announcement_id, user_email) VALUES
  ('seed-read-01', 'seed-announcement-01', 'member02@local.test'),
  ('seed-read-02', 'seed-announcement-01', 'member05@local.test'),
  ('seed-read-03', 'seed-announcement-01', 'member07@local.test'),
  ('seed-read-04', 'seed-announcement-02', 'member04@local.test');

INSERT INTO announcement_replies (id, announcement_id, user_email, body) VALUES
  ('seed-reply-01', 'seed-announcement-01', 'member02@local.test', '確認しました。'),
  ('seed-reply-02', 'seed-announcement-02', 'member04@local.test', '6月30日分を確認しました。');

INSERT INTO audit_logs (id, group_id, user_email, action, entity_type, entity_id, summary, details, created_at) VALUES
  ('seed-audit-01', 'seed-group-store', 'tanaka@local.test', 'shift.publish', 'shiftPlan', 'seed-plan-second-half', '7月後半シフトを公開', '{"status":"published"}', '2026-07-16T08:00:00.000Z'),
  ('seed-audit-02', 'seed-group-store', 'member02@local.test', 'work.submit', 'workRecord', 'seed-july-submit', '7月18日の勤務申告を申請', '{}', '2026-07-17T09:10:00.000Z'),
  ('seed-audit-03', 'seed-group-store', 'member01@local.test', 'work.review', 'workRecord', 'seed-july-review', '勤務申告を承認', '{"status":"approved"}', '2026-07-17T12:00:00.000Z'),
  ('seed-audit-04', 'seed-group-store', 'member03@local.test', 'work.review', 'workRecord', 'seed-july-reject', '勤務申告を差し戻し', '{"status":"rejected"}', '2026-07-17T13:00:00.000Z');
