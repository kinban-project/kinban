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
  ('member-duty-yakiniku-hall-a', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-a-waiting', 'seed-group-yakiniku', 'yakiniku-hall-a@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-hall-b', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-b-drink', 'seed-group-yakiniku', 'yakiniku-hall-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-kitchen-a', 'seed-group-yakiniku', 'yakiniku-kitchen-a@local.test', 'duty-yakiniku-meat'),
  ('member-duty-yakiniku-kitchen-b', 'seed-group-yakiniku', 'yakiniku-kitchen-b@local.test', 'duty-yakiniku-salad-soup'),
  ('member-duty-yakiniku-wash-a', 'seed-group-yakiniku', 'yakiniku-wash-a@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-flex-hall', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-flex-drink', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-wash', 'seed-group-yakiniku', 'yakiniku-flex-a@local.test', 'duty-yakiniku-wash'),
  ('member-duty-yakiniku-hall-c', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-hall'),
  ('member-duty-yakiniku-hall-c-waiting', 'seed-group-yakiniku', 'yakiniku-hall-c@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-drink', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-drink'),
  ('member-duty-yakiniku-flex-b-waiting', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-waiting'),
  ('member-duty-yakiniku-flex-b-wash', 'seed-group-yakiniku', 'yakiniku-flex-b@local.test', 'duty-yakiniku-wash');

-- 1日1担当を保ちつつ、時間帯ごとに必要な担当をcoverage_duty_idsで表現する。
DELETE FROM shift_assignments WHERE slot_id IN (SELECT id FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first');
DELETE FROM shift_slots WHERE plan_id = 'seed-yakiniku-plan-august-first';
WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-01'
  UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'
), templates(suffix, start_time, end_time, weekday_count, weekend_count, role, duty_id, duty_name_snapshot, coverage_duty_ids) AS (VALUES
  ('1400-hall', '14:00', '17:00', 1, 1, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall"]'),
  ('1400-kitchen', '14:00', '17:00', 1, 1, '肉場', 'duty-yakiniku-meat', '肉場', '["duty-yakiniku-meat"]'),
  ('1700-hall', '17:00', '18:00', 2, 3, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting"]'),
  ('1900-hall', '19:00', '21:00', 3, 4, 'ホール接客', 'duty-yakiniku-hall', 'ホール接客', '["duty-yakiniku-hall","duty-yakiniku-waiting","duty-yakiniku-drink"]'),
  ('1900-kitchen', '19:00', '21:00', 2, 3, 'サラダ場・スープ場', 'duty-yakiniku-salad-soup', 'サラダ場・スープ場', '["duty-yakiniku-meat","duty-yakiniku-salad-soup"]')
)
INSERT INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role, duty_id, duty_name_snapshot, coverage_duty_ids)
SELECT 'yakiniku-slot-' || dates.date || '-' || templates.suffix,
  'seed-yakiniku-plan-august-first', dates.date, templates.start_time, templates.end_time,
  CASE WHEN strftime('%w', dates.date) IN ('0','6') THEN templates.weekend_count ELSE templates.weekday_count END,
  templates.role, templates.duty_id, templates.duty_name_snapshot, templates.coverage_duty_ids
FROM dates CROSS JOIN templates;

-- 代表例：通常充足、土日ピークの体制不足、担当不可の割当を混在させる。
INSERT OR IGNORE INTO shift_assignments (id, slot_id, user_email) VALUES
  ('yakiniku-assignment-0801-1400-hall', 'yakiniku-slot-2026-08-01-1400-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1400-kitchen', 'yakiniku-slot-2026-08-01-1400-kitchen', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1700-hall-a', 'yakiniku-slot-2026-08-01-1700-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1700-hall-b', 'yakiniku-slot-2026-08-01-1700-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0801-1900-hall-a', 'yakiniku-slot-2026-08-01-1900-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0801-1900-hall-b', 'yakiniku-slot-2026-08-01-1900-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0801-1900-kitchen-a', 'yakiniku-slot-2026-08-01-1900-kitchen', 'yakiniku-kitchen-a@local.test'),
  ('yakiniku-assignment-0801-1900-kitchen-b', 'yakiniku-slot-2026-08-01-1900-kitchen', 'yakiniku-kitchen-b@local.test'),
  ('yakiniku-assignment-0808-1400-hall-c', 'yakiniku-slot-2026-08-08-1400-hall', 'yakiniku-hall-c@local.test'),
  ('yakiniku-assignment-0808-1900-hall-a', 'yakiniku-slot-2026-08-08-1900-hall', 'yakiniku-hall-a@local.test'),
  ('yakiniku-assignment-0808-1900-hall-b', 'yakiniku-slot-2026-08-08-1900-hall', 'yakiniku-hall-b@local.test'),
  ('yakiniku-assignment-0808-1900-kitchen-wrong', 'yakiniku-slot-2026-08-08-1900-kitchen', 'yakiniku-hall-a@local.test');

INSERT OR IGNORE INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-yakiniku-request-august-first', 'seed-group-yakiniku', 'seed-yakiniku-plan-august-first', '焼肉店 8月前半希望', '2026-07-20', '2026-07-30', 'open', 'yakiniku-manager@local.test');

INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-yakiniku-guide', 'seed-group-yakiniku', '業務ガイド', 'yakiniku-manager@local.test');
INSERT OR IGNORE INTO knowledge_pages (id, group_id, folder_id, author_email, title, body, status, image_url, image_alt, created_at, updated_at) VALUES
  ('knowledge-yakiniku-position-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店のポジション運用',
   '# 焼肉店のポジション運用\n\n- 肉場・サラダ場・スープ場・洗い場は厨房系の適性を確認する。\n- ホール・ウェイティング・ドリンクは接客系の適性を確認する。\n- 急な欠勤時は、兼任Aと副店長を代替候補として確認する。\n- AIの割当案はたたき台として使い、最終公開前に店長がポジションを確認する。',
   'published', NULL, '', '2026-07-21T12:00:00+09:00', '2026-07-21T12:00:00+09:00');
UPDATE knowledge_pages SET body = replace(body, '\\n', char(10)) WHERE id = 'knowledge-yakiniku-position-guide';

-- End of standalone yakiniku seed.
