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

2026-11-04 — Mark Phase 1 archive schema and import steps complete in the execution plan.
Decision: keep recovery as a separate phase so the manifest transaction can be reviewed independently.
Remaining: file reconciliation, backup/restore, correction and tamper tests, documentation and PR review.

2026-11-04 — Add archive integrity checks, orphan quarantine, a bundle backup/restore command, and safe legacy-chunk rescheduling.
Decision: restore accepts only empty volumes and verifies bundle and restored references before services restart.
Verification: PostgreSQL integration covered corrections, tampering and orphan handling; disposable Compose projects restored empty and populated bundles (one bar, one manifest, one file).
Remaining: final validation, code review, PR publication and temporary-environment cleanup.

2026-11-04 — Mark Phase 2 recovery steps complete in the execution plan.
Decision: keep the populated restore smoke test as release evidence, then run the full configured gate before review.
Remaining: full validation, code review, PR publication and temporary-environment cleanup.

2026-11-04 — Add a PostgreSQL regression for a failed revision insert after manifest creation.
Decision: a database constraint failure must roll back the manifest and leave the chunk pending.
Verification: the test passed on a fresh isolated database; a populated bundle restored one bar, one manifest and one checked file into empty volumes.
Remaining: final full gate, code review, PR publication and cleanup.

2026-11-04 — Preserve and verify response files from pre-manifest imports during migration and backup.
Decision: legacy completed chunks stay unverified but their source files remain referenced until a new import provides a manifest.
Verification: a fresh PostgreSQL database passed the before/after migration file-retention and bundle test.
Remaining: final validation, re-review, ready PR and environment cleanup.

2026-11-04 — Keep services stopped after a backup taken against the pre-manifest schema.
Decision: the newly built worker must not run against schema 003 before the upgraded API applies migration 004.
Verification: a disposable schema-003 Compose project produced a bundle and left only PostgreSQL running.
Remaining: final build, code review, ready PR and temporary-environment cleanup.

2026-11-04 — Complete the execution plan after full validation and the PR code-review pass.
Decision: retain `needs-qa` for the high-risk archive flow; native self-approval is unavailable on GitHub.
Verification: build, unit tests, isolated PostgreSQL tests, old-schema backup and populated restore passed; review evidence is on PR #14.
Remaining: human QA/merge decision after the ready PR; temporary test resources are removed by this run.

2026-11-04 — Handle stale temporary response files in the PR review autofix loop.
Decision: quarantine only known import temp names older than ten minutes; preserve fresh in-flight writes.
Verification: npm build/test and isolated PostgreSQL integration passed.
Remaining: publish the re-review, then restore the journal's done status.
