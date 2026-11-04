# Lesine — product brief

- Date: 2026-11-04
- Mode: own; Owner: product owner (requester); Pass: full
- Evidence basis: owner choices, including the explicit statement that no prior real-use case exists, a data-source proposal, and the owner-provided excerpt of Albert Rokicki's article. This is an exploratory build from an idea; no observed investing-workflow failure or independent backtest is available.
- Current delivery state: the local Angular/NestJS/PostgreSQL shell exists and four feature specs are written. Import, barometer and validation mechanisms remain to be implemented. Provider access and rights remain real-data acceptance gates; limited development data do not change the full-history archive target.
- Sources: conversation on 2026-11-04 (including the owner's no-prior-case answer, free-tier staging decision, article excerpt and signal table); `README.md`; `/Users/paweldudek/Downloads/barometro_gieldowy_pw_fonti_dati.md`; `.ai/specs/research/decisions/D03-signal-bands.md`; [EODHD EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes); [EODHD plans](https://eodhd.com/help/plans); [EODHD limits](https://eodhd.com/financial-apis/api-limits); [FRED API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html)

## Decision summary

The owner is building a personal research platform from an idea, without a prior case of an investing decision impaired by missing data. Implement the quota-aware GPW EOD importer first, using the one-year range available on EODHD Free for development; then implement the barometer and historical-validation mechanisms. The same importer must be able to acquire the remaining available GPW history when a suitable paid account or other authorized source is available (D07). Normal sync fetches missing ranges, while bounded rechecks can discover corrections (R04). A year of data is enough to build and exercise mechanisms, but insufficient for a full v0 score history or a credible long-period validation under the accepted lookbacks. The intended product still starts with one original broad-market score and D03 posture after each session; source bindings, historical coverage and predictive value remain unproven. The first WIG/ETF comparison will report drawdown, return and turnover without calling the score a probability (D01–D06).

## Vision

- Personal research platform to compare end-of-session indicators and test long-term investment hypotheses. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Target group and stakeholders

- Customer and user: requester for the first version; no external customer named. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Decider: product owner (requester); providers constrain data availability and use.

## Problems, with evidence

- The owner explicitly reports no prior real-use case: this is a new personal research idea, not a remedy for an observed investing-workflow failure or measured loss. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Product and how it stands out

- One original barometer first; more indicators and historical comparisons later. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Current technical direction: source adapters → PostgreSQL market history and provenance → versioned DSL features and barometer → historical validation. The accepted [technology decision](research/decisions/2026-11-04-platform-technology.md) defines Angular, NestJS, TypeScript worker and local Docker Compose. EODHD Free is the first import-development source to verify; its documented EOD access is one year and 20 API calls per day, with endpoint-specific costs and a separate minute limit. Exact GPW coverage and other endpoint entitlements still need an account sample. `[DOCUMENT]` [EODHD EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [plans](https://eodhd.com/help/plans), [limits](https://eodhd.com/financial-apis/api-limits), checked 2026-11-04.
- Differentiation and competitor comparison: deferred; no product benchmark checked.

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

## Goals and success criteria

- First test: compare drawdowns and returns of D03's allocation scheme against fixed WIG exposure. The owner accepted drawdown reduction as a first question to test, not a permanent optimization goal; the simulation protocol is now specified in the WIG and ETF feature specs. `[DOCUMENT]` conversation on 2026-11-04 and App Spec.
- First implementation step: show which EOD ranges are stored locally, resume interrupted work, fetch missing ranges within the source budget, and label the one-year/free-tier boundary honestly. Use this limited range to build and exercise later calculation and test mechanisms without claiming a validated investment result. `[DOCUMENT]` owner, conversation on 2026-11-04; D07 and R04.
- Historical period, WIG/ETF test types, execution timing, costs and baseline are specified in the App Spec and feature specs. The owner will decide whether results justify further work after seeing the first valid test (Q02).

## Scope

- **Now:** implement the local, quota-aware importer and coverage view first, exercising them with the EODHD Free one-year range if a GPW account sample confirms access. Then implement the declarative barometer and WIG/ETF validation mechanisms. The archive still targets full available Main Market/NewConnect history; a paid account or other authorized source can supply the remaining data when available. Do not claim complete coverage or validated investment results from the development sample.
- **Later:** more end-of-session indicators and hypothesis tests (D01). Activation and substantive historical conclusions depend on sufficient point-in-time inputs and source rights, not on whether the mechanisms have been coded.
- **Not doing:** N01–N02.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Score | Original 0–100 output, not a calibrated probability. | Product owner | User |
| Posture | Risk stance and suggested equity allocation from D03. | Product owner | User |
| Indicator | End-of-session calculation from dated inputs. | Product owner | User |

## Key flows

- Current workflow: no prior real case was supplied; the owner is starting from an idea.
- Import flow: compare requested scope with locally committed EOD ranges → schedule only missing work within the provider budget → retain raw responses and revisions → show acquired and unavailable ranges. The same flow applies after a plan upgrade; bounded, explicit rechecks may detect provider corrections. The scheduler mechanism and cadence are engineering choices.
- Calculation/test flow: implement evaluation of the versioned v0 definition and the WIG/ETF protocols against available fixtures or limited data; publish a score or validated result only when sufficient, correctly timed source data exist. Exact bindings remain an evidence gate.
- Owner flow: inspect score, source inputs and D03 posture after GPW close → apply a signal no earlier than the next session → compare saved daily simulations and their limitations.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Backtests use only data available at each decision time; retain raw values, frequency and publication time. | Data, tests | `[DOCUMENT]` supplied proposal §4; owner chose validation | active | Before first test | Owner-approved superseding row | Product owner | none |
| R02 | Calculate every indicator after GPW close; first possible action is the next session. | Indicators | `[DOCUMENT]` owner, conversation | active | Before spec | Owner-approved superseding row | Product owner | none |
| R03 | Call 0–100 output a score until probability calibration is shown. | Display | `[DOCUMENT]` owner, conversation | active | After calibration study | Owner-approved superseding row | Product owner | none |
| R04 | An importer must track the applicable source budget, persist completed ranges and normally request only missing/new ranges; bounded documented rechecks may fetch existing ranges to detect corrections. Quota exhaustion pauses work for the applicable reset/retry time and never marks partial data complete. | GPW EOD import | `[DOCUMENT]` owner, conversation on 2026-11-04; [EODHD limits](https://eodhd.com/financial-apis/api-limits) | active | Before first real import | Owner-approved superseding row | Product owner | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Automated trade execution now | Only signals were requested. | Product owner | active | After first validation | Owner-approved superseding row | `[DOCUMENT]` conversation and App Spec | none |
| N02 | Faithful copy of PW Barometer | Formula unavailable; original score chosen. | Product owner | active | Before spec | Owner-approved superseding row | `[DOCUMENT]` supplied proposal §6; conversation | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-11-04 | One barometer now; later multiple indicators and hypothesis tests. | Owner's sequence. | Product owner | active | After first test | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
| D02 | 2026-11-04 | Broad Polish equity market, not a stock. | WIG-based scope confirmed. | Product owner | active | Before spec | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
| D03 | 2026-11-04 | Original score and ten posture/allocation bands. | Formula unavailable; owner supplied bands. | Product owner | active | After validation | Owner-approved superseding row | `[DOCUMENT]` conversation; `.ai/specs/research/decisions/D03-signal-bands.md` | none |
| D04 | 2026-11-04 | Calculate after close; signal applies next session or later. | Owner says post-close timing is sufficient for their long-term use; this is a preference, not a tested performance claim. | Product owner | active | Before spec | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
| D05 | 2026-11-04 | Score is not labeled a probability. | Calibration untested. | Product owner | active | After calibration | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
| D06 | 2026-11-04 | Test drawdown reduction first, also report returns. | First experiment, not permanent objective. | Product owner | active | After first test | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
| D07 | 2026-11-04 | Implement import first with the EODHD Free one-year range as development data, then implement calculation and validation mechanisms. The same importer can later acquire the remaining available GPW history under a suitable paid plan or other authorized source. Limited data do not change the full-history target or require changing the existing feature specs. | The owner says a full history is unnecessary for coding the mechanisms, while local full-history acquisition remains the goal. | Product owner | active | After first source sample | Owner-approved superseding row | `[DOCUMENT]` owner, conversation on 2026-11-04; [decision record](research/decisions/D07-free-tier-import-stage.md) | none; clarifies implementation order under D01 |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | The accepted v0 formula yields a useful score. `[ASSUMPTION]` no historical validation yet. | high | None | Revise or abandon indicator. | Verify source data and timestamps; simulate the fixed formula with costs and a later untouched test period against fixed exposure. | Product owner | After first valid test | untested |
| A02 | Required source inputs support the 08:30 cutoff. `[ASSUMPTION]` source bindings unverified. | high | [EODHD docs](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta) describe monthly metals data. | Change source binding or block activation. | Verify symbols, frequencies, release lag, revisions, rights and access. | Product owner | Before indicator activation | untested |
| A03 | EODHD Free exposes enough GPW EOD symbols and dates to exercise the first-stage importer. `[ASSUMPTION]` no account sample yet. | medium | [EODHD EOD API](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes) documents a one-year window for any ticker, but not this account's actual GPW sample. | Use fixtures or another authorized source; do not claim a real-data stage complete. | Obtain a free key and record a bounded GPW sample, endpoint access and remaining budget. | Product owner | Before first-stage real-data acceptance | untested |

## Kill criteria

No numeric performance threshold is predeclared. The first valid WIG and ETF reports show return, drawdown, turnover and limitations; the owner decides whether to revise or continue the hypothesis after reviewing them.

## Hypotheses to test

No synthetic walkthrough run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Which predeclared formula and inputs produce the score without leakage? | Resolved in App Spec and daily-barometer spec; exact provider bindings remain Q03. | Owner and researcher | closed 2026-11-04 |
| Q02 | Do the first validated WIG and ETF results justify continuing or revising the hypothesis? | No: decide after the first valid reports; protocol is specified. | Product owner | open after validation |
| Q03 | Which exact source series, frequencies, publication timestamps, historical depth and rights are available for required v0 inputs and the full GPW archive? | Blocks claims of complete real-data coverage and validated barometer results, not implementation of the import, calculation or test mechanisms. | Provider and researcher | open; source sample pending |
| Q04 | What are “speculative positions” in D03's two defensive bands? | Resolved for v1: show posture text; no holdings tagging or automatic closing. | Product owner | closed 2026-11-04 |
| Q05 | Which posture owns a score exactly on each shared band boundary? | Resolved: higher band; 75 stays in 70–75. | Product owner | closed 2026-11-04 |
| Q06 | Does the owner's Free account expose the GPW EOD sample needed for the first stage, within its actual entitlement and budget? | Blocks first-stage acceptance on real data, not backlog drafting or fixture-based implementation. | Provider and researcher | open; no account sample yet |

## Definition of Ready addendum (own)

The owner explicitly chose an exploratory build without a prior real-use case. This confirms intent and scope, not an observed problem or validated benefit. The existing specs remain the implementation authority: importer first, then other mechanisms. A one-year source sample supports engineering work but cannot establish full-history coverage or long-period investment results. Source access is required for real-data acceptance; Q03 does not block coding the mechanisms. A strict backlog readiness gate may still require problem evidence or a documented process exception; do not present owner intent as independent validation.

## Collection plan

### Can EODHD Free supply a bounded GPW EOD sample for the first stage?

- Blocks real-data acceptance of the first-stage importer, not fixture-based engineering. Researcher checks actual GPW symbols, date range, endpoint access, request cost and remaining allowance with the owner's free key; do not presume delisted/NewConnect/action access.
- Template: `.ai/specs/research/templates/data-request.md`.

### Which licensed sources cover full GPW history and the v0 inputs?

- Blocks full-history acceptance and claims of validated barometer/test results, not implementation of those mechanisms. Researcher checks actual depth, rights, frequency, release timing and revisions before those results can be declared complete.
- Template: `.ai/specs/research/templates/data-request.md`.
