# Remove expected coverage from Lesine

## Decision

The product owner removed the concept of an “expected” market/catalog/session range on 2026-11-05. Lesine records source identities, requested import ranges, archived observations and failures; it does not construct an expected universe or compare actual data against one. This applies throughout product requirements, data contracts, UI and implementation, including future archive work. Full available GPW history remains a collection goal, never a claim inferred from a report.

## Behavior

- `/data` shows acquired observations and their dates, import progress and evidenced import problems. It has no “Oczekiwane” field, expected-scope notice or expectation-based completeness status.
- `GET /api/coverage` and `GET /api/catalog` omit expected-scope fields. No reason code for an unknown expected scope is generated.
- A forward-only migration removes the unused `expected_scope_status` column; earlier applied migration 006 remains intact. Old immutable report generations remain internal historical records. The migration advances the input revision so a fresh generation without expectation findings is built.
- The browser cache moves to a new key to discard the former response shape. Source responses, revisions, import jobs and catalog identities are preserved.
- The optimistic-concurrency parameter `expected_catalog_id` is unrelated to expected data coverage and remains unchanged.

## Acceptance

A migrated database with previously imported EOD data still reports the same acquired count and date ranges. The response and rendered page contain no expected-coverage field or notice. A new database applies all migrations. Import jobs and catalog refreshes continue to work. Build, automated tests and an isolated Compose smoke test pass. Existing persistent Lesine data are not used for destructive testing.

## Compatibility and risks

The API shape changes for the local Angular client in the same deployment; no external consumer is documented. Migration 007 is forward-only. A coordinated PostgreSQL-plus-response-file backup is required before deploying it to the persistent stack. A rollback restores the backup with the previous image. Old report generations remain retained but are never served as current after the revision bump.
