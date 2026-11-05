# Lesine

Private, local platform for researching GPW market indicators and validating investment hypotheses. The first planned output is a daily market barometer with a versioned JSON/DSL definition and historical WIG and ETF tests.

The accepted stack is Angular, NestJS, a separate TypeScript calculation/import worker, PostgreSQL and local Docker Compose. See the [technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md).

The local shell, source catalog, resumable EOD import and EOD coverage view are available. The Data page reports an empty or unavailable source honestly and keeps provider symbol identities separate. The import stores original responses and source-keyed, append-only EOD revisions; full market-history completeness, snapshots, indicators and backtests remain separate backlog work. The [GPW history specification](.ai/specs/2026-11-04-local-gpw-history-with-coverage.md), [product brief](.ai/specs/product-brief.md) and [App Spec](.ai/specs/2026-11-04-app-spec-lesine.md) hold the product rules.

## Run locally

Docker Desktop must be running. Create a private `.env` file with a random database password (see `.env.example`), then start the stack:

```sh
openssl rand -hex 32 | awk '{print "LESINE_DB_PASSWORD=" $0}' > .env
docker compose up --build --detach --wait
```

Open <http://127.0.0.1:8080/data>. The health endpoint is <http://127.0.0.1:8080/api/health>. Only the web port is published, on loopback. PostgreSQL and the worker remain on the private Compose network; named volumes retain the database and original provider-response files across restarts.

The catalog refresh starts from `/data`: add `EODHD_API_TOKEN` to the private `.env` file, open the page, review the local ticker list and select **Pobierz katalog spółek**. If a list already exists, select **Pobierz katalog ponownie** and confirm the replacement. The worker fetches the two WAR lists (active and delisted), normally using two calls; a restart resumes an already queued job but never starts a new refresh on its own. The old published list stays visible until both parts succeed, and old identities and prices remain stored. Refresh status and retry are visible on the same page. The locally reserved daily budget is `LESINE_EODHD_DAILY_BUDGET` (default 2). Set a larger value only within the allowance of your EODHD plan; the local budget does not know about calls made outside Lesine. Run this only with an account entitled to those endpoints. Actual account rights and retention terms still require verification. The `WAR` list alone does not prove Main Market/NewConnect classification, so those symbols remain `unclassified` until independent evidence is available. This action does not import historical prices.

The optional manual depth probe remains available with `docker compose run --rm worker node apps/worker/dist/probe.js`. It uses the same guarded catalog refresh path when lists need updating, then probes EOD, dividends and splits for one representative symbol per list over a bounded one-year window if budget remains (up to eight calls total on a fresh catalog). Set `LESINE_EODHD_DAILY_BUDGET` to at least 8 to run all probes in one day. The first date shown is only the earliest seen in the bounded sample, never a claim about the full provider history.

After the catalog is available, `/data` can start a one-year EOD request. The importer groups consecutive missing dates across calendar months into one request per source identity, capped at 366 elapsed days (367 inclusive dates). A fresh one-year range therefore normally uses one EODHD call per identity instead of about twelve monthly calls. A committed manifest-backed range is excluded from later incremental imports even when job boundaries differ; gaps become separate requests. Backfill deliberately rechecks the requested range. A legacy completed chunk without a manifest is scheduled again because it does not prove archived coverage. Each provider attempt, including a retry after an in-flight failure, reserves one unit of `LESINE_EODHD_DAILY_BUDGET` before sending the request. The local budget also covers catalog probes and does not know about calls made outside Lesine.

The worker checkpoints each successful request as one chunk. A longer chunk can repeat more work after a crash before commit, but completed chunks survive restart and are not replanned. The Data page shows completed/total chunks, so new job counts are smaller than older month-based job counts and should not be compared as data coverage. Quota or network errors retain committed work; a paused/failed job can be resumed. A response over the existing 5 MB validation limit fails without marking archive coverage complete. Each successful chunk writes a checksummed private response file; its manifest, source-keyed EOD revisions and checkpoint commit together. Reimporting the same bar creates no new revision; a changed bar is appended. `available_at` means first local import, not a proven publication time. A `done` job means requests finished, not that the GPW archive is complete. Fixture tests verify request counts and archive behavior; an authorized EODHD account sample is still needed to confirm real response size, entitlement and source coverage before production backfill.

The **Zakres notowań EOD** section on `/data` reads only local PostgreSQL evidence through `GET /api/coverage`; refreshing it never calls EODHD or spends source quota. It shows each retained source identity, acquired session range, unfinished import-request intervals, unverified intervals between observed dates and archived empty responses, with market, listing and status filters. Provider availability and confirmed gaps remain **unknown** until independently evidenced; a weekend, empty response or one-year Free sample is not counted as a missing trading session or complete GPW archive. The report timestamp records calculation time, while **Ostatnie zapisane EOD** records the last committed acquisition. A source failure leaves old acquired rows readable with the import failure visible. If the API is offline, the browser can show only its last saved first page, clearly marked as cached with the saved filter scope; this display cache is not research data. A local-access denial clears it.

## Back up and restore the archive

Take a backup **before each migration** and after valuable imports. The command stops API and worker writes, dumps PostgreSQL, verifies every referenced provider-response file, and creates one versioned directory with `database.dump`, `bundle.json` and `responses/`. On a database already carrying manifests it restarts the services. When backing up a pre-manifest database, it leaves API and worker stopped so the new worker cannot process jobs before the API applies migration 004; inspect the bundle, then start the upgraded stack with `docker compose up --build --detach --wait`. Choose an absolute path outside the repository; the bundle contains source data and should remain private.

```sh
scripts/archive.sh backup "$HOME/lesine-backups/2026-11-04"
```

To restore, use a **new, empty** PostgreSQL and response-file volume set with the same Compose configuration and database password. `restore` checks all bundle hashes before writing, refuses a nonempty database or response directory, verifies restored references, and only then starts API and worker. For example, use a new Compose project name to create separate volumes:

```sh
LESINE_COMPOSE_PROJECT=lesine-recovery scripts/archive.sh restore "$HOME/lesine-backups/2026-11-04"
```

The command never erases an existing database or volume. If restore fails, API and worker stay stopped; inspect the error and start again with fresh empty volumes. To roll back a migration, stop the current project and restore its pre-migration bundle into empty volumes with the previous application image. Keep old response files and revisions; do not remove them to roll back a correction. The bundle verifies file integrity, but it cannot establish EODHD entitlement, licensing, GPW market classification or historical completeness.

Source contracts: [EODHD exchange symbol lists](https://eodhd.com/financial-apis/exchanges-api-list-of-tickers-and-trading-hours), [API call costs and limits](https://eodhd.com/financial-apis/api-limits), [EOD prices](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [actions](https://eodhd.com/financial-apis/api-splits-dividends), and [storage terms](https://eodhd.com/help/storage).

Stop the app without deleting the volumes with `docker compose down`. Node.js 24.15+ is required for local npm builds; Compose uses Node 24 images. Run `npm ci && npm run build && npm test` to check the source without Docker.
