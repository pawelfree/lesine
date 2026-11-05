# Corporate actions view

Goals: Implement the corporate-actions view and API without changing EOD coverage; archive the completed specification.
Specification: [2026-11-05-corporate-actions-view.md](../specs/2026-11-05-corporate-actions-view.md)
Status: in-progress

2026-11-05 — Add the phased execution plan before implementation.
Decision: one implementation PR for this spec, separate from design PR #30; issue #7 remains open for its other two specs.
Pitfall: ex-date is not a publication timestamp; verified local files only establish archive provenance.
Remaining: implement API, UI, tests, review, and move the spec to `implemented/`.

2026-11-05 — Add paginated action and revision reads with source-file integrity checks.
Decision: cursors bind to filters; every returned page verifies unique referenced files before exposing rows.
Verification: API build and isolated PostgreSQL integration test pass, including correction, withdrawal, pagination and corruption.
Remaining: class-specific import status, Angular view, full validation and spec archival.
