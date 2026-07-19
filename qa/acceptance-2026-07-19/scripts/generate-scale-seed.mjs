import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const output = process.argv[2] ?? resolve(root, "logs/scale-seed.sql");
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = ["BEGIN TRANSACTION;"];

for (let i = 1; i <= 100; i += 1) {
  const email = `scale-user-${String(i).padStart(3, "0")}@local.test`;
  statements.push(`INSERT OR REPLACE INTO account_profiles (user_email, nickname) VALUES (${q(email)}, ${q(`負荷ユーザー${i}`)});`);
}
for (let g = 1; g <= 5; g += 1) {
  const groupId = `scale-group-${String(g).padStart(2, "0")}`;
  const owner = `scale-user-${String(g).padStart(3, "0")}@local.test`;
  statements.push(`INSERT OR REPLACE INTO groups (id, name, description, owner_email) VALUES (${q(groupId)}, ${q(`負荷テスト店舗${g}`)}, 'QA scale fixture', ${q(owner)});`);
  const members = g === 1 ? Array.from({ length: 100 }, (_, i) => i + 1) : [1, ...Array.from({ length: 10 }, (_, i) => (g - 1) * 10 + i + 1)];
  for (const i of members) {
    const email = `scale-user-${String(i).padStart(3, "0")}@local.test`;
    statements.push(`INSERT OR REPLACE INTO group_members (id, group_id, user_email, display_name, admin_note, role, status, show_in_personal) VALUES (${q(`${groupId}-member-${i}`)}, ${q(groupId)}, ${q(email)}, ${q(`スタッフ${i}`)}, ${q(`管理メモ${i}`)}, ${q(email === owner ? "owner" : i === 1 ? "editor" : "member")}, 'active', 1);`);
  }
}

const planId = "scale-plan-big";
statements.push(`INSERT OR REPLACE INTO shift_plans (id, group_id, name, start_date, end_date, opening_time, closing_time, slot_minutes, default_required_count, notes, status, created_by) VALUES ('${planId}', 'scale-group-01', '100人31日シフト', '2026-08-01', '2026-08-31', '09:00', '25:00', 120, 2, 'QA scale fixture', 'published', 'scale-user-001@local.test');`);
for (let day = 1; day <= 31; day += 1) {
  const date = `2026-08-${String(day).padStart(2, "0")}`;
  for (const [start, end] of [["09:00", "13:00"], ["13:00", "17:00"], ["17:00", "21:00"], ["21:00", "25:00"]]) {
    for (const role of ["ホール", "厨房"]) {
      const slotId = `scale-slot-${String(day).padStart(2, "0")}-${start.replace(":", "")}-${role}`;
      statements.push(`INSERT OR REPLACE INTO shift_slots (id, plan_id, date, start_time, end_time, required_count, role) VALUES (${q(slotId)}, '${planId}', ${q(date)}, ${q(start)}, ${q(end)}, 2, ${q(role)});`);
      const base = ((day * 7 + Number(start.slice(0, 2)) + (role === "厨房" ? 11 : 0)) % 100) + 1;
      for (const i of [base, (base % 100) + 1]) {
        const email = `scale-user-${String(i).padStart(3, "0")}@local.test`;
        const assignmentId = `${slotId}-${i}`;
        statements.push(`INSERT OR REPLACE INTO shift_assignments (id, slot_id, user_email) VALUES (${q(assignmentId)}, ${q(slotId)}, ${q(email)});`);
      }
    }
  }
}
statements.push(`WITH RECURSIVE
  months(m) AS (VALUES(0) UNION ALL SELECT m + 1 FROM months WHERE m < 11),
  users(u) AS (VALUES(1) UNION ALL SELECT u + 1 FROM users WHERE u < 100),
  work_days(d) AS (VALUES(2), (9), (16), (23)),
  rows AS (
    SELECT
      printf('scale-history-%03d-%02d-%02d', u, m + 1, d) AS id,
      printf('scale-user-%03d@local.test', u) AS user_email,
      date('2025-08-01', printf('+%d months', m), printf('+%d days', d - 1)) AS work_date
    FROM months CROSS JOIN users CROSS JOIN work_days
  )
INSERT OR REPLACE INTO work_records
  (id, group_id, user_email, scheduled_date, scheduled_start_time, scheduled_end_time,
   started_at, ended_at, claimed_start_at, claimed_end_at, claimed_break_minutes, status,
   employee_note, manager_note, approved_by, approved_at)
SELECT id, 'scale-group-01', user_email, work_date, '09:00', '17:00',
       work_date || 'T09:00:00+09:00', work_date || 'T17:00:00+09:00',
       work_date || 'T09:00:00+09:00', work_date || 'T17:00:00+09:00', 60, 'approved',
       'QA 12か月履歴', 'QA承認済み', 'scale-user-001@local.test', work_date || 'T17:30:00+09:00'
FROM rows;`);
statements.push("COMMIT;");
await writeFile(output, statements.join("\n") + "\n", "utf8");
console.log(JSON.stringify({ output, statements: statements.length, users: 100, groups: 5, slots: 31 * 8, assignments: 31 * 8 * 2, historicalWorkRecords: 12 * 100 * 4 }, null, 2));
