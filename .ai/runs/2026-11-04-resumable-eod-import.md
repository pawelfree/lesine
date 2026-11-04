# Resumable EOD import — issue #10

Goals: Deliver durable quota-aware EODHD import jobs, safe restart and lease fencing, and visible job progress.
Spec: [Local GPW history with coverage](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: done

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

2026-11-04 — Mark the planned implementation steps complete and link draft PR #13.
Decision: actual EODHD account access and browser screenshots remain unverified; fake-provider and local HTTP checks supply the available evidence.
Remaining: authoritative review, final PR labels and test-environment cleanup.

2026-11-04 — Tighten the import boundary: reject unexpected resume input, test migration rollback and preserve missing days across overlapping requests.
Decision: keep the source response archive and cursor separate from later normalized revisions; do not claim market completeness on job completion.
Verification: full build and unit suite passed; isolated PostgreSQL migration, API and fake-provider worker tests passed.
Remaining: publish review evidence and labels, close the draft state, remove PR test resources.

2026-11-04 — Close review findings: fence missing source references, validate response dates and distinguish provider failures from local storage errors.
Decision: a failed job can resume only when its scope has no other active job; the API maps that conflict to 409.
Verification: configured build, unit tests, fresh migration/rollback test and isolated PostgreSQL worker tests passed.
Remaining: update PR review state and labels, remove temporary Compose resources.

2026-11-04 — Finish empty jobs without a provider key or network call and add the regression case.
Decision: completion of already-fetched work requires no source credential; only pending chunks do.
Verification: full build/test suite and isolated worker integration test passed.
Remaining: finalize PR state and clean up its test environment.

2026-11-04 — Finish ready PR #13 with review evidence, labels and a documented browser/account-access limit.
Decision: `needs-qa` remains because the UI changed and browser screenshot access was unavailable; no real EODHD entitlement is asserted.
Verification: temporary `lesine-pr13` containers, network, test volumes and images were removed and confirmed absent; the main `lesine` project stayed running.
Remaining: independent PR/QA gates and the separate canonical-revision task #11.

2026-11-04 — Correct the PR's QA route after applying the owner's earlier preference to skip manual checks of the temporary Data view.
Decision: replace `needs-qa` with `skip-qa`; keep automated UI, database and worker evidence and disclose that browser screenshots were unavailable.
Remaining: independent code review and real EODHD entitlement/depth evidence; issue #11 supplies canonical revisions.

2026-11-04 — Correct the review findings for PR #13: honor the full provider Retry-After and reject malformed import fields with HTTP 400.
Decision: preserve the provider's stated backoff; validate JSON field types before checking allowed values.
Verification: full build and test suite plus isolated PostgreSQL API and worker regression tests passed.
Remaining: publish the review result and remove the temporary PR environment.
