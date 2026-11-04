# Issue #11 — Immutable EOD archive

Goal: retain original EOD responses with an auditable, append-only bar history and a restorable database/file bundle.

Source doc: .ai/specs/2026-11-04-local-gpw-history-with-coverage.md
Issue: #11

## Scope

Implement step 5 of the source-inventory and local EOD archive plan. Keep the current monthly import, lease, and quota behavior. Canonical bars remain keyed by source identity until verified instrument links exist.

## Implementation Plan

### Phase 1: Archive model and atomic import

1.1 Add manifest and canonical bar revision schema, with immutable references and uniqueness across jobs.
1.2 Validate and normalize EOD rows, retain checked response files, then commit manifest, revision links, chunk, and cursor under the current lease in one transaction.

### Phase 2: Recovery

2.1 Verify referenced files and quarantine unreferenced import files; block import when committed archive files are corrupt or missing.
2.2 Add a local PostgreSQL-plus-files backup and restore command that verifies hashes before the archive is exposed.

### Phase 3: Evidence and delivery

3.1 Test cross-job idempotence, corrections, stale leases, crash atomicity, tampering, and backup/restore against isolated PostgreSQL.
3.2 Document the procedure and limits, run the configured build and integration checks, and publish a reviewable PR.

## Risks

- Database and filesystem cannot share one transaction. Files become durable before the PostgreSQL commit; orphaned files must not expose data.
- A response file already present at a hash path must be verified before reuse.
- Existing import chunks from the previous stage have no manifest; migration must preserve them without making a false readiness claim.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Archive model and atomic import

- [x] 1.1 Add manifest and canonical bar revision schema, with immutable references and uniqueness across jobs. — b3d03e7
- [x] 1.2 Validate and normalize EOD rows, retain checked response files, then commit manifest, revision links, chunk, and cursor under the current lease in one transaction. — b3d03e7

### Phase 2: Recovery

- [x] 2.1 Verify referenced files and quarantine unreferenced import files; block import when committed archive files are corrupt or missing. — 7b97d32
- [x] 2.2 Add a local PostgreSQL-plus-files backup and restore command that verifies hashes before the archive is exposed. — 7b97d32

### Phase 3: Evidence and delivery

- [ ] 3.1 Test cross-job idempotence, corrections, stale leases, crash atomicity, tampering, and backup/restore against isolated PostgreSQL.
- [ ] 3.2 Document the procedure and limits, run the configured build and integration checks, and publish a reviewable PR.
