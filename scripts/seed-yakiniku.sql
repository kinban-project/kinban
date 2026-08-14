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

WITH RECURSIVE dates(date) AS (
  SELECT '2026-08-01'
  UNION ALL SELECT date(date, '+1 day') FROM dates WHERE date < '2026-08-15'
)
INSERT OR IGNORE INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role)
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

INSERT OR IGNORE INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by) VALUES
  ('seed-yakiniku-request-august-first', 'seed-group-yakiniku', 'seed-yakiniku-plan-august-first', '焼肉店 8月前半希望', '2026-07-20', '2026-07-30', 'open', 'yakiniku-manager@local.test');

INSERT OR IGNORE INTO knowledge_folders (id, group_id, name, created_by) VALUES
  ('knowledge-folder-yakiniku-guide', 'seed-group-yakiniku', '業務ガイド', 'yakiniku-manager@local.test');
INSERT OR IGNORE INTO knowledge_pages (id, group_id, folder_id, author_email, title, body, status, image_url, image_alt, created_at, updated_at) VALUES
  ('knowledge-yakiniku-position-guide', 'seed-group-yakiniku', 'knowledge-folder-yakiniku-guide', 'yakiniku-manager@local.test', '焼肉店のポジション運用',
   '# 焼肉店のポジション運用\n\n- 肉場・サラダ場・スープ場・洗い場は厨房系の適性を確認する。\n- ホール・ウェイティング・ドリンクは接客系の適性を確認する。\n- 急な欠勤時は、兼任Aと副店長を代替候補として確認する。\n- AIの割当案はたたき台として使い、最終公開前に店長がポジションを確認する。',
   'published', NULL, '', '2026-07-21T12:00:00+09:00', '2026-07-21T12:00:00+09:00');
UPDATE knowledge_pages SET body = replace(body, '\\n', char(10)) WHERE id = 'knowledge-yakiniku-position-guide';

-- 本番デモと同じ時間帯・担当付き枠へ更新する（このファイルを既存DBへ追加適用する場合も再現可能）。
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
