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
DELETE FROM announcement_replies;
DELETE FROM announcement_reads;
DELETE FROM group_announcements;

INSERT INTO account_profiles (user_email, nickname) VALUES
  ('tanaka@local.test', '店長'),
  ('member01@local.test', '副店長'),
  ('member02@local.test', '学生1'),
  ('member03@local.test', '学生2'),
  ('member04@local.test', '学生3'),
  ('member05@local.test', '主婦1'),
  ('member06@local.test', '主婦2'),
  ('member07@local.test', 'フリーター1'),
  ('member08@local.test', 'フリーター2'),
  ('member09@local.test', 'フリーター3');

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-store', 'サンプル店', 'シフト作成デモ', 'tanaka@local.test');

INSERT INTO group_members (id, group_id, user_email, display_name, role, show_in_personal) VALUES
  ('seed-member-owner', 'seed-group-store', 'tanaka@local.test', '店長', 'owner', 1),
  ('seed-member-01', 'seed-group-store', 'member01@local.test', '副店長', 'editor', 1),
  ('seed-member-02', 'seed-group-store', 'member02@local.test', '学生1', 'member', 1),
  ('seed-member-03', 'seed-group-store', 'member03@local.test', '学生2', 'member', 1),
  ('seed-member-04', 'seed-group-store', 'member04@local.test', '学生3', 'member', 1),
  ('seed-member-05', 'seed-group-store', 'member05@local.test', '主婦1', 'member', 1),
  ('seed-member-06', 'seed-group-store', 'member06@local.test', '主婦2', 'member', 1),
  ('seed-member-07', 'seed-group-store', 'member07@local.test', 'フリーター1', 'member', 1),
  ('seed-member-08', 'seed-group-store', 'member08@local.test', 'フリーター2', 'member', 1),
  ('seed-member-09', 'seed-group-store', 'member09@local.test', 'フリーター3', 'member', 1);

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, status, created_by)
VALUES
  ('seed-plan-first-half', 'seed-group-store', '7月前半シフト（確定）', '2026-07-01', '2026-07-15', '09:30', '30:00', 30, 1, 'published', 'tanaka@local.test'),
  ('seed-plan-second-half', 'seed-group-store', '7月後半シフト（希望受付中）', '2026-07-16', '2026-07-31', '09:30', '30:00', 30, 1, 'draft', 'tanaka@local.test');

WITH RECURSIVE
  dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-15'),
  slot_defs(start_time, end_time, role, required_count) AS (VALUES
    ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
    ('14:00', '17:00', 'ホール', 1), ('14:00', '17:00', '厨房', 1),
    ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2),
    ('22:00', '26:00', 'ホール', 1), ('22:00', '26:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT lower(hex(randomblob(16))), 'seed-plan-first-half', dates.date, slot_defs.start_time, slot_defs.end_time, slot_defs.required_count, slot_defs.role
FROM dates CROSS JOIN slot_defs;

WITH RECURSIVE
  dates(date) AS (SELECT '2026-07-16' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31'),
  slot_defs(start_time, end_time, role, required_count) AS (VALUES
    ('09:30', '14:00', 'ホール', 2), ('09:30', '14:00', '厨房', 2),
    ('14:00', '17:00', 'ホール', 1), ('14:00', '17:00', '厨房', 1),
    ('17:00', '22:00', 'ホール', 2), ('17:00', '22:00', '厨房', 2),
    ('22:00', '26:00', 'ホール', 1), ('22:00', '26:00', '厨房', 1))
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT lower(hex(randomblob(16))), 'seed-plan-second-half', dates.date, slot_defs.start_time, slot_defs.end_time, slot_defs.required_count, slot_defs.role
FROM dates CROSS JOIN slot_defs;

WITH assignees(start_time, role, user_email) AS (VALUES
  ('09:30', 'ホール', 'tanaka@local.test'), ('09:30', 'ホール', 'member05@local.test'),
  ('09:30', '厨房', 'member01@local.test'), ('09:30', '厨房', 'member06@local.test'),
  ('14:00', 'ホール', 'tanaka@local.test'), ('14:00', '厨房', 'member01@local.test'),
  ('17:00', 'ホール', 'member02@local.test'), ('17:00', 'ホール', 'member07@local.test'),
  ('17:00', '厨房', 'member03@local.test'), ('17:00', '厨房', 'member08@local.test'),
  ('22:00', 'ホール', 'member07@local.test'), ('22:00', '厨房', 'member08@local.test'))
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), slots.id, assignees.user_email
FROM shift_slots slots JOIN assignees ON assignees.start_time = slots.start_time AND assignees.role = slots.role
WHERE slots.plan_id = 'seed-plan-first-half';

INSERT INTO events (id, owner_email, group_id, shift_plan_id, title, date, end_date, start_time, end_time, category, notes, completed)
SELECT lower(hex(randomblob(16))), 'tanaka@local.test', 'seed-group-store', plan_id, role, date,
  CASE WHEN end_time = '26:00' THEN date(date, '+1 day') ELSE date END,
  start_time, CASE WHEN end_time = '26:00' THEN '02:00' ELSE end_time END,
  '仕事', '担当者はシフト一覧で確認できます。', 0
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';

WITH users(user_email) AS (VALUES
  ('tanaka@local.test'), ('member01@local.test'), ('member02@local.test'), ('member03@local.test'), ('member04@local.test'), ('member05@local.test'), ('member06@local.test'), ('member07@local.test'), ('member08@local.test'), ('member09@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT lower(hex(randomblob(16))), 'seed-group-store', users.user_email, days.day_of_week,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN 'want'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test', 'member04@local.test') THEN 'possible'
    WHEN users.user_email IN ('member05@local.test', 'member06@local.test') AND days.day_of_week BETWEEN 1 AND 5 THEN 'want'
    WHEN users.user_email IN ('member07@local.test', 'member08@local.test', 'member09@local.test') THEN 'want'
    ELSE 'unavailable'
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '09:30'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test', 'member04@local.test') AND days.day_of_week IN (0, 6) THEN '09:30'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test', 'member04@local.test') THEN '17:00'
    WHEN users.user_email IN ('member05@local.test', 'member06@local.test') THEN '09:30'
    WHEN users.user_email IN ('member07@local.test', 'member08@local.test', 'member09@local.test') THEN '17:00'
    ELSE ''
  END,
  CASE
    WHEN users.user_email IN ('tanaka@local.test', 'member01@local.test') THEN '30:00'
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test', 'member04@local.test') THEN '22:00'
    WHEN users.user_email IN ('member05@local.test', 'member06@local.test') THEN '17:00'
    WHEN users.user_email IN ('member07@local.test', 'member08@local.test', 'member09@local.test') THEN '30:00'
    ELSE ''
  END,
  CASE
    WHEN users.user_email IN ('member02@local.test', 'member03@local.test', 'member04@local.test') THEN '土日は昼も可。22時以降は勤務不可。'
    WHEN users.user_email IN ('member05@local.test', 'member06@local.test') THEN '平日日中を希望。'
    WHEN users.user_email IN ('member07@local.test', 'member08@local.test', 'member09@local.test') THEN '夜間・深夜を希望。昼も相談可。'
    ELSE ''
  END
FROM users CROSS JOIN days;

INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-pref-owner', 'seed-group-store', 'tanaka@local.test', 5, 6, 40, 60, 'any', '店舗運営のため広い時間帯で調整可能。'),
  ('seed-pref-01', 'seed-group-store', 'member01@local.test', 5, 6, 40, 60, 'any', '副店長。店長不在日も対応。'),
  ('seed-pref-02', 'seed-group-store', 'member02@local.test', 2, 4, 8, 20, 'prefer_off', '学生。平日は夕方から、土日は昼も可。22時以降は不可。'),
  ('seed-pref-03', 'seed-group-store', 'member03@local.test', 2, 4, 8, 20, 'prefer_off', '学生。試験前は少なめ希望。22時以降は不可。'),
  ('seed-pref-04', 'seed-group-store', 'member04@local.test', 2, 3, 8, 16, 'prefer_off', '学生。土日中心。22時以降は不可。'),
  ('seed-pref-05', 'seed-group-store', 'member05@local.test', 3, 4, 12, 24, 'prefer_off', '主婦。平日日中を希望。'),
  ('seed-pref-06', 'seed-group-store', 'member06@local.test', 3, 4, 12, 24, 'prefer_off', '主婦。平日日中を希望。'),
  ('seed-pref-07', 'seed-group-store', 'member07@local.test', 4, 5, 24, 36, 'any', 'フリーター。夜間・深夜中心だが他の時間帯も可。'),
  ('seed-pref-08', 'seed-group-store', 'member08@local.test', 4, 5, 24, 36, 'any', 'フリーター。金土の深夜も対応可能。'),
  ('seed-pref-09', 'seed-group-store', 'member09@local.test', 3, 5, 20, 36, 'any', 'フリーター。夕方以降を希望。');

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-request-first-half', 'seed-group-store', 'seed-plan-first-half', '7月前半シフト希望', '2026-06-15', '2026-06-25', 'closed', 'tanaka@local.test'),
  ('seed-request-second-half', 'seed-group-store', 'seed-plan-second-half', '7月後半シフト希望', '2026-07-16', '2026-07-20', 'open', 'tanaka@local.test');

INSERT INTO shift_request_submissions (id, period_id, user_email, saved_at) VALUES
  ('seed-submission-02', 'seed-request-second-half', 'member02@local.test', '2026-07-17T09:10:00.000Z'),
  ('seed-submission-04', 'seed-request-second-half', 'member04@local.test', '2026-07-17T10:20:00.000Z'),
  ('seed-submission-05', 'seed-request-second-half', 'member05@local.test', '2026-07-17T11:30:00.000Z'),
  ('seed-submission-07', 'seed-request-second-half', 'member07@local.test', '2026-07-17T12:40:00.000Z');

INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member02@local.test', date, start_time, end_time, 'want', '夕方から希望。'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-18' AND start_time = '17:00' AND role = 'ホール';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member04@local.test', date, start_time, end_time, 'off', '学校行事のため休み希望。'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-19' AND start_time = '09:30' AND role = 'ホール';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member05@local.test', date, start_time, end_time, 'want', '平日日中を希望。'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-21' AND start_time = '09:30' AND role = 'ホール';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member07@local.test', date, start_time, end_time, 'want', '深夜勤務を希望。'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-24' AND start_time = '22:00' AND role = 'ホール';

INSERT INTO group_announcements (id, group_id, created_by, title, body) VALUES
  ('seed-announcement-01', 'seed-group-store', 'tanaka@local.test', '7月シフトについて', '7月後半の勤務希望を7月20日までに入力してください。深夜枠は翌日2時までです。'),
  ('seed-announcement-02', 'seed-group-store', 'tanaka@local.test', '営業時間のお知らせ', '日中・夕方・深夜の4枠でシフトを作成しています。');

INSERT INTO announcement_reads (id, announcement_id, user_email) VALUES
  ('seed-read-01', 'seed-announcement-01', 'member02@local.test'),
  ('seed-read-02', 'seed-announcement-01', 'member05@local.test'),
  ('seed-read-03', 'seed-announcement-02', 'member07@local.test');

INSERT INTO announcement_replies (id, announcement_id, user_email, body) VALUES
  ('seed-reply-01', 'seed-announcement-01', 'member02@local.test', '確認しました。土日の夕方を中心に希望を入れます。'),
  ('seed-reply-02', 'seed-announcement-01', 'member07@local.test', '深夜枠も勤務可能です。');
