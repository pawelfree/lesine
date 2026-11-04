# Provisional atomic commit plan

Execution: sequential architect checkpoint. Inputs: App Spec §§1–4.5 and `capability-catalog.md`; no existing application code or platform capability was found. Counts are planning units, not a promise about lines of code. A framework selected in a feature spec may change the estimate, but a platform capability may not be claimed without source evidence.

## WF1 — 10 commits

1. Local persistence and provenance model.
2. Main Market/NewConnect and delisted instrument inventory adapter.
3. Dated symbol identity and corporate-action import.
4. Daily index/share series import.
5. Quota-aware checkpoints and resume.
6. Raw revision retention and idempotency.
7. Expected-universe and date-range coverage calculation.
8. Missing/partial history report.
9. Data coverage page and import status.
10. Correction dependency marking and new snapshot creation.

## WF2 — 11 commits

1. JSON/DSL document registry and canonical version hash.
2. Schema/type/unit validation and restricted operator registry.
3. Activation and one-version-per-session rule.
4. Point-in-time source selection and 08:30 cutoff.
5. GPW trend, lag and rolling-percentile operators.
6. Historical-universe breadth operator.
7. Weighted score and D03 policy mapping.
8. Daily scheduling and explicit blocked/pending state.
9. Revisions and stale-result lineage.
10. Today page.
11. History/version-detail pages.

## WF3 — 10 commits

1. JSON protocol registry and validation.
2. Immutable run creation and snapshot/version binding.
3. WIG theoretical allocation simulation.
4. ETF basket simulation from actual common listing date.
5. Next-close execution and turnover/cost calculation.
6. Cash/corporate-action accounting.
7. Chronological holdout and attempt labels.
8. Coverage and point-in-time limitation gates.
9. Metrics and comparison charts.
10. Saved-run comparison and audit detail.

## Architect checkpoint

- Missed platform capability? No platform is installed or configured; none can be claimed. Standard libraries/frameworks may replace app plumbing after selection, so estimates remain provisional.
- Overengineering? Two app modules preserve the provider boundary and keep indicator/test invariants together. No separate notification service, portal, brokerage integration or visual formula builder is proposed.
- External gate: provider access and data rights have no commit count. An import that cannot finish for lack of entitlement does not satisfy WF1.
