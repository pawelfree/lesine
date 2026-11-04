# Lesine — product brief

- Date: 2026-11-04
- Mode: own; Owner: product owner (requester); Pass: full
- Evidence basis: owner choices, a data-source proposal, and the owner-provided excerpt of Albert Rokicki's article in this conversation. These establish intent, not predictive performance; no independent backtest or observed user problem is available.
- Current delivery state: the App Spec and four feature specs are written; the GPW archive spec has a `go` pre-implementation audit. Provider access and rights remain a real-data acceptance gate.
- Sources: conversation on 2026-11-04 (including the owner-provided article excerpt and signal table); `/Users/paweldudek/Downloads/barometro_gieldowy_pw_fonti_dati.md`; `.ai/specs/research/decisions/D03-signal-bands.md`; [FRED API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html); [EODHD commodities API](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta)

## Decision summary

The owner wants a personal platform for testing investment hypotheses and, eventually, multiple indicators. Start with one original barometer for the broad Polish stock market. After each GPW session it will calculate a 0–100 score, show a posture and suggested equity allocation from D03, and apply a signal no earlier than the next session (D01–D05). The score is not a calibrated probability. The v0 formula and WIG/ETF test protocols are defined in the App Spec and feature specs; provider bindings and historical coverage still require evidence. The first test compares daily signals with fixed market exposure, reporting drawdown, return and turnover (D06). The owner's pasted article reports 2013 results for its author's indicator; they do not validate this new one.

## Vision

- Personal research platform to compare end-of-session indicators and test long-term investment hypotheses. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Target group and stakeholders

- Customer and user: requester for the first version; no external customer named. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Decider: product owner (requester); providers constrain data availability and use.

## Problems, with evidence

- A market-wide warning is desired, but no observed failure in the current investing workflow or measured cost has been supplied. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Product and how it stands out

- One original barometer first; more indicators and historical comparisons later. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Current technical direction: source adapters → PostgreSQL market history and provenance → versioned DSL features and barometer → historical validation. The accepted [technology decision](research/decisions/2026-11-04-platform-technology.md) defines Angular, NestJS, TypeScript worker and local Docker Compose. EODHD is the first source to verify; FRED and U.S. Treasury bindings remain subject to source checks.
- Differentiation and competitor comparison: deferred; no product benchmark checked.

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

## Goals and success criteria

- First test: compare drawdowns and returns of D03's allocation scheme against fixed WIG exposure. The owner accepted drawdown reduction as a first question to test, not a permanent optimization goal; the simulation protocol is now specified in the WIG and ETF feature specs. `[DOCUMENT]` conversation on 2026-11-04 and App Spec.
- Historical period, WIG/ETF test types, execution timing, costs and baseline are specified in the App Spec and feature specs. The owner will decide whether results justify further work after seeing the first valid test (Q02).

## Scope

- **Now:** define one Polish-equity score, data pipeline, historical test and D03 posture output after each session. Formula and benefit are unproven.
- **Later:** more end-of-session indicators and hypothesis tests; additional data if justified (D01).
- **Not doing:** N01–N02.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Score | Original 0–100 output, not a calibrated probability. | Product owner | User |
| Posture | Risk stance and suggested equity allocation from D03. | Product owner | User |
| Indicator | End-of-session calculation from dated inputs. | Product owner | User |

## Key flows

- Current workflow: unknown.
- Data flow: ingest verified market and macro series → retain source revisions, observation dates and availability evidence → evaluate the versioned v0 definition → publish the score and D03 posture → run the versioned WIG and ETF tests. Exact data bindings remain an evidence gate.
- Owner flow: inspect score, source inputs and D03 posture after GPW close → apply a signal no earlier than the next session → compare saved daily simulations and their limitations.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Backtests use only data available at each decision time; retain raw values, frequency and publication time. | Data, tests | `[DOCUMENT]` supplied proposal §4; owner chose validation | active | Before first test | Owner-approved superseding row | Product owner | none |
| R02 | Calculate every indicator after GPW close; first possible action is the next session. | Indicators | `[DOCUMENT]` owner, conversation | active | Before spec | Owner-approved superseding row | Product owner | none |
| R03 | Call 0–100 output a score until probability calibration is shown. | Display | `[DOCUMENT]` owner, conversation | active | After calibration study | Owner-approved superseding row | Product owner | none |

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

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | The accepted v0 formula yields a useful score. `[ASSUMPTION]` no historical validation yet. | high | None | Revise or abandon indicator. | Verify source data and timestamps; simulate the fixed formula with costs and a later untouched test period against fixed exposure. | Product owner | After first valid test | untested |
| A02 | Required source inputs support the 08:30 cutoff. `[ASSUMPTION]` source bindings unverified. | high | [EODHD docs](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta) describe monthly metals data. | Change source binding or block activation. | Verify symbols, frequencies, release lag, revisions, rights and access. | Product owner | Before indicator activation | untested |

## Kill criteria

No numeric performance threshold is predeclared. The first valid WIG and ETF reports show return, drawdown, turnover and limitations; the owner decides whether to revise or continue the hypothesis after reviewing them.

## Hypotheses to test

No synthetic walkthrough run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Which predeclared formula and inputs produce the score without leakage? | Resolved in App Spec and daily-barometer spec; exact provider bindings remain Q03. | Owner and researcher | closed 2026-11-04 |
| Q02 | Do the first validated WIG and ETF results justify continuing or revising the hypothesis? | No: decide after the first valid reports; protocol is specified. | Product owner | open after validation |
| Q03 | Which exact source series, frequencies, publication timestamps, historical depth and rights are available for required v0 inputs? | Yes: source activation and data-dependent acceptance. | Provider and researcher | open |
| Q04 | What are “speculative positions” in D03's two defensive bands? | Resolved for v1: show posture text; no holdings tagging or automatic closing. | Product owner | closed 2026-11-04 |
| Q05 | Which posture owns a score exactly on each shared band boundary? | Resolved: higher band; 75 stays in 70–75. | Product owner | closed 2026-11-04 |

## Definition of Ready addendum (own)

Direction, market, bands, cadence, v0 method and test protocols are confirmed in the App Spec. Provider feasibility and measured investment benefit remain open. The archive specification is ready for implementation with its source-rights gate; no positive performance claim is implied.

## Collection plan

### What real investing decision should the barometer improve?

- Helps interpret eventual investment value; it does not block the archive implementation. The owner can later describe a recent decision, current information and consequence.
- Template: `.ai/specs/research/templates/interview-note.md`.

### Can the feeds supply point-in-time inputs at GPW close?

- Blocks indicator activation and real-data archive acceptance. Researcher checks entitlement, frequency, release timing, revisions and history before source bindings are approved.
- Template: `.ai/specs/research/templates/data-request.md`.

### How should long-term signals be evaluated?

- The simulation protocol is specified. The first verdict awaits valid WIG and ETF results; the owner then decides whether the hypothesis merits further work.
- Template: `.ai/specs/research/templates/decision-record.md`.
