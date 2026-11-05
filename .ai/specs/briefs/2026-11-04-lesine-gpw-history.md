# Local GPW history with coverage

- Date: 2026-11-04
- Category: feature
- Priority signal: high — Phase 1 gates all later calculations
- Risk signal: high — provider rights, delisted history and archive depth are unverified
- Routing: om-spec-writing "Local GPW history with coverage — brief: .ai/specs/briefs/2026-11-04-lesine-gpw-history.md"
- App Spec: `.ai/specs/2026-11-04-app-spec-lesine.md` — source of truth; §§1.3–1.4, 2, 3 WF1, 3.5 Data coverage, 4, 4.5, 5 US-1.1–1.3, 7 Phase 1, 10 Q03–Q04

## Problem

The owner needs all available GPW Main Market and NewConnect history retained locally from each market's beginning, including later-delisted shares, daily prices/volume, corporate actions and historical index membership where a source supplies it. One provider may not cover every class or year. The archive must expose missing periods and rights restrictions rather than imply complete history.

## Agreed direction

- US-1.1: register credentials locally, import history with quota-aware resume and durable checkpoints; on error completed batches remain intact.
- US-1.2: show acquired ranges and import problems by market, instrument, class, source and date; when membership is absent, show that limitation.
- US-1.3: retain revisions, keep earlier snapshots, mark dependent results stale; identical imports change nothing and malformed revisions are quarantined.
- Capability ladder: new app Market archive module, 10 provisional atomic commits in §4/`app-spec-notes/commit-plan.md`. No existing platform feature is claimed; OpenMercato is the method only. External source account/retention rights are an acceptance gate.

## Resolved unknowns

| Question | Answer from App Spec |
|---|---|
| User and surface | One local `owner`; browser Data coverage page; no portal or multi-user account. |
| Owned entities | Instrument, InstrumentIdentity, CorporateAction, IndexMembership, DailyBar, DataSeries, Observation, DataSnapshot and CoverageReport, with typed fields/invariants in §1.4. |
| Archive scope | Full available Main Market and NewConnect history; include later-delisted shares. First barometer consumes only a subset. |
| Coverage rule | Never label an import complete merely because a provider returned data. Report desired, provider-available and acquired ranges/gaps. |
| Phase acceptance | §7 Phase 1: resumable local history, revisions and a report covering retained source identities and acquired ranges. |
| External gate | Verify historical depth, entitlements and local retention rights. EODHD is first source to check; add/replace sources for documented gaps. |

## Non-goals

- No score calculation, ETF backtest, brokerage orders or public data service in this feature.
- No fabricated index membership or silent backfill for absent vendor history.

## Affected areas (if known)

- New Market archive module; PostgreSQL canonical market history and metadata plus checksummed original provider-response files under the accepted [technology decision](../research/decisions/2026-11-04-platform-technology.md).
- Data coverage page at `/data`; provider adapters at the archive boundary.
- Provider access and licensing are external dependencies, not assumed capabilities.
