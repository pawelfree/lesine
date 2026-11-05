# Remove expected coverage from Lesine

## Decision

The product owner removed the concept of an “expected” market/catalog/session range on 2026-11-05. The owner also removed the redundant provider-availability column and the calendar-interval warning: nobody will verify those inferred intervals. Lesine records source identities, requested import ranges, archived observations and failures; it does not construct an expected universe, compare actual data against one or infer gaps between returned dates. This applies throughout product requirements, data contracts, UI and implementation, including future archive work. Full available GPW history remains a collection goal, never a claim inferred from a report.

## Behavior

- `/data` shows acquired observations and their dates, import progress and evidenced import problems. It has no “Oczekiwane” or “Dostawca” range column, no provider-availability or confirmed-gap counter, and no notice about unverifiable calendar intervals. Empty finding lists have no disclosure control.
- `GET /api/coverage` omits expected/provider-availability ranges and counts and never emits a `unverified_date_interval` finding. `GET /api/catalog` omits expected-scope fields. Source identity and the selected EODHD provider remain visible as provenance, not a separate coverage measure.
- A forward-only migration removes the unused `expected_scope_status` column; earlier applied migration 006 remains intact. Old immutable report generations remain internal historical records. The migration advances the input revision so a fresh generation without expectation findings is built.
- The browser cache moves to a new key to discard former response shapes. Source responses, revisions, import jobs and catalog identities are preserved.
- The optimistic-concurrency parameter `expected_catalog_id` is unrelated to expected data coverage and remains unchanged.

## Acceptance

A migrated database with previously imported EOD data still reports the same acquired count and date ranges. The response and rendered page contain no expectation/provider-availability coverage fields or calendar-interval warning. An archived empty provider response and unfinished import request retain their explicit findings. A new database applies all migrations. Import jobs and catalog refreshes continue to work. Build, automated tests and an isolated Compose smoke test pass. Existing persistent Lesine data are not used for destructive testing.

## Compatibility and risks

The API shape changes for the local Angular client in the same deployment; no external consumer is documented. Migration 007 is forward-only. A coordinated PostgreSQL-plus-response-file backup is required before deploying it to the persistent stack. A rollback restores the backup with the previous image. Old report generations remain retained but are never served as current after the revision bump.
