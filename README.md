# Lesine

Private, local platform for researching GPW market indicators and validating investment hypotheses. The first planned output is a daily market barometer with a versioned JSON/DSL definition and historical WIG and ETF tests.

The accepted stack is Angular, NestJS, a separate TypeScript calculation/import worker, PostgreSQL and local Docker Compose. See the [technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md).

The initial application shell is available. It contains an Angular page, a NestJS health endpoint, a separate NestJS worker process and PostgreSQL. Market data import, indicators and backtests have not been implemented yet. Start the product work with the [GPW history specification](.ai/specs/2026-11-04-local-gpw-history-with-coverage.md), then the [daily barometer](.ai/specs/2026-11-04-daily-declarative-gpw-barometer.md) and the two historical-test specifications. The [product brief](.ai/specs/product-brief.md) and [App Spec](.ai/specs/2026-11-04-app-spec-lesine.md) hold the product rules.

## Run locally

Docker Desktop must be running. Create a private `.env` file with a random database password (see `.env.example`), then start the stack:

```sh
openssl rand -hex 32 | awk '{print "LESINE_DB_PASSWORD=" $0}' > .env
docker compose up --build --detach --wait
```

Open <http://127.0.0.1:8080>. The health endpoint is <http://127.0.0.1:8080/api/health>. Only the web port is published, on loopback. PostgreSQL and the worker remain on the private Compose network; named volumes retain the database and original provider-response files across restarts. The worker currently has no jobs.

Stop the app without deleting the volumes with `docker compose down`. Node.js 24.15+ is required for local npm builds; Compose uses Node 24 images. Run `npm ci && npm run build` to check the source without Docker.
