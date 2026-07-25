# Shift plan request-period runbook

When creating a shift plan with a request window, pass the nested object explicitly:

```json
{
  "requestPeriod": {
    "name": "August second half requests",
    "opensOn": "2026-07-20",
    "closesOn": "2026-08-10"
  }
}
```

After `create_shift_plan` returns, do not infer that the request period was saved from the user's wording. Confirm the returned `requestPeriod` object, take its `id` as `periodId`, and call `get_shift_request_overview` with that `periodId`. If the overview says that the period is missing, report the operation as incomplete and do not claim that requests are open.
