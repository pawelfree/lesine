# Lesine

Private, local platform for researching GPW market indicators and validating investment hypotheses. The first planned output is a daily market barometer with a versioned JSON/DSL definition and historical WIG and ETF tests.

The accepted stack is Angular, NestJS, a separate TypeScript calculation/import worker, PostgreSQL and local Docker Compose. See the [technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md).

The local shell and source-catalog flow are available. The Data page reports an empty or unavailable source honestly and keeps provider symbol identities separate. Historical EOD bar import, indicators and backtests remain separate backlog work. The [GPW history specification](.ai/specs/2026-11-04-local-gpw-history-with-coverage.md), [product brief](.ai/specs/product-brief.md) and [App Spec](.ai/specs/2026-11-04-app-spec-lesine.md) hold the product rules.

## Run locally

Docker Desktop must be running. Create a private `.env` file with a random database password (see `.env.example`), then start the stack:

```sh
openssl rand -hex 32 | awk '{print "LESINE_DB_PASSWORD=" $0}' > .env
docker compose up --build --detach --wait
```

Open <http://127.0.0.1:8080/data>. The health endpoint is <http://127.0.0.1:8080/api/health>. Only the web port is published, on loopback. PostgreSQL and the worker remain on the private Compose network; named volumes retain the database and original provider-response files across restarts.

The catalog probe is manual so a restart cannot spend source quota. Add `EODHD_API_TOKEN` to the private `.env` file, then run `docker compose run --rm worker node apps/worker/dist/probe.js`. It requests the WAR active and delisted lists once each (one API call per list). For one representative symbol per list, it also probes EOD, dividends and splits over a bounded one-year window if budget remains (up to eight calls total). The locally reserved daily budget is `LESINE_EODHD_DAILY_BUDGET` (default 2, maximum 20); set it to at least 8 to run all depth probes in one day. This local budget does not know about API calls made outside Lesine. Run this only with an account entitled to those endpoints. Without a token, the probe records an unavailable state and makes no request. Reload `/data` to inspect the result. The first date shown is only the earliest seen in the bounded sample, never a claim about the full provider history. Actual account rights and retention terms still require verification. The `WAR` list alone does not prove Main Market/NewConnect classification, so those symbols remain `unclassified` until independent evidence is available. This command does not import historical prices.

Stop the app without deleting the volumes with `docker compose down`. Node.js 24.15+ is required for local npm builds; Compose uses Node 24 images. Run `npm ci && npm run build && npm test` to check the source without Docker.
