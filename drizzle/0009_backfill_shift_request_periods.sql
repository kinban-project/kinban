INSERT INTO shift_request_periods (id, group_id, plan_id, name, opens_on, closes_on, status, created_by)
SELECT lower(hex(randomblob(16))), plan.group_id, plan.id, plan.name || 'の勤務希望', '',
       max(date(plan.start_date, '-15 day'), date('now', '+2 day')),
       'pending', plan.created_by
FROM shift_plans AS plan
WHERE plan.status = 'draft'
  AND NOT EXISTS (
    SELECT 1
    FROM shift_request_periods AS period
    WHERE period.plan_id = plan.id
  );
