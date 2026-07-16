DELETE FROM shift_requests;
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
  ('tanaka@local.test', 'Manager'),
  ('member01@local.test', 'Akira'),
  ('member02@local.test', 'Yui'),
  ('member03@local.test', 'Takumi'),
  ('member04@local.test', 'Sakura'),
  ('member05@local.test', 'Kenta'),
  ('member06@local.test', 'Misaki'),
  ('member07@local.test', 'Ryo'),
  ('member08@local.test', 'Nao'),
  ('member09@local.test', 'Haruka'),
  ('member10@local.test', 'Kota');

INSERT INTO groups (id, name, description, owner_email) VALUES
  ('seed-group-store', 'Sample Store', 'Local shift planning sample group', 'tanaka@local.test');

INSERT INTO group_members (id, group_id, user_email, display_name, role, show_in_personal) VALUES
  ('seed-member-owner', 'seed-group-store', 'tanaka@local.test', 'Manager', 'owner', 1),
  ('seed-member-01', 'seed-group-store', 'member01@local.test', 'Akira', 'member', 1),
  ('seed-member-02', 'seed-group-store', 'member02@local.test', 'Yui', 'member', 1),
  ('seed-member-03', 'seed-group-store', 'member03@local.test', 'Takumi', 'member', 1),
  ('seed-member-04', 'seed-group-store', 'member04@local.test', 'Sakura', 'member', 1),
  ('seed-member-05', 'seed-group-store', 'member05@local.test', 'Kenta', 'member', 1),
  ('seed-member-06', 'seed-group-store', 'member06@local.test', 'Misaki', 'member', 1),
  ('seed-member-07', 'seed-group-store', 'member07@local.test', 'Ryo', 'member', 1),
  ('seed-member-08', 'seed-group-store', 'member08@local.test', 'Nao', 'member', 1),
  ('seed-member-09', 'seed-group-store', 'member09@local.test', 'Haruka', 'member', 1),
  ('seed-member-10', 'seed-group-store', 'member10@local.test', 'Kota', 'member', 1);

INSERT INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, status, created_by)
VALUES
  ('seed-plan-first-half', 'seed-group-store', 'July first half', '2026-07-01', '2026-07-15', '09:00', '18:00', 60, 2, 'published', 'tanaka@local.test'),
  ('seed-plan-second-half', 'seed-group-store', 'July second half', '2026-07-16', '2026-07-31', '09:00', '18:00', 60, 2, 'draft', 'tanaka@local.test');

WITH RECURSIVE
  dates(date) AS (SELECT '2026-07-01' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-15'),
  times(start_min) AS (SELECT 540 UNION ALL SELECT start_min + 60 FROM times WHERE start_min < 1020)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT lower(hex(randomblob(16))), 'seed-plan-first-half', dates.date,
  printf('%02d:%02d', times.start_min / 60, times.start_min % 60),
  printf('%02d:%02d', (times.start_min + 60) / 60, (times.start_min + 60) % 60), 2,
  CASE WHEN times.start_min = 1020 AND dates.date = '2026-07-04' THEN 'checkout' ELSE 'floor' END
FROM dates CROSS JOIN times;

WITH RECURSIVE
  dates(date) AS (SELECT '2026-07-16' UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-07-31'),
  times(start_min) AS (SELECT 540 UNION ALL SELECT start_min + 60 FROM times WHERE start_min < 1020)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
SELECT lower(hex(randomblob(16))), 'seed-plan-second-half', dates.date,
  printf('%02d:%02d', times.start_min / 60, times.start_min % 60),
  printf('%02d:%02d', (times.start_min + 60) / 60, (times.start_min + 60) % 60), 2,
  CASE WHEN times.start_min = 1020 AND dates.date = '2026-07-20' THEN 'checkout' ELSE 'floor' END
FROM dates CROSS JOIN times;

INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), id, printf('member%02d@local.test', ((CAST(strftime('%d', date) AS INTEGER) + CAST(substr(start_time, 1, 2) AS INTEGER)) % 10) + 1)
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';
INSERT INTO shift_assignments (id, slot_id, user_email)
SELECT lower(hex(randomblob(16))), id, printf('member%02d@local.test', ((CAST(strftime('%d', date) AS INTEGER) + CAST(substr(start_time, 1, 2) AS INTEGER) + 1) % 10) + 1)
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';

INSERT INTO events (id, owner_email, group_id, shift_plan_id, title, date, start_time, end_time, category, notes, completed)
SELECT lower(hex(randomblob(16))), 'tanaka@local.test', 'seed-group-store', 'seed-plan-first-half', role, date, start_time, end_time, 'work', 'See shift roster', 0
FROM shift_slots WHERE plan_id = 'seed-plan-first-half';

WITH users(user_email) AS (VALUES ('tanaka@local.test'), ('member01@local.test'), ('member02@local.test'), ('member03@local.test'), ('member04@local.test'), ('member05@local.test'), ('member06@local.test'), ('member07@local.test'), ('member08@local.test'), ('member09@local.test'), ('member10@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT lower(hex(randomblob(16))), 'seed-group-store', users.user_email, days.day_of_week,
  CASE WHEN days.day_of_week IN (0, 6) THEN 'unavailable' WHEN days.day_of_week = 3 THEN 'limited' ELSE 'available' END,
  CASE WHEN days.day_of_week = 3 THEN '13:00' ELSE '09:00' END, '18:00', ''
FROM users CROSS JOIN days;

WITH users(user_email) AS (VALUES ('tanaka@local.test'), ('member01@local.test'), ('member02@local.test'), ('member03@local.test'), ('member04@local.test'), ('member05@local.test'), ('member06@local.test'), ('member07@local.test'), ('member08@local.test'), ('member09@local.test'), ('member10@local.test'))
INSERT INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment)
SELECT lower(hex(randomblob(16))), 'seed-group-store', user_email,
  CASE WHEN user_email = 'member05@local.test' THEN 3 ELSE 2 END,
  CASE WHEN user_email = 'member05@local.test' THEN 5 ELSE 4 END,
  CASE WHEN user_email = 'member05@local.test' THEN 18 ELSE 12 END,
  CASE WHEN user_email = 'member05@local.test' THEN 30 ELSE 24 END,
  CASE WHEN user_email IN ('member03@local.test', 'member04@local.test') THEN 'unavailable' ELSE 'prefer_off' END,
  CASE WHEN user_email = 'member03@local.test' THEN 'Wednesday class; afternoon only.' ELSE '' END
FROM users;

INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by)
VALUES ('seed-request-second-half', 'seed-group-store', 'seed-plan-second-half', 'July second half requests', '2026-07-16', '2026-07-20', 'open', 'tanaka@local.test');

INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member01@local.test', date, start_time, end_time, 'want', 'Prefer to work'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-18' AND start_time = '09:00';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member02@local.test', date, start_time, end_time, 'off', 'Personal appointment'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-19' AND start_time = '09:00';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member03@local.test', date, start_time, end_time, 'possible', 'Afternoon only'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-22' AND start_time = '13:00';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member04@local.test', date, start_time, end_time, 'unavailable', 'School event'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-25' AND start_time = '09:00';
INSERT INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note)
SELECT lower(hex(randomblob(16))), 'seed-request-second-half', 'member05@local.test', date, start_time, end_time, 'want', 'Prefer more hours'
FROM shift_slots WHERE plan_id = 'seed-plan-second-half' AND date = '2026-07-28' AND start_time = '17:00';
