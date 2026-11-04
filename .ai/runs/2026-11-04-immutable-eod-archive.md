# Immutable EOD archive — issue #11

Goals: Store immutable source responses and append-only bar revisions with a checked, recoverable backup bundle.
Spec: [Local GPW history with coverage](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: in-progress

## Commit log

2026-11-04 — Add a tracked execution plan for the scoped archive task.
Decision: implement only spec step 5; prior import and later coverage/snapshot tasks stay separate.
Remaining: schema, atomic import, recovery, tests, documentation and PR review.

2026-11-04 — Add append-only manifest/bar tables, EOD normalization and one fenced transaction for manifest, revision links and chunk completion.
Decision: source-keyed fingerprints deduplicate unchanged bars across jobs; original payloads remain content-addressed files.
Verification: worker unit tests, disposable migration rollback and PostgreSQL import/lease integration passed.
Remaining: file reconciliation, backup/restore, correction and tamper tests, documentation and PR review.
