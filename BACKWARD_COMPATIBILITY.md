# Backward compatibility

The local application has an Angular `/data` page, `/api/catalog`, `/api/import-jobs`, a worker probe command and forward-only PostgreSQL migrations. These are local application contracts, not published third-party APIs.

Migration 005 adds catalog job, membership and current-pointer tables without deleting source identities, import chunks or EOD history. It seeds an existing EODHD symbol list as a `legacy` current version. `GET /api/catalog` keeps its existing fields, but `rows` and `count` now refer to the published current membership. It adds a catalog version and latest-refresh status; the Angular page sends the version on later pages and reloads after publication. Any local script that treated this endpoint as a list of every identity ever seen must instead query retained history from the database or wait for a dedicated historical API. The rollback path for the schema is a coordinated pre-migration database and response-file backup with the prior application image.

For future contract changes, list the consumers and migration path here. Review the consuming side in the same PR when it is available.

Migration 006 adds append-only EOD coverage reports/rows and a transactional input revision counter. It does not change existing catalog or import-job response shapes, source identities, manifests or bar revisions. `GET /api/coverage` is a new local endpoint consumed by Angular `/data`; no older API consumer exists. The report counts only committed local EOD observations, with unknown expected/provider scope represented by `null`. Roll back by restoring the coordinated pre-migration PostgreSQL and response-file backup with the previous application image; do not drop the new tables on an active archive.
