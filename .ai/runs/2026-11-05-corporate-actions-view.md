# Corporate actions view

Goals: Implement the corporate-actions view and API without changing EOD coverage; archive the completed specification.
Specification: [2026-11-05-corporate-actions-view.md](../specs/implemented/2026-11-05-corporate-actions-view.md)
Status: in-progress

2026-11-05 — Add the phased execution plan before implementation.
Decision: one implementation PR for this spec, separate from design PR #30; issue #7 remains open for its other two specs.
Pitfall: ex-date is not a publication timestamp; verified local files only establish archive provenance.
Remaining: implement API, UI, tests, review, and move the spec to `implemented/`.

2026-11-05 — Add paginated action and revision reads with source-file integrity checks.
Decision: cursors bind to filters; every returned page verifies unique referenced files before exposing rows.
Verification: API build and isolated PostgreSQL integration test pass, including correction, withdrawal, pagination and corruption.
Remaining: class-specific import status, Angular view, full validation and spec archival.

2026-11-05 — Mark API read step 1.1 complete at 14fa745.
Verification: source file corruption and cursor/filter mismatch are covered by the PostgreSQL test.
Remaining: import status, UI, full gate, review, and moving the spec.

2026-11-05 — Add class-filtered import status for dividends and splits.
Decision: `GET /api/import-jobs` still defaults to EOD; a `data_class` filter selects one action class.
Verification: API build and four PostgreSQL integration tests pass, including parallel classes and quota wait.
Remaining: Angular view, full gate, review, and spec archival.

2026-11-05 — Mark class-specific status step 1.2 complete at bd653ba.
Verification: both action-class responses and unchanged EOD default pass in the isolated database.
Remaining: UI, full gate, review, and moving the spec.

2026-11-05 — Add the `/data` corporate-actions section and an exact provider-symbol filter.
Decision: keep the screen read-only; revisions and retained rows remain visible when the action import is quota-paused.
Verification: 16 Angular tests and the targeted PostgreSQL action API test pass on Node 24.
Remaining: browser smoke, full gate, review, documentation, and spec archival.

2026-11-05 — Mark UI step 2.1 complete after a Compose and browser smoke test.
Verification: a retained dividend, its withdrawal and older revision render; symbol filtering shows the empty state.
Pitfall: the browser extension could not reach localhost, so the configured agent-browser CLI captured the view.
Remaining: full gate, final review, documentation, and spec archival.

2026-11-05 — Scope revision history by source symbol and archive the completed view spec.
Pitfall: event keys can coincide across instruments; the API now requires `source_symbol_id` and UI caches histories per instrument.
Verification: isolated PostgreSQL regression, full build, Angular tests and rebuilt Compose browser smoke pass.
Remaining: final PR review, publication and temporary environment cleanup; issue #7 retains two other views.
