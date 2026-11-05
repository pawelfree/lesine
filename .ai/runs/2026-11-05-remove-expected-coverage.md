# Remove expected coverage from Lesine

Goals: Remove the expected market/catalog/session range concept from active requirements, API, UI, schema and tests; preserve acquired data and import behavior.
Specification: [2026-11-05-remove-expected-coverage.md](../specs/2026-11-05-remove-expected-coverage.md)
Status: in-progress

2026-11-05 — Remove expectation-scope fields from active specs, API, UI and tests; add forward-only migration 007 without touching archived EOD bars.
Decision: retain the unrelated optimistic-concurrency `expected_catalog_id` and old immutable report generations; a revision bump makes the new report current.
Verification: Node 24 Docker build, npm tests, isolated Compose smoke and four PostgreSQL integration tests passed; temporary containers, volumes and images removed.
Remaining: independent PR review and QA before merge, then deploy the migration after a coordinated backup.
2026-11-05 — Align the tracked E02 backlog row with the owner decision and update open GitHub epic #2 and issue #7.
Decision: retained-source accounting replaces the removed expectation denominator in future archive work.
Remaining: PR #25 review and QA, then merge and deploy after backup.
2026-11-05 — Remove provider-availability fields and calendar-interval findings from coverage API, UI, tests and specs in PR #25.
Decision: keep EODHD source identity and explicit unfinished/empty import evidence; hide finding details when there are none.
Verification: npm tests, Node 24 Docker build, isolated Compose smoke and four PostgreSQL integration tests passed; all temporary resources removed.
Remaining: independent review and QA, then merge and deploy after a coordinated backup.
2026-11-05 — Filter retired findings from old report rows served when a refresh fails.
Decision: preserve immutable historical report data while suppressing obsolete API messages.
Verification: Node 24 Docker build, npm tests, isolated Compose smoke and five PostgreSQL integration tests passed; temporary resources removed.
Remaining: independent review and QA, then merge and deploy after a coordinated backup.
