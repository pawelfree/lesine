# Lesine — product brief

- Date: 2026-11-04
- Mode: own; Owner: product owner (requester); Pass: full
- Evidence basis: owner choices, a data-source proposal, and the owner-provided excerpt of Albert Rokicki's article in this conversation. These establish intent, not predictive performance; no independent backtest or observed user problem is available.
- Coverage: 20 claims — 18 sourced (interview 0, data 0, document 18, product 0, benchmark 0), 0 synthetic, 2 assumed; 3 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: not yet; ready for: data feasibility and experiment design, not implementation planning
- Sources: conversation on 2026-11-04 (including the owner-provided article excerpt and signal table); `/Users/paweldudek/Downloads/barometro_gieldowy_pw_fonti_dati.md`; `.ai/specs/research/decisions/D03-signal-bands.md`; [FRED API](https://fred.stlouisfed.org/docs/api/fred/series_observations.html); [EODHD commodities API](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta)

## Decision summary

The owner wants a personal platform for testing investment hypotheses and, eventually, multiple indicators. Start with one original barometer for the broad Polish stock market. After each GPW session it will calculate a 0–100 score, show a posture and suggested equity allocation from D03, and apply a signal no earlier than the next session (D01–D05). The score is not a calibrated probability. The first proposed test simulates daily signals over history, measuring drawdown, return and turnover against fixed market exposure (D06). Formula, data feasibility, benchmark implementation and success threshold remain open (Q01–Q03). The owner's pasted article reports 2013 results for its author's indicator; they do not validate this new one.

## Vision

- Personal research platform to compare end-of-session indicators and test long-term investment hypotheses. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Target group and stakeholders

- Customer and user: requester for the first version; no external customer named. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Decider: product owner (requester); providers constrain data availability and use.

## Problems, with evidence

- A market-wide warning is desired, but no observed failure in the current investing workflow or measured cost has been supplied. `[DOCUMENT]` owner, conversation on 2026-11-04.

## Product and how it stands out

- One original barometer first; more indicators and historical comparisons later. `[DOCUMENT]` owner, conversation on 2026-11-04.
- Proposed processing path from the supplied diagram: EODHD as primary market-data source, plus FRED and U.S. Treasury connectors → historical time-series store → feature engineering → composite market-risk barometer and regime-change detection. This is a design proposal to validate, not an adopted technical decision. `[DOCUMENT]` supplied data proposal §4.
- Differentiation and competitor comparison: deferred; no product benchmark checked.

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

## Goals and success criteria

- First test: compare drawdowns and returns of D03's allocation scheme against fixed WIG exposure. The owner accepted drawdown reduction as a first question to test, not a permanent optimization goal; the daily simulation protocol remains a proposal. `[DOCUMENT]` conversation on 2026-11-04.
- Period, tradable market proxy, costs, baseline allocation and continuation threshold: open (Q02).

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
- Proposed pipeline: ingest market and macro data from EODHD, FRED and U.S. Treasury → retain raw observations with frequency and publication timestamps → calculate candidate features (5/20/60-session changes, trends, spreads and liquidity) → combine them into the market-risk score and detect regime changes. `[DOCUMENT]` supplied data proposal §4.
- Proposed use: calculate after GPW close → show score and D03 posture → apply allocation changes no earlier than next session → simulate the portfolio day by day. Showing raw inputs is still a proposal.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | Backtests use only data available at each decision time; retain raw values, frequency and publication time. | Data, tests | `[DOCUMENT]` supplied proposal §4; owner chose validation | active | Before first test | Owner-approved superseding row | Product owner | none |
| R02 | Calculate every indicator after GPW close; first possible action is the next session. | Indicators | `[DOCUMENT]` owner, conversation | active | Before spec | Owner-approved superseding row | Product owner | none |
| R03 | Call 0–100 output a score until probability calibration is shown. | Display | `[DOCUMENT]` owner, conversation | active | After calibration study | Owner-approved superseding row | Product owner | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Automated trade execution now | Only signals were requested. | Product owner | proposal | Before spec | Owner-approved superseding row | `[DOCUMENT]` conversation | none |
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
| A01 | Candidate series and the proposed feature pipeline yield a useful score. `[ASSUMPTION]` supplied proposal, no tested formula. | high | None | Revise or abandon indicator. | Verify data and timestamps; predefine formula; simulate daily with costs and a later untouched test period against fixed exposure. | Product owner | Before implementation | untested |
| A02 | Inputs support end-of-session calculation. `[ASSUMPTION]` supplied proposal §5. | high | [EODHD docs](https://eodhd.com/financial-apis/commodities-api-historical-prices-for-oil-gas-metals-agriculture-beta) say metals are typically monthly. | Change series or cadence. | Verify symbols, frequencies, lag, revisions and access. | Product owner | Before spec | untested |

## Kill criteria

Pending Q02's benchmark, costs and stop rule.

## Hypotheses to test

No synthetic walkthrough run.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | Which predeclared formula and inputs produce the score without leakage? | Yes: indicator spec. | Owner and researcher | open |
| Q02 | Which historical period, tradable market proxy, baseline allocation, costs and result justify continuing? | Yes: validation verdict. | Owner and researcher | open |
| Q03 | Which exact series, frequencies and publication timestamps are available from EODHD, FRED and U.S. Treasury for the proposed 5/20/60-session features? | Yes: data design. | Provider and researcher | open |
| Q04 | What are “speculative positions” in D03's two defensive bands? | Yes: those signal actions. | Product owner | open |
| Q05 | Which posture owns a score exactly on each shared band boundary? | Resolved: higher band; 75 stays in 70–75. | Product owner | closed 2026-11-04 |

## Definition of Ready addendum (own)

Direction, market, bands and cadence are confirmed. Method, data feasibility and evaluation rule are open; an observed problem and measured benefit are absent. Ready for data research and experiment design, not a delivery backlog.

## Collection plan

### What real investing decision should the barometer improve?

- Blocks implementation readiness, not the data feasibility study. The owner can later describe a recent decision, current information and consequence.
- Template: `.ai/specs/research/templates/interview-note.md`.

### Can the feeds supply point-in-time inputs at GPW close?

- Blocks series selection. Researcher checks entitlement, frequency, release timing, revisions and history; owner reviews before spec.
- Template: `.ai/specs/research/templates/data-request.md`.

### How should long-term signals be evaluated?

- Blocks first verdict. Owner and researcher predefine daily simulation rules, market proxy, benchmark, costs, untouched test period, metrics and stop rule before seeing test results.
- Template: `.ai/specs/research/templates/decision-record.md`.
