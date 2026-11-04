# Lesine

Private, local platform for researching GPW market indicators and validating investment hypotheses. The first planned output is a daily market barometer with a versioned JSON/DSL definition and historical WIG and ETF tests.

The accepted stack is Angular, NestJS, a separate TypeScript calculation/import worker, PostgreSQL and local Docker Compose. See the [technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md).

The local shell, source catalog and resumable EOD import are available. The Data page reports an empty or unavailable source honestly and keeps provider symbol identities separate. The import stores original responses and source-keyed, append-only EOD revisions; market coverage, snapshots, indicators and backtests remain separate backlog work. The [GPW history specification](.ai/specs/2026-11-04-local-gpw-history-with-coverage.md), [product brief](.ai/specs/product-brief.md) and [App Spec](.ai/specs/2026-11-04-app-spec-lesine.md) hold the product rules.

## Run locally

Docker Desktop must be running. Create a private `.env` file with a random database password (see `.env.example`), then start the stack:

```sh
openssl rand -hex 32 | awk '{print "LESINE_DB_PASSWORD=" $0}' > .env
docker compose up --build --detach --wait
```

Open <http://127.0.0.1:8080/data>. The health endpoint is <http://127.0.0.1:8080/api/health>. Only the web port is published, on loopback. PostgreSQL and the worker remain on the private Compose network; named volumes retain the database and original provider-response files across restarts.

The catalog probe is manual so a restart cannot spend source quota. Add `EODHD_API_TOKEN` to the private `.env` file, then run `docker compose run --rm worker node apps/worker/dist/probe.js`. It requests the WAR active and delisted lists once each (one API call per list). For one representative symbol per list, it also probes EOD, dividends and splits over a bounded one-year window if budget remains (up to eight calls total). The locally reserved daily budget is `LESINE_EODHD_DAILY_BUDGET` (default 2); set it to at least 8 to run all depth probes in one day. Set a larger value only within the allowance of your EODHD plan. This local budget does not know about API calls made outside Lesine. Run this only with an account entitled to those endpoints. Without a token, the probe records an unavailable state and makes no request. Reload `/data` to inspect the result. The first date shown is only the earliest seen in the bounded sample, never a claim about the full provider history. Actual account rights and retention terms still require verification. The `WAR` list alone does not prove Main Market/NewConnect classification, so those symbols remain `unclassified` until independent evidence is available. This command does not import historical prices.

After the catalog is available, `/data` can start a one-year EOD request. The worker fetches one month per source identity at a time, reserving each request against the same local daily budget as the catalog probe. It records completed chunks, waits after quota or network errors, and resumes from the committed checkpoint after restart. The Data page shows progress and allows a paused/failed job to be resumed. An incremental run skips exactly matching completed ranges; a backfill run deliberately rechecks them. Each successful chunk writes a checksummed private response file; its manifest, source-keyed EOD revisions and checkpoint commit together. Reimporting the same bar creates no new revision; a changed bar is appended. `available_at` means first local import, not a proven publication time. Existing chunks completed before the manifest migration remain unverified legacy chunks; a new incremental job schedules them again instead of counting them as archived. A `done` job means requests finished, not that the GPW archive is complete.

## Back up and restore the archive

Take a backup **before each migration** and after valuable imports. The command stops API and worker writes, dumps PostgreSQL, verifies every referenced provider-response file, and creates one versioned directory with `database.dump`, `bundle.json` and `responses/`. It then restarts the services. Choose an absolute path outside the repository; the bundle contains source data and should remain private.

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
