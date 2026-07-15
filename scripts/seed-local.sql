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
  ('tanaka@local.test', '田中さん'),
  ('member01@local.test', 'あきら'),
  ('member02@local.test', 'ゆい'),
  ('member03@local.test', 'たくみ'),
  ('member04@local.test', 'さくら'),
  ('member05@local.test', 'けんた'),
  ('member06@local.test', 'みさき'),
  ('member07@local.test', 'りょう'),
  ('member08@local.test', 'なお'),
  ('member09@local.test', 'はるか'),
  ('member10@local.test', 'こうた');

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-store', 'サンプル店舗', 'ローカル開発用のシフト管理グループ', 'tanaka@local.test');

INSERT INTO group_members (id, group_id, user_email, display_name, role, show_in_personal) VALUES
  ('seed-member-owner', 'seed-group-store', 'tanaka@local.test', '店長', 'owner', 1),
  ('seed-member-01', 'seed-group-store', 'member01@local.test', 'あきら', 'member', 1),
  ('seed-member-02', 'seed-group-store', 'member02@local.test', 'ゆい', 'member', 1),
  ('seed-member-03', 'seed-group-store', 'member03@local.test', 'たくみ', 'member', 1),
  ('seed-member-04', 'seed-group-store', 'member04@local.test', 'さくら', 'member', 1),
  ('seed-member-05', 'seed-group-store', 'member05@local.test', 'けんた', 'member', 1),
  ('seed-member-06', 'seed-group-store', 'member06@local.test', 'みさき', 'member', 1),
  ('seed-member-07', 'seed-group-store', 'member07@local.test', 'りょう', 'member', 1),
  ('seed-member-08', 'seed-group-store', 'member08@local.test', 'なお', 'member', 1),
  ('seed-member-09', 'seed-group-store', 'member09@local.test', 'はるか', 'member', 1),
  ('seed-member-10', 'seed-group-store', 'member10@local.test', 'こうた', 'member', 1);

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, status, created_by)
VALUES ('seed-plan-first-half', 'seed-group-store', '7月前半シフト', '2026-07-01', '2026-07-15', '09:00', '18:00', 60, 2, 'published', 'tanaka@local.test');

WITH RECURSIVE
  dates(date) AS (
    SELECT '2026-07-01'
    UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-15'
  ),
  times(start_min) AS (
    SELECT 540
    UNION ALL SELECT start_min + 60 FROM times WHERE start_min < 1020
  )
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT lower(hex(randomblob(16))), 'seed-plan-first-half', dates.date,
  printf('%02d:%02d', times.start_min / 60, times.start_min % 60),
  printf('%02d:%02d', (times.start_min + 60) / 60, (times.start_min + 60) % 60), 2,
  CASE WHEN times.start_min = 1020 AND dates.date = '2026-07-04' THEN 'レジ締め' ELSE 'フロア' END
FROM dates CROSS JOIN times;

INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), id,
  printf('member%02d@local.test', ((CAST(strftime('%d', date) AS INTEGER) + CAST(substr(start_time, 1, 2) AS INTEGER)) % 10) + 1)
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';

INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), id,
  printf('member%02d@local.test', ((CAST(strftime('%d', date) AS INTEGER) + CAST(substr(start_time, 1, 2) AS INTEGER) + 1) % 10) + 1)
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';

INSERT INTO events (id, owner_email, group_id, shift_plan_id, title, date, start_time, end_time, category, notes, completed)
SELECT lower(hex(randomblob(16))), 'tanaka@local.test', 'seed-group-store', 'seed-plan-first-half', role, date, start_time, end_time, '仕事', '担当はシフト一覧を参照', 0
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';
