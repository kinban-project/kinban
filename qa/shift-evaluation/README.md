# Shift assignment evaluation

This fixture set supports Issue #93. It uses an evaluation-only group and draft plans. It never publishes a shift, sends a message, or performs attendance approval.

## Run

```powershell
npm run db:seed:local
npm run db:seed:evaluation
npm run evaluate:shifts
```

The runner targets `http://localhost:3003` as demo user `tanaka` by default. Set `KINBAN_BASE_URL` or use `--base-url` when needed. The nightclub scenario uses its manager demo user automatically.

## Matrix

The runner evaluates five scenarios: the two existing demo plans plus three dedicated fixtures: cafe weekday peaks, a cross-midnight event, and sudden absence/partial reassignment.

Each scenario creates 24 temporary candidates: four priorities (`preference`, `labor`, `fairness`, `minimal`) x three scopes (`unfilled`, `problems`, `all`) x two seeds. Candidates are deleted after scoring unless `--keep-scenarios` is supplied.

## Score

The score is comparative, not an automatic approval decision. It weights hard violations first (unavailable assignment and overlap), then shortages, overfill, generated warnings, preference conflicts, and workload spread. The report includes the settings, seed, assignment totals, violations, warnings, and the best candidate.

Reports are written to `qa/shift-evaluation/runs/`, which is ignored by Git. The JSON report is the machine-readable evidence; the Markdown report is a quick review summary.

## AI comparison

An AI-produced assignment must be saved as a snapshot and evaluated with the same scorer before it is accepted. The current runner records this comparison as `not-run`; this keeps the baseline reproducible without silently invoking an external agent or changing a real/demonstration plan.
