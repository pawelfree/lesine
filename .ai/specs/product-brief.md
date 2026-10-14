# Lesine — product brief

- Date: 2026-10-14
- Mode: own; Owner: product owner (self); Pass: full
- Evidence basis: one direct account from the product owner (this session) about a real, already-available data source (a daily PDF report from one external investment advisor), plus one internal vision document (`preliminary_spec.md`) describing a much larger, unvalidated platform idea. No evidence yet from anyone besides the product owner. The most consequential untested belief: that the advisor's portfolio history contains enough signal to reconstruct his decision rules (A01).
- Coverage: 23 claims — 17 sourced (interview 13, data 0, document 4, product 0, benchmark 0), 0 synthetic, 6 assumed; 3 entries on the collection plan
- Synthetic hypotheses outside Coverage: 0
- Definition of Ready signed by: not yet signed — ready for a named experiment (extraction, A03, and performance tracking now that D05 picked WIG20/EODHD); not ready for full implementation planning until Q01 is resolved and the owner confirms his own PDF archive depth (Q02)
- Sources: `.ai/specs/research/preliminary_spec.md`, `.ai/specs/research/interviews/2026-10-14-product-owner.md`, this session (2026-10-14)

## Decision summary

The product owner wants to plan the full platform described in `preliminary_spec.md` but start with a small, real MVP rather than its own 14-item "MVP" list. The owner is the only user: he receives a daily PDF report from one external investment advisor (portfolio, decisions, a 7-point sentiment rating per market, a "3 companies for 3 months" sub-portfolio, and a weekly "growth stocks of the week" list) that nothing today tracks systematically (see Problems, Target group).

The agreed Now (D02) is to build the ingestion and tracking pipeline for that one advisor's data, instead of the original document's generic reference-strategy backtesting engine — because the advisor data is real material on hand, while the reference strategies are still hypothetical (see Scope, D02, D03).

The main open uncertainty is whether the advisor's holdings history actually contains enough signal to reconstruct his decision rules (A01) — the owner explicitly wants this deferred past the MVP, with a kill criterion if it doesn't converge after "a longer period" (not yet quantified, Q01). A second, more immediate risk is whether the daily PDFs can be parsed reliably enough to trust for performance tracking (A03) — this isn't yet tested. The benchmark/price-source gap the skeptic review flagged is now resolved: WIG20 as benchmark, EODHD for GPW price history (D05).

Next: build and validate PDF extraction against a handful of real reports, confirm how much of the owner's own PDF archive actually exists beyond the advisor's 2-year track record (Q02), and settle Q01, before expanding to backlog items.

## Vision

A personal investment research tool that starts by turning one external advisor's daily PDF reports into tracked, structured data the owner can analyze over time; the long-term direction the owner wants to keep in view (not yet committed, see D03) is the much larger "Investment Intelligence Platform" in `preliminary_spec.md` — a system that would eventually generate and test its own investment hypotheses, run backtests, build model portfolios, and monitor strategy performance, with a human-in-the-loop approval model and a deterministic investment core. `[DOCUMENT]` `.ai/specs/research/preliminary_spec.md`

## Target group and stakeholders

- Customer (pays): the product owner himself. `[INTERVIEW]` this session
- User (uses): the product owner himself — no other users in the MVP (D01). `[INTERVIEW]` this session
- Stakeholders (decides, blocks, operates): none beyond the product owner at this stage.
- Decider for scope decisions: the product owner.

## Problems, with evidence

- The product owner receives a daily PDF analysis report from one external investment advisor containing the advisor's full portfolio composition, his investment decisions and commentary, a 7-point sentiment rating per market, a separate "3 companies for 3 months" model portfolio, and a weekly "growth stocks of the week" list — today read manually, with no system tracking it over time. `[INTERVIEW]` `.ai/specs/research/interviews/2026-10-14-product-owner.md`
- He wants to measure the advisor's actual effectiveness against a benchmark, and separately, to reconstruct the decision rules the advisor appears to follow from the portfolio history — neither has been attempted yet, so there is no evidence either is achievable. `[INTERVIEW]` `.ai/specs/research/interviews/2026-10-14-product-owner.md`
- He suspects the advisor's sentiment rating reflects more than stock-market data alone — likely macro factors that would need to be looked up separately. This is his own untested suspicion, not an observed fact. `[ASSUMPTION]` origin: product owner, this session; see A02.

## Product and how it stands out

- What it is: a pipeline that extracts structured data from the advisor's daily PDFs and tracks his portfolios' performance and sentiment calls over time (see Scope). `[INTERVIEW]` this session
- What makes it different: not sourced — no comparable tool was checked in this session. Deferred; not consequential to the current decision.

| reference | what it does well | where it falls short for our users | checked on | link |
|---|---|---|---|---|

Deferred: no benchmark product was identified or checked this session.

## Goals and success criteria

- Business goal: have a reliable, structured record of one external advisor's calls and performance, as the foundation for later strategy reconstruction and for adding more advisors. Owner: product owner. (D02)
- User outcome: the owner can see, for any past date, what the advisor's portfolio and sentiment calls were and how that portfolio has performed against a benchmark, without reading PDFs by hand. `[INTERVIEW]` this session
- Primary metric, baseline today, threshold, date: not set. The owner did not supply a numeric target or date; this stays open rather than inventing one.
- What must not get worse: not applicable yet — no existing system or users to protect.

## Scope

- **Now:** ingest the advisor's daily PDF reports and extract, as structured data: portfolio composition and weights, investment decisions and commentary text, the 7-point sentiment rating per market, the "3 companies for 3 months" sub-portfolio, and the weekly "growth stocks of the week" list. Track the main portfolio's and the "3 companies for 3 months" portfolio's performance over time against a benchmark. Single user (D01). No rule/strategy reconstruction, no own reference strategies, no second advisor, no real trade execution. (D02, D04; N01, N02, N03)
- **Later:** reconstruct the advisor's decision rules from the extracted history, subject to the kill criterion below (D04); add the team's own reference strategies and a general backtesting engine per the original document (D03); correlate the sentiment ratings with macro-economic data (A02); add further advisors in the same structured format, as the owner already plans (D03); evaluate whether the "myfund" app (CSV export; API or scraping availability unconfirmed) offers other useful supplementary data — unconfirmed, not part of Now (D05). `[ASSUMPTION]` origin: product owner, this session
- **Not doing:** see Non-goals.

## Domain glossary

| Term | Meaning | Owned by | Visible to |
|---|---|---|---|
| Sentiment rating | The advisor's own 7-point scale per market: Very Negative, Negative, Moderately Negative, Neutral, Moderately Positive, Positive, Very Positive. | External advisor (source data) | Product owner |
| "3 companies for 3 months" | A separate, smaller model portfolio the advisor runs and reports alongside his main portfolio. | External advisor (source data) | Product owner |
| "Growth stocks of the week" | A weekly list of growth-stock picks included in the advisor's PDF report. | External advisor (source data) | Product owner |

## Key flows

- Current state: the owner reads each day's PDF manually; nothing aggregates the portfolio, decisions, sentiment, or the two sub-lists over time. `[INTERVIEW]` this session
- Future state (Now): a daily PDF is ingested and parsed into structured records (portfolio, decisions/comments, sentiment per market, the two sub-portfolios); portfolio performance is computed and compared to a benchmark as new data arrives. `[ASSUMPTION]` — the exact ingestion trigger (manual upload vs. automated fetch) and benchmark choice were not decided this session; see Open questions.

## Business rules

| Id | Rule | Applies to | Source | Status | Review by | Required path to change | Owner | Supersedes |
|---|---|---|---|---|---|---|---|---|
| R01 | The system never places or executes real trades; it only analyzes, tracks, and simulates. | All phases, including the MVP | `[DOCUMENT]` `.ai/specs/research/preliminary_spec.md` §24 (also §1.2) | active | unknown — revisit if real execution is ever considered | product owner | product owner | none |

## Non-goals

| Id | We are not building | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|
| N01 | Real trade execution at a broker | Out of scope for the whole product direction today (R01) | product owner | active | unknown | product owner | `[DOCUMENT]` `.ai/specs/research/preliminary_spec.md` | none |
| N02 | Multi-user accounts, permissions, or client-facing features | MVP is single-user (D01) | product owner | active | revisit if the owner decides to share the system | product owner | `[INTERVIEW]` this session | none |
| N03 | Ingesting a second advisor's data in the MVP | Explicitly planned for later, not now (D02, D03) | product owner | proposal | after the single-advisor pipeline is validated | product owner | `[INTERVIEW]` this session | none |

## Decisions

| Id | Date | Decision | Why | Owner | Status | Review by | Required path to change | Source | Supersedes |
|---|---|---|---|---|---|---|---|---|---|
| D01 | 2026-10-14 | Single-user scope for the MVP | The product owner is the only user; no accounts/permissions needed yet | product owner | active | revisit if sharing with others is considered | product owner | `[INTERVIEW]` `.ai/specs/research/decisions/D01-single-user-scope.md` | none |
| D02 | 2026-10-14 | MVP centers on the one external advisor's data, not generic reference strategies | Real available data beats a hypothetical strategy; accepted agent recommendation over the document's original 14-item MVP | product owner | active | revisit if PDF extraction proves unreliable (A03) | product owner | `[INTERVIEW]` `.ai/specs/research/decisions/D02-mvp-centers-on-one-advisor.md` | none |
| D03 | 2026-10-14 | The full Investment Intelligence Platform vision stays a later-phase direction, not committed scope | Keeps the big picture visible without committing to unvalidated scope | product owner | active | re-evaluate after each MVP phase | product owner | `[DOCUMENT]` `.ai/specs/research/decisions/D03-full-platform-vision-deferred.md` | none |
| D04 | 2026-10-14 | Strategy reconstruction and own-strategy backtesting wait until after the MVP | Both depend on the MVP's extraction/tracking pipeline existing first | product owner | active | kill-criterion review once reconstruction is attempted | product owner | `[INTERVIEW]` `.ai/specs/research/decisions/D04-strategy-reconstruction-deferred.md` | none |
| D05 | 2026-10-14 | Benchmark is WIG20; GPW price history comes from EODHD | Resolves Q03, the missing dependency the skeptic review flagged for completing the performance-tracking half of Now | product owner | active | revisit if EODHD's GPW coverage or WIG20 data proves incomplete | product owner | `[INTERVIEW]` `.ai/specs/research/decisions/D05-benchmark-and-price-source.md` | none |

## Riskiest assumptions

| Id | Assumption | Importance | Evidence today | If false | Smallest test | Owner | By when | Result |
|---|---|---|---|---|---|---|---|---|
| A01 | The advisor's portfolio/decision history contains enough signal to reconstruct his decision rules. | high | none — untested `[ASSUMPTION]` origin: product owner | Abandon the rule-reconstruction method per the owner's own kill criterion (D04) | After the MVP has accumulated a meaningful history, attempt a simple rule-fit and check whether it converges with the advisor's actual decisions | product owner | unknown — "a longer period" was not quantified (Q01) | untested |
| A02 | The advisor's sentiment rating depends on macro factors beyond market data, so market data alone won't explain it. | medium | none — the owner's own suspicion `[ASSUMPTION]` origin: product owner | Macro-data ingestion in a later phase could be simplified or skipped | Compare the logged sentiment series against simple market-only indicators first; only add macro lookup if the correlation is weak | product owner | later phase, date unknown | untested |
| A03 | The advisor's daily PDFs can be parsed reliably enough (portfolio, decisions, sentiment, the two sub-portfolios) to trust for tracking. | high — the whole MVP depends on this | none — untested `[ASSUMPTION]` | A manual data-entry fallback would be needed, reducing the pipeline's value | Run extraction against a sample of real recent PDFs and manually verify the output before relying on it | product owner | early in the build, date unknown | untested |

## Kill criteria

For the strategy-reconstruction effort specifically: if no reasonable agreement between the reconstructed rules and the advisor's actual decisions emerges after a longer evaluation period, abandon that method (D04). The exact duration was not set by the owner — see Q01. No kill criterion was stated for the MVP extraction-and-tracking work itself, or for the project as a whole; that gap is left open rather than invented.

## Hypotheses to test

None — no synthetic panel has run yet for this brief.

## Open questions

| Id | Question | Blocking | Who can answer | Status |
|---|---|---|---|---|
| Q01 | How long is "a longer period" for judging whether strategy reconstruction (A01) has failed? | no — only blocks evaluating D04's kill criterion, not building the MVP | product owner | open |
| Q02 | How far back does the owner's PDF archive go, if at all, versus starting data collection from today forward? | no — only affects how much historical performance can be shown immediately | product owner | partially resolved: the advisor has been issuing recommendations for at least 2 years, so a 2-year floor exists; whether the owner has personally saved every daily PDF for that whole period still needs the owner to check his own files |
| Q03 | Which benchmark, and what market-data/price source, will be used to price the advisor's holdings and compute performance against that benchmark? | yes — blocked completing the "Now" performance-tracking job | product owner | closed — WIG20 benchmark, EODHD for GPW price history (D05) |

## Definition of Ready addendum (own)

Problems and Target group are supported by the product owner's own direct account (`[INTERVIEW]`), which is sufficient under `own` mode since the team itself is the target user. The riskiest assumption (A01) and the foundational one (A03) remain untested; D04 already records that reconstruction work is accepted to proceed untested, with a kill criterion, which is a decision about risk, not evidence that it will work. The MVP's Now scope (extraction + tracking for one advisor) is ready for a named experiment: build and validate PDF extraction (A03) first. The performance-tracking half of Now now has a chosen benchmark and price source (WIG20, EODHD — D05), so it is ready to implement once extraction is validated. It is not yet ready for full implementation planning of later phases (reconstruction, macro correlation, multi-advisor) until A01/A02 have results and Q01/Q02 are answered.

## Collection plan

### How reliably can the daily PDFs be parsed into structured data?

- What decision or work needs it: validates A03, which the whole MVP depends on
- Who can answer it: product owner (supplies sample PDFs) plus a build-time technical spike
- How: run extraction against a handful of real recent PDFs and manually check the output
- Owner and by when: product owner / implementation team; unknown date
- Template: `.ai/specs/research/templates/data-request.md`

### How far back does the PDF archive go?

- What decision or work needs it: how much historical performance can be computed immediately (Q02)
- Who can answer it: product owner
- How: the owner checks what past daily PDFs he still has saved (the advisor's own track record runs at least 2 years, but that doesn't confirm the owner saved all of it)
- Owner and by when: product owner; unknown date
- Template: `.ai/specs/research/templates/data-request.md`

### Does "myfund" offer an API, a usable CSV export, or scrapeable data worth integrating?

- What decision or work needs it: whether to add "myfund" as a supplementary data source in a later phase (D05)
- Who can answer it: product owner (has access to the app)
- How: check myfund's documentation/API availability; if none, assess the CSV export's fields and whether scraping is worthwhile
- Owner and by when: product owner; unknown date
- Template: `.ai/specs/research/templates/data-request.md`
