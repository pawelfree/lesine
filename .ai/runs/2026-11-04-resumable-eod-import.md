# Resumable EOD import — issue #10

Goals: Deliver durable quota-aware EODHD import jobs, safe restart and lease fencing, and visible job progress.
Spec: [Local GPW history with coverage](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: in-progress

## Commit log

2026-11-04 — Add the execution plan for issue #10 and this task journal.
Decision: scope work to the durable EOD import task; immutable revisions and full coverage remain follow-up issues.
Remaining: implement, verify, review and publish the import PR.

2026-11-04 — Add durable import jobs, monthly bounded EOD requests, missing-range scheduling, lease fencing and quota handling.
Decision: completed ranges are subtracted before scheduling; a backfill deliberately rechecks them. Original responses are retained with hashes; canonical revisions follow in #11.
Verification: migration, overlapping-range API tests, worker concurrency/retry tests and full TypeScript build passed.
Remaining: finish the Data page, process rule, end-to-end smoke check and PR review.

2026-11-04 — Show import progress and start/resume controls on the Data page; document the EOD stage and PR environment cleanup rule.
Decision: a finished request is not displayed as proof of archive completeness. Temporary PR Compose projects must be removed with their test volumes.
Verification: Angular tests, full build and local HTTP status checks passed; browser screenshot access was unavailable.
Remaining: review the diff, publish final PR state and remove the temporary test environment.
