-- Add the practical yakiniku-store scenario to an existing local database.
-- Use scripts/seed-local.sql for a full reset and reproducible seed.
INSERT OR IGNORE INTO account_profiles (user_email, nickname) VALUES
  ('yakiniku-manager@local.test', '焼肉店長'),
  ('yakiniku-submanager@local.test', '副店長（焼肉店）'),
  ('yakiniku-hall-a@local.test', 'ホールA'),
  ('yakiniku-hall-b@local.test', 'ホールB'),
  ('yakiniku-kitchen-a@local.test', '厨房A'),
  ('yakiniku-kitchen-b@local.test', '厨房B'),
  ('yakiniku-wash-a@local.test', '洗い場A'),
  ('yakiniku-flex-a@local.test', '兼任A');

INSERT OR IGNORE INTO site_users (id, user_email, display_name, status, is_site_admin, can_create_groups) VALUES
  ('seed-site-yakiniku-manager', 'yakiniku-manager@local.test', '焼肉店長', 'active', 0, 1),
  ('seed-site-yakiniku-submanager', 'yakiniku-submanager@local.test', '副店長（焼肉店）', 'active', 0, 0),
  ('seed-site-yakiniku-hall-a', 'yakiniku-hall-a@local.test', 'ホールA', 'active', 0, 0),
  ('seed-site-yakiniku-hall-b', 'yakiniku-hall-b@local.test', 'ホールB', 'active', 0, 0),
  ('seed-site-yakiniku-kitchen-a', 'yakiniku-kitchen-a@local.test', '厨房A', 'active', 0, 0),
  ('seed-site-yakiniku-kitchen-b', 'yakiniku-kitchen-b@local.test', '厨房B', 'active', 0, 0),
  ('seed-site-yakiniku-wash-a', 'yakiniku-wash-a@local.test', '洗い場A', 'active', 0, 0),
  ('seed-site-yakiniku-flex-a', 'yakiniku-flex-a@local.test', '兼任A', 'active', 0, 0);

INSERT OR IGNORE INTO groups (id, name, description, owner_email, labor_consecutive_days_limit) VALUES
  ('seed-group-yakiniku', '焼肉店（ポジション割当デモ）', '担当可能範囲と時間帯別の必要人数を確認する焼肉店のシフト割当デモ', 'yakiniku-manager@local.test', 6);

INSERT OR IGNORE INTO group_assistants (group_id, display_name, role, status, can_create_shifts, can_publish_shifts, can_review_daily_work, can_review_monthly_work, can_create_announcements) VALUES
  ('seed-group-yakiniku', 'KINBANアシスタント', 'editor', 'active', true, true, true, false, true);

INSERT OR IGNORE INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-yakiniku-manager', 'seed-group-yakiniku', 'yakiniku-manager@local.test', '焼肉店長', '店舗責任者。シフトには入らず、最終判断と公開を担当。', 'owner', 'active', 1),
  ('seed-yakiniku-submanager', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', '副店長', 'ホール・厨房の両方を担当可能。繁忙日のリーダー候補。', 'editor', 'active', 1),
  ('seed-yakiniku-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'ホールA', 'ホール接客・ウェイティング担当。厨房には原則入らない。', 'member', 'active', 1),
  ('seed-yakiniku-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'ホールB', 'ホール接客・ドリンク担当。ピーク帯の接客経験あり。', 'member', 'active', 1),
  ('seed-yakiniku-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', '厨房A', '肉場・仕込み担当。ホール配置は不可。', 'member', 'active', 1),
  ('seed-yakiniku-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', '厨房B', 'サラダ場・スープ場・仕込み担当。ピーク帯の厨房を優先。', 'member', 'active', 1),
  ('seed-yakiniku-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', '洗い場A', '洗い場担当。繁忙時間は厨房補助も可能。', 'member', 'active', 1),
  ('seed-yakiniku-flex-a', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', '兼任A', 'ホール・ドリンク・洗い場を担当可能。人員不足時の調整候補。', 'member', 'active', 1);

INSERT OR IGNORE INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
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

INSERT OR IGNORE INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES
  ('seed-yakiniku-plan-august-first', 'seed-group-yakiniku', '焼肉店 8月前半シフト', '2026-08-01', '2026-08-15', '14:00', '24:00', 60, 1,
   '店長は配置対象外。平日と土日で必要人数を変え、担当適性・体制不足・希望差分を確認する下書きデモ。', 'draft', 'yakiniku-manager@local.test');

-- The final duty-aware slot set is generated below after the duty master is inserted.

-- 10名構成と担当マスタを追加する。既存8名にホールC・兼任Bを加え、
-- 担当付き枠の候補絞り込みと初期割当の代表ケースを再現する。
INSERT OR IGNORE INTO account_profiles (user_email, nickname) VALUES
  ('yakiniku-hall-c@local.test', 'ホールC'),
  ('yakiniku-flex-b@local.test', '兼任B');
INSERT OR IGNORE INTO site_users (id, user_email, display_name, status, is_site_admin, can_create_groups) VALUES
  ('seed-site-yakiniku-hall-c', 'yakiniku-hall-c@local.test', 'ホールC', 'active', 0, 0),
  ('seed-site-yakiniku-flex-b', 'yakiniku-flex-b@local.test', '兼任B', 'active', 0, 0);
INSERT OR IGNORE INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES
  ('seed-yakiniku-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'ホールC', 'ホール接客・ウェイティング担当。土日ピークにも対応可能。', 'member', 'active', 1),
  ('seed-yakiniku-flex-b', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', '兼任B', 'ドリンク・ウェイティング・洗い場を担当可能。平日中心の調整候補。', 'member', 'active', 1);
INSERT OR IGNORE INTO group_preferences (id, group_id, user_email, min_days, max_days, min_hours, max_hours, weekend_policy, free_comment) VALUES
  ('seed-yakiniku-pref-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 2, 5, 12, 32, 'prefer', '土日のピーク帯も可能。ホール接客を優先。'),
  ('seed-yakiniku-pref-flex-b', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 1, 4, 8, 24, 'avoid', '平日中心。ドリンク・ウェイティング・洗い場の兼任候補。');
WITH users(user_email) AS (VALUES ('yakiniku-hall-c@local.test'), ('yakiniku-flex-b@local.test')),
days(day_of_week) AS (VALUES (0), (1), (2), (3), (4), (5), (6))
INSERT INTO shift_availability (id, group_id, user_email, day_of_week, status, start_time, end_time, note)
SELECT 'yakiniku-availability-' || lower(hex(randomblob(8))), 'seed-group-yakiniku', user_email,
  day_of_week, 'possible', '14:00', '24:00', 'ポジション枠に合わせて調整可能。'
FROM users CROSS JOIN days;

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
  ('member-duty-yakiniku-sub-drink', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-sub-wash', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-sub-salad', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-salad-soup'),
  ('member-duty-yakiniku-sub-meat', 'seed-group-yakiniku', 'yakiniku-submanager@local.test', 'duty-yakiniku-meat'),
  ('member-duty-yakiniku-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-a-waiting', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-b-drink', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', 'duty-yakiniku-meat'),
  ('member-duty-yakiniku-kitchen-a-salad', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', 'duty-yakiniku-salad-soup'),
  ('member-duty-yakiniku-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', 'duty-yakiniku-salad-soup'),
  ('member-duty-yakiniku-kitchen-b-meat', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', 'duty-yakiniku-meat'),
  ('member-duty-yakiniku-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-flex-hall', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-flex-waiting', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-drink', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-wash', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-c-waiting', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-drink', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-b-waiting', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-wash', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-flex-b-hall', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-hall');

-- 時間帯×担当を1枠ずつ作成する。duty_scope_idsは、その枠に入る1人が全て担当可能であるべき範囲。
DELETE FROM shift_assignments WHERE slot_id IN (SELECT id FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first');
DELETE FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first';
WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-01'
  UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'
), templates(suffix, start_time, end_time, role, duty_id, duty_name_snapshot, duty_scope_ids) AS (VALUES
  ('1400-hall', '14:00', '17:00', 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-drink","duty-yakiniku-wash"]'),
  ('1400-meat', '14:00', '17:00', '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-salad-soup","duty-yakiniku-meat"]'),
  ('1700-hall', '17:00', '18:00', 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-wash"]'),
  ('1700-drink', '17:00', '18:00', 'ドリンク場', 'duty-yakiniku-drink', 'ドリンク場', '["duty-yakiniku-drink"]'),
  ('1700-meat', '17:00', '18:00', '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-salad-soup","duty-yakiniku-meat"]'),
  ('1800-hall', '18:00', '19:00', 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting"]'),
  ('1800-drink', '18:00', '19:00', 'ドリンク場', 'duty-yakiniku-drink', 'ドリンク場', '["duty-yakiniku-drink","duty-yakiniku-wash"]'),
  ('1800-salad', '18:00', '19:00', 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-salad-soup"]'),
  ('1800-meat', '18:00', '19:00', '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]'),
  ('1900-hall', '19:00', '21:00', 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall"]'),
  ('1900-waiting', '19:00', '21:00', 'ウェイティング', 'duty-yakiniku-waiting', 'ウェイティング', '["duty-yakiniku-waiting"]'),
  ('1900-drink', '19:00', '21:00', 'ドリンク場', 'duty-yakiniku-drink', 'ドリンク場', '["duty-yakiniku-drink","duty-yakiniku-wash"]'),
  ('1900-salad', '19:00', '21:00', 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-salad-soup"]'),
  ('1900-meat', '19:00', '21:00', '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]'),
  ('2100-hall', '21:00', '24:00', 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-wash"]'),
  ('2100-drink', '21:00', '24:00', 'ドリンク場', 'duty-yakiniku-drink', 'ドリンク場', '["duty-yakiniku-drink"]'),
  ('2100-salad', '21:00', '24:00', 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-salad-soup"]'),
  ('2100-meat', '21:00', '24:00', '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]')
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role, duty_id, duty_name_snapshot, duty_scope_ids, coverage_duty_ids)
SELECT 'yakiniku-slot-' || dates.date || '-' || templates.suffix,
  'seed-yakiniku-plan-august-first', dates.date, templates.start_time, templates.end_time,
  1, templates.role, templates.duty_id, templates.duty_name_snapshot, templates.duty_scope_ids, NULL
FROM dates CROSS JOIN templates;

-- 代表例：通常充足、土日ピークの体制不足、担当不可の割当を混在させる。
INSERT OR IGNORE INTO shift_assignments (id, slot_id, user_email) VALUES
  ('yakiniku-assignment-0801-1400-hall', 'yakiniku-slot-2026-08-01-1400-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1400-meat', 'yakiniku-slot-2026-08-01-1400-meat', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1700-hall', 'yakiniku-slot-2026-08-01-1700-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1700-drink', 'yakiniku-slot-2026-08-01-1700-drink', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0801-1700-meat', 'yakiniku-slot-2026-08-01-1700-meat', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1800-hall', 'yakiniku-slot-2026-08-01-1800-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1800-drink', 'yakiniku-slot-2026-08-01-1800-drink', 'yakiniku-flex-a@local.test'),
  ('yakiniku-assignment-0801-1800-salad', 'yakiniku-slot-2026-08-01-1800-salad', 'yakiniku-kitchen-b@local.test'),
  ('yakiniku-assignment-0801-1800-meat', 'yakiniku-slot-2026-08-01-1800-meat', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1900-hall', 'yakiniku-slot-2026-08-01-1900-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1900-waiting', 'yakiniku-slot-2026-08-01-1900-waiting', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1900-drink', 'yakiniku-slot-2026-08-01-1900-drink', 'yakiniku-flex-a@local.test'),
  ('yakiniku-assignment-0801-1900-salad', 'yakiniku-slot-2026-08-01-1900-salad', 'yakiniku-kitchen-b@local.test'),
  ('yakiniku-assignment-0801-1900-meat', 'yakiniku-slot-2026-08-01-1900-meat', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0808-1900-hall', 'yakiniku-slot-2026-08-08-1900-hall', 'yakiniku-hall-c@local.test'),
  ('yakiniku-assignment-0808-1900-waiting', 'yakiniku-slot-2026-08-08-1900-waiting', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0808-1900-drink', 'yakiniku-slot-2026-08-08-1900-drink', 'yakiniku-flex-a@local.test'),
  ('yakiniku-assignment-0808-1900-meat-wrong', 'yakiniku-slot-2026-08-08-1900-meat', 'yakiniku-hall-a@local.test');

INSERT OR IGNORE INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-yakiniku-request-august-first', 'seed-group-yakiniku', 'seed-yakiniku-plan-august-first', '焼肉店 8月前半希望', '2026-07-20', '2026-07-30', 'open', 'yakiniku-manager@local.test');
INSERT OR IGNORE INTO shift_request_submissions (id, period_id, user_email, saved_at, request_comment) VALUES
  ('seed-yakiniku-submission-hall-a', 'seed-yakiniku-request-august-first', 'yakiniku-hall-a@local.test', '2026-07-21T09:00:00+09:00', '土日のピークは可能ですが、8月8日は休み希望です。'),
  ('seed-yakiniku-submission-hall-b', 'seed-yakiniku-request-august-first', 'yakiniku-hall-b@local.test', '2026-07-21T09:10:00+09:00', '夕方以降を中心に希望します。'),
  ('seed-yakiniku-submission-kitchen-a', 'seed-yakiniku-request-august-first', 'yakiniku-kitchen-a@local.test', '2026-07-21T09:20:00+09:00', '仕込み時間帯は出勤可能です。'),
  ('seed-yakiniku-submission-flex-a', 'seed-yakiniku-request-august-first', 'yakiniku-flex-a@local.test', '2026-07-21T09:30:00+09:00', '不足時はホール・洗い場の兼任が可能です。');
INSERT OR IGNORE INTO shift_requests (id, period_id, user_email, date, start_time, end_time, preference, note) VALUES
  ('seed-yakiniku-request-hall-a-want', 'seed-yakiniku-request-august-first', 'yakiniku-hall-a@local.test', '2026-08-01', '17:00', '18:00', 'want', '営業開始から希望。'),
  ('seed-yakiniku-request-hall-a-off', 'seed-yakiniku-request-august-first', 'yakiniku-hall-a@local.test', '2026-08-08', '19:00', '21:00', 'off', '家庭の予定で休み希望。'),
  ('seed-yakiniku-request-hall-b-possible', 'seed-yakiniku-request-august-first', 'yakiniku-hall-b@local.test', '2026-08-01', '18:00', '19:00', 'possible', '必要なら出勤可能。'),
  ('seed-yakiniku-request-hall-b-unavailable', 'seed-yakiniku-request-august-first', 'yakiniku-hall-b@local.test', '2026-08-09', '19:00', '21:00', 'unavailable', '終日予定あり。'),
  ('seed-yakiniku-request-kitchen-a-want', 'seed-yakiniku-request-august-first', 'yakiniku-kitchen-a@local.test', '2026-08-01', '14:00', '17:00', 'want', '仕込みから希望。'),
  ('seed-yakiniku-request-kitchen-a-off', 'seed-yakiniku-request-august-first', 'yakiniku-kitchen-a@local.test', '2026-08-02', '21:00', '24:00', 'off', '夜遅い時間帯は休み希望。'),
  ('seed-yakiniku-request-flex-a-possible', 'seed-yakiniku-request-august-first', 'yakiniku-flex-a@local.test', '2026-08-08', '21:00', '24:00', 'possible', '不足時のみ調整可能。'),
  ('seed-yakiniku-request-flex-a-want', 'seed-yakiniku-request-august-first', 'yakiniku-flex-a@local.test', '2026-08-09', '18:00', '19:00', 'want', 'ドリンク担当を希望。');

INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-yakiniku-guide', 'seed-group-yakiniku', '業務ガイド', 'yakiniku-manager@local.test');
INSERT OR IGNORE INTO knowledge_pages (id, group_id, folder_id, author_email, title, body, status, image_url, image_alt, created_at, updated_at) VALUES
  ('knowledge-yakiniku-position-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店のポジション運用',
   '# 焼肉店のポジション運用\n\n- 肉場・サラダ場・スープ場・洗い場は厨房系の適性を確認する。\n- ホール・ウェイティング・ドリンクは接客系の適性を確認する。\n- 急な欠勤時は、兼任Aと副店長を代替候補として確認する。\n- AIの割当案はたたき台として使い、最終公開前に店長がポジションを確認する。',
   'published', NULL, '', '2026-07-21T12:00:00+09:00', '2026-07-21T12:00:00+09:00');
UPDATE knowledge_pages SET body = replace(body, char(92) || 'n', char(10)) WHERE id = 'knowledge-yakiniku-position-guide';

-- 担当別の業務ガイド（架空のデモ例）。肉場ページには説明用画像を含める。
INSERT OR IGNORE INTO knowledge_pages (id, group_id, folder_id, author_email, title, body, status, image_url, image_alt, created_at, updated_at) VALUES
  ('knowledge-yakiniku-meat-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・肉場ガイド', '# 焼肉店・肉場ガイド\n\n> 焼肉店のデモ用ガイドです。メニュー名・数値・手順は架空の例です。実際の営業では店長の指示と衛生基準を優先してください。\n\n**対象担当**：肉場\n\n![肉場の盛り付けイメージ](/knowledge/yakiniku-meat-prep.png)\n\n## 代表メニュー・作業例\n\n1. カルビ：枚数と盛り付け向きを確認する。\n2. ロース：厚みの違いを確認して専用皿へ盛る。\n3. ハラミ：注文札と皿の名前を照合する。\n4. タン：丸皿の区画を使い、他の肉と混ぜない。\n5. 豚カルビ：牛肉の皿と置き場所を分ける。\n6. 鶏もも：専用トレーに分け、提供先を確認する。\n7. ホルモン：盛り付け後に数量を再確認する。\n8. 盛り合わせA：指定された3種類をそろえる。\n9. 盛り合わせB：追加注文分を別札で管理する。\n10. 追加肉：追加伝票のテーブル番号を確認する。\n\n## 手順・注意\n\n1. 伝票、注文札、皿の3点を照合する。\n2. 盛り付け後は数量と提供先を声に出して確認する。\n3. 迷った場合やアレルギー・衛生に関する質問は判断せず、店長へ確認する。\n\nガイドに記載がないため店長へ確認してください。', 'published', '/knowledge/yakiniku-meat-prep.png', '肉場の盛り付けイメージ', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00'),
  ('knowledge-yakiniku-salad-soup-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・サラダ場・スープ場ガイド', '# 焼肉店・サラダ場・スープ場ガイド\n\n**対象担当**：サラダ場・スープ場\n\n## 代表メニュー・作業例\n\n1. チョレギサラダ：ドレッシングの有無を確認する。\n2. シーザーサラダ：トッピング数を確認する。\n3. 塩キャベツ：小皿の数をそろえる。\n4. ナムル盛り：指定の3種類を確認する。\n5. キムチ盛り：辛さ変更の伝票を確認する。\n6. わかめスープ：器と注文札を照合する。\n7. たまごスープ：追加トッピングを確認する。\n8. ユッケジャン風スープ：提供先を確認する。\n9. 白ごはん：サイズを伝票と照合する。\n10. 取り皿セット：人数分をまとめて準備する。\n\nガイドに記載がないため店長へ確認してください。', 'published', NULL, '', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00'),
  ('knowledge-yakiniku-drink-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・ドリンク場ガイド', '# 焼肉店・ドリンク場ガイド\n\n**対象担当**：ドリンク場\n\n## 代表メニュー・作業例\n\n1. 生ビール：グラスと注文数を確認する。\n2. ハイボール：濃さの指定があれば伝票を確認する。\n3. レモンサワー：追加トッピングを確認する。\n4. ウーロン茶：冷温の指定を確認する。\n5. コーラ：サイズと本数を照合する。\n6. ジンジャーエール：提供先を注文札で確認する。\n7. ノンアルコールビール：通常商品と分ける。\n8. 水・氷：人数分をまとめて準備する。\n9. ソフトドリンクセット：内容と個数を確認する。\n10. 追加ドリンク：追加伝票のテーブル番号を確認する。\n\nガイドに記載がないため店長へ確認してください。', 'published', NULL, '', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00'),
  ('knowledge-yakiniku-wash-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・洗い場ガイド', '# 焼肉店・洗い場ガイド\n\n**対象担当**：洗い場\n\n## 代表的な作業例\n\n1. 丸皿：残り物を分けて洗浄へ回す。\n2. 角皿：サイズ別に重ねる。\n3. 小皿：欠けや汚れを確認する。\n4. 取り皿：数をまとめて棚へ戻す。\n5. 箸・スプーン：種類ごとに分ける。\n6. トング：肉用と取り分け用を分ける。\n7. 焼き網：交換済みと未処理を分ける。\n8. 小鉢：水切り後に所定の場所へ戻す。\n9. ピッチャー：中身を確認して返却する。\n10. バット・トレー：洗浄後の置き場を整理する。\n\nガイドに記載がないため店長へ確認してください。', 'published', NULL, '', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00'),
  ('knowledge-yakiniku-hall-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・ホール接客ガイド', '# 焼肉店・ホール接客ガイド\n\n**対象担当**：ホール接客\n\n## 代表的な作業例\n\n1. 来店時の挨拶：人数と予約の有無を確認する。\n2. 席への案内：人数に合う席へ案内する。\n3. 注文受付：商品名と数量を復唱する。\n4. 追加注文：追加伝票のテーブル番号を確認する。\n5. 肉の提供：商品名とテーブル番号を照合する。\n6. ドリンクの提供：注文数と提供先を確認する。\n7. 網交換：交換依頼を受けて厨房へ伝える。\n8. 途中確認：困りごとがないか確認する。\n9. 会計案内：伝票を確認して会計へつなぐ。\n10. 退店時の挨拶：忘れ物と席の状態を確認する。\n\nガイドに記載がないため店長へ確認してください。', 'published', NULL, '', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00'),
  ('knowledge-yakiniku-waiting-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店・ウェイティングガイド', '# 焼肉店・ウェイティングガイド\n\n**対象担当**：ウェイティング\n\n## 代表的な作業例\n\n1. 来店受付：人数と代表者名を確認する。\n2. 予約確認：予約時刻と人数を照合する。\n3. 待ち順登録：受付時刻の順に記録する。\n4. 呼び出し：案内できる席を確認して声をかける。\n5. 席準備確認：片付け済みかホールへ確認する。\n6. 待ち時間案内：目安を伝え、確定とは言わない。\n7. 人数変更：待ち順と席条件を更新する。\n8. 呼び出し不在：再確認の方法を店長へ相談する。\n9. 混雑共有：待ち人数と案内状況をホールへ伝える。\n10. 退店後の整理：受付表の完了状態を更新する。\n\nガイドに記載がないため店長へ確認してください。', 'published', NULL, '', '2026-08-16T12:00:00+09:00', '2026-08-16T12:00:00+09:00');
UPDATE knowledge_pages SET body = replace(body, char(92) || 'n', char(10)) WHERE group_id = 'seed-group-yakiniku';
UPDATE knowledge_pages SET body = replace(body,
  '## 代表メニュー・作業例' || char(10) || char(10) ||
  '1. カルビ：枚数と盛り付け向きを確認する。' || char(10) ||
  '2. ロース：厚みの違いを確認して専用皿へ盛る。' || char(10) ||
  '3. ハラミ：注文札と皿の名前を照合する。' || char(10) ||
  '4. タン：丸皿の区画を使い、他の肉と混ぜない。' || char(10) ||
  '5. 豚カルビ：牛肉の皿と置き場所を分ける。' || char(10) ||
  '6. 鶏もも：専用トレーに分け、提供先を確認する。' || char(10) ||
  '7. ホルモン：盛り付け後に数量を再確認する。' || char(10) ||
  '8. 盛り合わせA：指定された3種類をそろえる。' || char(10) ||
  '9. 盛り合わせB：追加注文分を別札で管理する。' || char(10) ||
  '10. 追加肉：追加伝票のテーブル番号を確認する。' || char(10) || char(10), '')
WHERE id = 'knowledge-yakiniku-meat-guide';
UPDATE knowledge_pages SET body = replace(body,
  '焼肉店のデモ用ガイドです。メニュー名・数値・手順は架空の例です。実際の営業では店長の指示と衛生基準を優先してください。',
  '焼肉店の肉場ルールです。以下の数値・手順をこの店舗の標準として扱います。例外や規格外は店長へ確認してください。')
WHERE id = 'knowledge-yakiniku-meat-guide';
UPDATE knowledge_pages SET body = body || char(10) || char(10) || '## 肉場の盛り付け仕様（デモ固定値）' || char(10) || char(10) || '> 以下はデモ用に決めた固定値です。実際の店舗の規格や衛生基準を示すものではありません。' || char(10) || char(10) || '### デモカルビ' || char(10) || '- 枚数：8枚' || char(10) || '- サイズ：縦6cm × 横4cm × 厚さ0.3cm' || char(10) || '- 盛り付け：4枚ずつ2列、皿の左側' || char(10) || '- 確認：カルビ札、8枚、テーブル番号' || char(10) || char(10) || '### デモロース' || char(10) || '- 枚数：6枚' || char(10) || '- サイズ：縦7cm × 横4cm × 厚さ0.4cm' || char(10) || '- 盛り付け：長辺をそろえて1列' || char(10) || '- 確認：ロース札、6枚、皿の向き' || char(10) || char(10) || '### デモハラミ' || char(10) || '- 枚数：7枚' || char(10) || '- サイズ：縦6cm × 横3.5cm × 厚さ0.35cm' || char(10) || '- 盛り付け：中央を少し重ねて半円状' || char(10) || '- 確認：ハラミ札、7枚、タレ指定'
WHERE id = 'knowledge-yakiniku-meat-guide' AND instr(body, '## 肉場の盛り付け仕様（デモ固定値）') = 0;
UPDATE knowledge_pages SET body = body || char(10) || char(10) || '### デモタン塩' || char(10) || '- 枚数：6枚' || char(10) || '- サイズ：縦5cm × 横3cm × 厚さ0.25cm' || char(10) || '- 盛り付け：皿の外周に6枚' || char(10) || '- 確認：タン塩札、6枚、ねぎ添付の有無' || char(10) || char(10) || '### デモ上タン' || char(10) || '- 枚数：5枚' || char(10) || '- サイズ：縦6cm × 横3.5cm × 厚さ0.5cm' || char(10) || '- 盛り付け：厚切り面を上にして1列' || char(10) || '- 確認：上タン札、5枚、通常タンとの取り違えなし' || char(10) || char(10) || '### デモ豚カルビ' || char(10) || '- 枚数：8枚' || char(10) || '- サイズ：縦6cm × 横4cm × 厚さ0.3cm' || char(10) || '- 盛り付け：4枚ずつ2列、牛肉皿と分離' || char(10) || '- 確認：豚カルビ札、8枚、タレ指定' || char(10) || char(10) || '### デモ鶏もも' || char(10) || '- 枚数：7枚' || char(10) || '- サイズ：縦5cm × 横4cm × 厚さ0.5cm' || char(10) || '- 盛り付け：専用トレーに間隔を空けて配置' || char(10) || '- 確認：鶏もも札、7枚、専用トレー'
WHERE id = 'knowledge-yakiniku-meat-guide' AND instr(body, '### デモタン塩') = 0;
UPDATE knowledge_pages SET body = body || char(10) || char(10) || '### デモホルモン' || char(10) || '- 枚数：8枚' || char(10) || '- サイズ：縦4cm × 横3cm × 厚さ0.5cm' || char(10) || '- 盛り付け：脂身を上にして4枚ずつ2列' || char(10) || '- 確認：ホルモン札、8枚、部位名' || char(10) || char(10) || '### デモ盛り合わせA' || char(10) || '- 枚数：12枚（カルビ4枚、ロース4枚、ハラミ4枚）' || char(10) || '- サイズ：各部位の標準サイズ、厚さ0.3cm' || char(10) || '- 盛り付け：部位ごとに4枚の区画を作る' || char(10) || '- 確認：3部位、合計12枚、盛り合わせ札' || char(10) || char(10) || '### デモ盛り合わせB' || char(10) || '- 枚数：15枚（タン5枚、豚カルビ5枚、鶏もも5枚）' || char(10) || '- サイズ：各部位の標準サイズ、厚さ0.3cm' || char(10) || '- 盛り付け：部位ごとに5枚の区画を作る' || char(10) || '- 確認：3部位、合計15枚、追加注文との混同なし' || char(10) || char(10) || '## 肉場の最終確認' || char(10) || char(10) || '枚数・サイズ・部位・注文札・テーブル番号を順番に確認します。仕様外の注文、アレルギー、衛生や加熱に関する質問は、ガイドに記載がないため店長へ確認してください。'
WHERE id = 'knowledge-yakiniku-meat-guide' AND instr(body, '## 肉場の最終確認') = 0;
UPDATE knowledge_pages SET body = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body,
  '## 肉場の盛り付け仕様（デモ固定値）', '## 肉場の盛り付けルール'),
  '> 以下はデモ用に決めた固定値です。実際の店舗の規格や衛生基準を示すものではありません。', '> 以下を店舗の標準ルールとします。例外や規格外は店長へ確認してください。'),
  'デモカルビ', 'カルビ'), 'デモロース', 'ロース'), 'デモハラミ', 'ハラミ'),
  'デモタン塩', 'タン塩'), 'デモ上タン', '上タン'), 'デモ豚カルビ', '豚カルビ'),
  'デモ鶏もも', '鶏もも'), 'デモホルモン', 'ホルモン'), 'デモ盛り合わせ', '盛り合わせ')
WHERE id = 'knowledge-yakiniku-meat-guide';

-- End of standalone yakiniku seed.
