# Lesine

Private, local platform for researching GPW market indicators and validating investment hypotheses. The first planned output is a daily market barometer with a versioned JSON/DSL definition and historical WIG and ETF tests.

The accepted stack is Angular, NestJS, a separate TypeScript calculation/import worker, PostgreSQL and local Docker Compose. See the [technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md).

The repository currently contains specifications and process configuration; application code has not been implemented. Start with the [GPW history specification](.ai/specs/2026-11-04-local-gpw-history-with-coverage.md), then the [daily barometer](.ai/specs/2026-11-04-daily-declarative-gpw-barometer.md) and the two historical-test specifications. The [product brief](.ai/specs/product-brief.md) and [App Spec](.ai/specs/2026-11-04-app-spec-lesine.md) hold the product rules.
