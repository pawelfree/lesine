# App Spec: Lesine

> The App Spec is a business architecture document that sits above feature specs.
> It captures domain knowledge, validates cross-spec consistency, and ensures
> the app solves a real business problem using the platform correctly.
>
> This document is the SINGLE SOURCE OF TRUTH for what this app is, who it serves,
> and how it maps to the platform. Feature specs are generated from this document.
> If a spec contradicts this document, this document wins.
>
> Each section has a checklist with an owner. A section is done when all checks pass.

---

## 1. Business Context `PM`

**Document status:** Confirmed by the owner on 2026-11-04. Provider access and measured performance remain unverified implementation gates, explicitly marked below. Future feature specs must cite this document. On 2026-11-05 the owner removed historical index-constituent import from the current E02 archive issues; the longer-term product concept remains deferred until a source and separate task are chosen.

### 1.1 Business Model

Personal research platform for Polish-equity market indicators, beginning with one end-of-session barometer. The first user is the owner; there are no paying customers in the first version. Any later paid product would need a separate decision. Source: `.ai/specs/product-brief.md`.

**Flywheel:**
```
A reproducible daily result → historical comparison → revised indicator hypothesis → versioned candidate → another comparison. This is a research loop for one owner, not a commercial growth loop.
```

#### Checklist
- [x] First version is owner-funded personal research; no paying customer.
- [x] Personal research loop recorded; no commercial growth loop is assumed.

### 1.2 Business Goals

**Primary goal:** After each GPW session, the owner can see the barometer score, posture and suggested equity allocation, plus a chart of how those indications would have behaved historically. Source data are stored locally, with full available GPW market history as the acquisition target. The owner confirmed this as the first useful outcome. Predictive performance remains unverified; this App Spec defines the initial test protocol and marks provider evidence gates in §10.

**Secondary goal (reference app):** N/A. The owner uses the OpenMercato method, not the OpenMercato software platform.

**What is NOT important:** A faithful recreation of the proprietary PW formula is out of scope (N02). The owner confirmed that the first version does not submit brokerage orders; it presents analysis and historical results only.

#### Checklist
- [x] First user outcome defined: one daily result and one historical comparison view; performance thresholds remain open.
- [x] Scope exclusions: no PW formula replication or automated brokerage orders in the first version.

### 1.3 Ubiquitous Language

> DDD: one term = one meaning everywhere. This glossary IS the ubiquitous language.

| Term | Definition | Source of data | Period |
|------|-----------|----------------|--------|
| Market session | A GPW trading day whose close triggers one calculation. | GPW calendar, source to select | One session |
| Instrument | A listed share, ETF, index or other identified market item, with dated provider symbols. | Provider catalog and GPW universe | Listing lifetime |
| Market archive | Local record of provider-available GPW data and explicit coverage gaps for Main Market and NewConnect. | Imported source data | Full available history |
| Daily bar | Provider's dated open, high, low, close and volume for one instrument and session, retained with revisions. | Market provider | One session |
| Corporate action | Dated dividend or split affecting return/price interpretation. | Market provider | Event date |
| Index membership | Dated membership of an instrument in an index, with known-at time when available. | Provider or GPW source | Membership interval |
| Data series | A named market or macro observation stream with source and frequency. | Provider catalogue, pending access | Provider-defined |
| Observation | Value for a series and observation date, with time it became available. | EODHD/FRED/Treasury candidates | One dated value |
| Indicator definition | Declarative JSON/DSL document describing inputs, allowed transformations, aggregation and output, without indicator-specific executable code. | Owner-approved definition | From creation to retirement |
| Indicator version | Immutable, validated revision of an indicator definition, its input bindings and calculation semantics. | Owner-approved definition | Version lifetime |
| Indicator result | Score calculated for one GPW session from one definition/policy version and input snapshot. | Shared calculation engine | One session |
| Signal policy version | Immutable mapping from a score to posture and suggested allocation; D03 is the first policy. | Owner-approved policy | Version lifetime |
| Backtest protocol version | Immutable declarative JSON configuration for a test's instrument basket, weights, trading timing, costs, benchmark and evaluation period. | Owner-approved test setup | One or more saved runs |
| Score | Original 0–100 barometer output; not a probability. | Indicator version | One session |
| Posture | Label and suggested equity allocation selected by the confirmed ten-band table. | Decision D03 | One session |
| Suggested allocation | Percentage of equity exposure indicated by a posture, not a brokerage order or measured optimum. | Decision D03 | One session |
| Data snapshot | Identified set of source observations, revisions, and availability times used for one calculation or test. | Local history store | One calculation or test |
| Coverage report | Inventory of expected and actually acquired instruments, series, date ranges and gaps. | Import process | One import checkpoint |
| Backtest | Historical simulation using observations known or conservatively assumed available by each simulated decision; the report distinguishes verified timing from assumptions. | Versioned research protocol | Selected test span |
| Signal test | Theoretical historical comparison using WIG index changes to assess the barometer and allocation rule, without claiming actual execution. | Backtest protocol | Selected test span |
| Execution test | Historical simulation using a declared basket of tradable ETFs, its actual listed history and costs. The first basket contains WIG20TR, mWIG40TR and sWIG80TR ETFs. | Backtest protocol and ETF history | Selected test span |

#### Checklist
- [x] Every domain term defined once
- [x] Same word = same meaning across all specs and conversations
- [x] Source of data specified per term; period specified for time-windowed terms (metrics, KPIs) — N/A otherwise

### 1.4 Domain Model

> DDD: document the domain entities, rules, invariants, and value calculations specific to this app.
> Structure this section however the domain demands — there is no fixed format.
>
> Examples of what belongs here (depending on the domain):
> - Tier/level definitions with thresholds and governance rules
> - KPI formulas with anti-gaming rules
> - Business rules: permissions hierarchy, data ownership, cross-org visibility
> - Domain invariants: what must always be true
> - Value calculations: how scores, ratings, or statuses are derived
> - Entity field definitions with types, constraints, and relations

Entity model for the accepted v0 direction; provider bindings remain a feasibility gate:

| Entity | Field (type; multi; required at creation) | Ownership and invariant |
|---|---|---|
| Instrument | `id` (text; no; yes), `symbol` (text; no; yes), `market` (select; no; yes), `listed_from` (date; no; no), `listed_to` (date; no; no), `sector` (text; no; no) | Imported from a provider; retains delisted instruments. Symbol and sector history require dated records before use in point-in-time tests. |
| InstrumentIdentity | `instrument_id` (relation; no; yes), `provider` (select; no; yes), `provider_symbol` (text; no; yes), `valid_from` (date; no; yes), `valid_to` (date; no; no), `known_at` (datetime UTC; no; no) | System imports symbol history; one provider symbol identifies at most one instrument on a given date. Unknown `known_at` is disclosed in tests. |
| CorporateAction | `instrument_id` (relation; no; yes), `action_type` (select; no; yes), `ex_date` (date; no; yes), `value` (float; no; no), `currency` (text; no; no), `published_at` (datetime UTC; no; no) | Dividends and splits are preserved for adjusted historical returns. |
| IndexMembership | `index_id` (relation; no; yes), `instrument_id` (relation; no; yes), `valid_from` (date; no; yes), `valid_to` (date; no; no), `known_at` (datetime UTC; no; no) | Historical composition is retained so tests do not use today's members in past periods. |
| DailyBar | `instrument_id` (relation; no; yes), `provider` (select; no; yes), `session_date` (date; no; yes), `open` (float; no; yes), `high` (float; no; yes), `low` (float; no; yes), `close` (float; no; yes), `volume` (float; no; yes), `available_at` (datetime UTC; no; yes), `revision_id` (text; no; yes) | System imports; raw provider values retained; `(instrument_id, session_date, provider, revision_id)` identifies a bar revision. Derived adjusted prices are separate from raw bars. |
| DataSeries | `id` (text; no; yes), `provider` (select; no; yes), `provider_symbol` (text; no; yes), `frequency` (select; no; yes), `unit` (text; no; yes) | System imports; owner selects. `(provider, provider_symbol)` unique. |
| Observation | `series_id` (relation; no; yes), `observed_on` (date; no; yes), `value` (float; no; yes), `available_at` (datetime UTC; no; yes), `revision_id` (text; no; no) | System imports; revisions retained, never silently overwrite historical values. |
| DataSnapshot | `id` (text; no; yes), `created_at` (datetime UTC; no; yes), `source_revision_refs` (text; yes; yes), `availability_rule_ref` (text; no; yes) | System records exact input versions and selection rule; immutable once used by a calculation or test. |
| CoverageReport | `id` (text; no; yes), `created_at` (datetime UTC; no; yes), `acquired_scope_ref` (text; no; yes), `gap_refs` (text; yes; no) | System creates after import; owner reads acquired ranges and import problems. Never equates "provider returned data" with "all GPW history is complete". |
| IndicatorDefinition | `id` (text; no; yes), `name` (text; no; yes), `purpose` (text; no; yes), `created_at` (datetime UTC; no; yes) | Owner creates a named indicator; first version contains only one barometer. Later indicators reuse the same engine. |
| IndicatorVersion | `id` (text; no; yes), `indicator_id` (relation; no; yes), `schema_version` (text; no; yes), `definition` (dictionary; no; yes), `definition_hash` (text; no; yes), `engine_version` (text; no; yes), `effective_from` (date; no; yes), `input_series_ids` (relation; yes; yes), `status` (select; no; yes) | Owner approves a validated JSON/DSL revision. Activation requires valid input bindings and an after-close schedule. An activated version is immutable; a change creates another version. v0 mathematics is accepted; source bindings must pass Q01. |
| SignalPolicyVersion | `id` (text; no; yes), `bands` (dictionary; yes; yes), `policy_hash` (text; no; yes), `effective_from` (date; no; yes) | Owner approves the score-to-posture/allocation mapping. The first policy is D03; later changes create a version rather than rewriting prior results. |
| IndicatorResult | `version_id` (relation; no; yes), `policy_version_id` (relation; no; yes), `session_date` (date; no; yes), `snapshot_id` (text; no; yes), `revision_id` (text; no; yes), `score` (float; no; yes), `posture_band` (select; no; yes), `suggested_allocation_pct` (float; no; yes), `calculated_at` (datetime UTC; no; yes) | Generic engine computes from an identified definition version, signal policy and input snapshot; 0 ≤ score ≤ 100. `(version_id, session_date, revision_id)` is unique. Corrections create a traceable revision. |
| BacktestProtocolVersion | `id` (text; no; yes), `schema_version` (text; no; yes), `test_type` (select; no; yes), `basket_weights` (dictionary of instrument ID to float; no; no for WIG signal test), `benchmark_ref` (text; no; yes), `execution_rule` (select; no; yes), `cost_scenarios_bps` (integer; yes; yes), `cash_return_rule` (select; no; yes), `dividend_rule` (select; no; yes), `holdout_rule` (dictionary; no; yes), `configuration_hash` (text; no; yes), `created_at` (datetime UTC; no; yes) | Owner registers a validated JSON setup. Each saved version is immutable; ETF basket weights sum to 100% of its equity sleeve. First defaults are in `app-spec-notes/completion-decisions.md`. |
| BacktestRun | `id` (text; no; yes), `test_type` (select; no; yes), `version_id` (relation; no; yes), `policy_version_id` (relation; no; yes), `protocol_version_id` (relation; no; yes), `snapshot_id` (text; no; yes), `period_start` (date; no; yes), `period_end` (date; no; yes), `created_at` (datetime UTC; no; yes) | Owner starts; results, definition version, policy version, engine version, input snapshot and JSON protocol remain reproducible. The theoretical WIG and three-ETF execution tests use separate protocol versions. ETF history is used only after all three were listed. |

Full-history GPW acquisition includes daily prices and volumes for active and delisted companies, corporate actions and historical index composition, subject to provider availability and rights. The owner chose a transparent, versioned first formula fixed before evaluation on untouched history; v0's mathematical factors, weights and normalization are accepted, while source bindings remain Q01. The ten-band mapping is in `.ai/specs/research/decisions/D03-signal-bands.md`. The accepted technical pipeline is in [the platform technology decision](research/decisions/2026-11-04-platform-technology.md). The owner has no EODHD access yet. Acquire and retain locally the full available GPW market history, including constituent stocks as well as index series, recording coverage gaps and source provenance. The first barometer consumes only the relevant subset; future indicators may use market breadth, sectors and constituent histories. Exact instrument coverage and data rights remain to be specified. Schedule incremental updates and respect provider quotas. A paid plan is acceptable if needed. An EODHD MCP connection may be considered for later indicators only after a cost/benefit assessment; it is not a first-version requirement. Verify actual terms before choosing a provider.

The owner confirmed that the first candidate combines GPW trend/breadth with copper, PLN and bond yields. Breadth uses ordinary shares listed on the GPW Main Market on the historical session, including shares delisted later; NewConnect is excluded from this component but remains in the target local archive. The accepted v0 weights are WIG trend 30%, breadth 25%, copper 20%, PLN 15% and US yield spread 10%, each ranked against its prior 252 eligible session values. These parameters are the first hypothesis to test. The owner accepted publication by 08:30 Europe/Warsaw before the next scheduled GPW session when required inputs and the local Mac are available. If the Mac is off, the service reconciles the missed session on startup and labels any result after 08:30 late; it never backdates it as actionable. A daily copper source and other provider bindings must still be verified before the JSON/DSL definition can be activated. First-version coverage and test defaults are in `app-spec-notes/completion-decisions.md`. The separate GPW archive still targets all available Main Market and NewConnect history.

**v0 score formula:** For session `t`, compute (1) `ln(WIG_close_t / WIG_close_(t−60 GPW sessions))`, (2) the fraction of historically eligible Main Market ordinary shares with split-adjusted close above their trailing 200-observation simple average, (3) `ln(copper_asof_t / copper_asof_(t−60))`, (4) `−ln(USDPLN_asof_t / USDPLN_asof_(t−60))`, and (5) `DGS10_asof_t − DGS2_asof_t` in percentage points. For each component, compare its current value with its **252 preceding eligible GPW-session values**: `rank = 100 × (count(previous < current) + 0.5 × count(previous = current)) / 252`. The final unrounded score is `0.30×rank(WIG) + 0.25×rank(breadth) + 0.20×rank(copper) + 0.15×rank(PLN) + 0.10×rank(yield spread)`. No score exists before the required lookbacks and all five component ranks exist. The score is a relative market-state index, not a calibrated probability. Source timing, breadth coverage and missing-data gates are in `app-spec-notes/completion-decisions.md`; they are part of the JSON definition's validation contract.

The archive's historical start and the first calculable v0 score are separate dates. Store any earlier GPW data even when copper, FX, yields or rolling lookbacks are not yet available. Display the earliest complete v0 session and why preceding sessions have no score; do not backfill them with modern data or a shorter ad hoc formula under the same version.

**D03 signal policy, first version:** apply these boundaries to the unrounded score. A shared boundary belongs to the higher band, except 75 remains in the 70–75 band because the top band is strictly above 75. The percentages are hypotheses for historical testing, not verified optimal allocations.

| Score | Posture | Suggested equity allocation |
|---|---|---:|
| `0 ≤ s < 35` | Duże ryzyko bessy | 20% |
| `35 ≤ s < 40` | Ultra defensywna | 30% |
| `40 ≤ s < 45` | Zdecydowanie defensywna; zamknij spekulacyjne | 40% |
| `45 ≤ s < 50` | Defensywna; rozważ zamknięcie spekulacyjnych | 50% |
| `50 ≤ s < 55` | Umiarkowanie defensywna | 50% |
| `55 ≤ s < 60` | Neutralna | 60% |
| `60 ≤ s < 65` | Umiarkowanie ofensywna | 70% |
| `65 ≤ s < 70` | Ofensywna | 80% |
| `70 ≤ s ≤ 75` | Zdecydowanie ofensywna | 90% |
| `75 < s ≤ 100` | Ultra ofensywna | 100% |

**Declarative indicator rule:** Indicator-specific logic lives in a versioned JSON/DSL definition, not in custom code for each indicator. A shared, deterministic engine interprets only a documented allowlist of operations. A definition declares input series and point-in-time selection, eligible instrument universe for cross-sectional features, lookbacks, transformations, aggregation/weights, missing-data behavior, output range and after-close cadence. The first barometer requires both time-series operations and a breadth calculation over the historically eligible GPW universe; these must be expressible in the first operator set. Validation rejects unknown operations, cyclic dependencies, incompatible units/frequencies, unbounded lookbacks and output outside the declared range before activation. Definitions cannot execute arbitrary code or call external services. The engine and DSL schema are versioned so old results remain reproducible. The first release needs one validated barometer definition and the ability to register a revised definition without changing engine code; an in-app formula editor or automatic generation of many indicators comes later. Exact DSL grammar is a feature-spec concern after this App Spec is confirmed.

**Declarative test rule:** Portfolio composition, including the three ETF weights, belongs to a versioned JSON backtest protocol, separate from the indicator definition and D03 signal policy. One protocol is fixed for each run before results are calculated; another protocol can test another basket without changing source code or the indicator. The application must show which protocol produced each chart. Protocol variants examined during research are not an untouched validation set; the holdout remains reserved until the candidate and its protocol are fixed.

**Core invariants:** Each imported value keeps its provider, observation date, availability time and revision. Imports are idempotent for the same source identity; revised values do not silently replace earlier values. A published score points to an activated immutable definition version, signal policy version, engine version and data snapshot. A definition hash covers the canonical definition, input bindings, timing rule and schema version; activation cannot alter them in place. At most one definition version is active for one indicator and GPW session, while older versions remain selectable for research. A backtest run points to an immutable JSON protocol version; changing ETF weights or costs creates another protocol version and another run, never a silent rewrite. The score maps to exactly one of the ten bands in D03, with boundary values assigned there. Every indicator is calculated after the relevant GPW session closes. The decision snapshot for session `t` closes at 08:30 Europe/Warsaw on the next scheduled GPW trading day; inputs available after that cutoff cannot be used for that next session's simulated action. A result can guide action no earlier than a session beginning after its publication. A historical test must select only inputs known by each simulated decision time; unknown publication history is disclosed as a test limitation. The raw local archive and its coverage report remain available even if a later indicator uses only some series. The owner alone can inspect results and start tests in version 1. Named domain events are `HistoryImported`, `CoverageAssessed`, `IndicatorVersionActivated`, `BarometerCalculated`, `BarometerCorrected`, and `BacktestCompleted`; they describe recorded facts, not an assumed messaging platform.

#### Checklist
- [x] Domain entities identified with clear ownership
- [x] Domain rules documented — invariants, constraints, calculations
- [x] If there are levels/tiers: thresholds, benefits, governance rules (evaluation, grace period, downgrade, audit)
- [x] If there are KPIs/scores: complete formulas with input source, period, anti-gaming rules
- [x] Access control rules documented — who sees/does what, cross-org visibility
- [x] Data ownership per entity — who creates, who reads, who updates, system vs user
- [x] **Entity fields defined precisely** — every domain entity has its fields listed with: key, type (text/select/dictionary/relation/boolean/integer/float), multi-value or not, and required-for-creation flag. Vague descriptions like "company profile data" or "case study information" are not acceptable — implementation will guess wrong.

> **Weak vs precise field definitions:**
>
> | Weak (will cause bugs) | Precise (implementation-ready) |
> |----------------------|-------------------------------|
> | "Case study has industry and tech info" | `industry` (dictionary, multi, required), `technologies` (dictionary, multi, required), `project_type` (select) |
> | "Company profile with services" | `services` (dictionary, multi), `industries` (dictionary, multi), `team_size_bucket` (select) |
> | "Budget information" | `budget_known` (boolean), `budget_bucket` (select, required), `budget_min_usd` (float), `budget_max_usd` (float) |
> | "Track deal progress" | `registered_at` (datetime, system-set, immutable once stamped, UTC) |
> | "License deal record" | `license_identifier` (text, required), `attributed_partner_id` (relation, required), `status` (select), `is_renewal` (boolean), `closed_at` (datetime) — unique key: `(license_identifier, year)` |
>
> Rule of thumb: if a person reading the field definition has to ask "what type is this?" or "is this required?" — the definition is too vague.

---

## 2. Identity Model `PM`

> SINGLE SOURCE OF TRUTH. If any spec contradicts this, update the spec.

| Persona | Role key | Identity | Org scope | Sees | Does |
|---------|----------|----------|-----------|------|------|
| Owner | `owner` | local single-user session; no remote identity in version 1 | one local workspace | daily barometer and historical tests | view results and run research tests |

**External-surface decision framework:**

> Applies when the app distinguishes an internal surface (an admin backend or equivalent — whatever the capability catalog names) from a dedicated external one. When the app has a single authenticated surface, record that fact and the roles (if any) here, skip the tree, and mark the rest of this framework N/A.

Every persona external to the operating organization is a candidate for an external identity + a dedicated external surface (portal), instead of an account on the internal surface.

```
External persona?
├─ NO → internal user + internal surface + the app's access-control mechanism
└─ YES → needs brand separation or a different UX than the internal surface?
          ├─ NO, the internal surface is fine → internal user + internal surface
          └─ YES → external identity + dedicated external surface (portal)
```

> **Portal red flag:** if a portal persona needs the internal surface's rich building blocks (data grids, pipeline views, bulk CRUD over many entities) — reconsider; the external surface usually lacks them. Exception: a conscious custom-UX decision recorded in the decision log.
>
> **Internal-surface red flag:** if an internal persona is external to the organization, temporary, and sees 2–3 simple views — consider the external surface instead; the identity model stays clean.
>
> **Agentic cost note:** external-surface pages are custom pages the agent generates from this spec. That is not a blocker — but §3.5 MUST spec every such page with enough detail to implement without guessing. Each page = minimum 1 atomic commit in §4 gap analysis.

**Portal decision:** NOT USED. Version 1 runs locally in the owner’s browser on one computer; no external users or organizations. This is a product scope decision, not a security assessment of the chosen runtime.

**If USED — per persona justification:**

| Portal persona | Why the external surface, not the internal one? | Custom pages needed? |
|---|---|---|
| | | |

**If NOT USED — why:**
One owner uses one local surface. Remote access, public accounts and multi-organization scoping are outside version 1.

**Decision log:**
Owner: one local user can view the daily score and historical comparison. The owner confirmed local-only use for version 1; no portal or second identity is needed. Authentication details depend on the eventual local runtime.

#### Checklist
- [x] Every persona has ONE identity type — internal or external, no "maybe both" `PM`
- [x] Identity decision justified per persona — the capabilities they need drive the choice `PM`
- [x] No persona has two accounts — if someone needs both identity types, the model is wrong `Architect`
- [x] Org scoping defined per role — who sees which orgs, read-only vs read-write `Architect`
- [x] Portal decision justified with the decision tree (or the single-surface fact recorded) — not just "used/not used" `PM`
- [x] If Portal USED (N/A — no portal): every portal persona has a custom-page estimate `Architect`
- [x] If Portal USED (N/A — no portal): §3.5 includes the Portal Pages subsection with full page specs `PM`

---

## 3. Workflows `PM`

> Each workflow traces to ROI. If a workflow doesn't move a KPI or enable one that does, cut it.

### Workflow map

| Workflow | Start → completion | User value | Important failure paths |
|---|---|---|---|
| WF1 — Prepare market history | Scheduled import → each selected series has observations with source, frequency and availability time | Trustworthy inputs for a daily calculation and historical test | Missing symbol, stale release, revised observation, mixed frequencies |
| WF2 — Publish daily barometer | GPW session closes → score, posture and calculation time are shown | Owner sees the day's market stance | Late data, incomplete inputs, calculation failure, corrected result |
| WF3 — Examine historical behavior | Owner selects an indicator version and period → portfolio path and comparison are shown | Owner can judge drawdown, return and turnover | Future-data leakage, unavailable market proxy, costs omitted, parameter overfitting |

These workflows have explicit acceptance and operational ROI metrics in §7. Provider feasibility remains an external acceptance gate. WF1 must respect provider quotas through incremental import and local retention; the acquisition target is full available GPW history, while the first barometer uses a subset and the backtest period remains a separate choice.

### WF1: Acquire and reconcile GPW history

**Journey:** Owner starts local setup → system inventories the available GPW instrument universe, including delisted instruments → imports raw daily bars, actions, index series and historical membership where available → records source versions and availability times → reports acquired periods and gaps → incrementally refreshes after later sessions. The local archive is usable for a selected test only when the necessary inputs pass its coverage gate.

**ROI:** One acquisition can be reused for multiple indicators. Measure the percentage of expected instruments/series with a known coverage status (target 100% status accounting), plus actual date coverage by data class and manual hours spent on recurring imports (target zero after setup). These are proposed operational acceptance targets, not a claim of 100% historical availability.

**Key persona:** Owner reviews coverage and authorizes provider access; system imports and reconciles.

**Boundaries:** Starts with a configured provider and target universe; ends with a durable local archive and coverage report. It does not calculate the score or assert that a provider has data for every GPW session since inception.

**Edge cases:**
1. Missing or delisted symbol → keep it in the expected universe, mark its gap and source evidence → avoid survivorship bias.
2. API quota or network failure → retain the completed checkpoint and resume incrementally → avoid restart cost or false completeness.
3. Revised price, split or dividend → preserve both revisions and mark affected snapshots/results stale → avoid unexplained historical changes.
4. Historic membership or publication time unavailable → flag it explicitly in coverage → avoid false point-in-time claims.
5. Duplicate symbol across providers or corporate rename → reconcile to one instrument identity with dated mappings → avoid double counting.

**Platform readiness:** No application platform exists in the repo. The proposed local runtime direction is in §4.5; all steps map to new app capabilities in §4.

| Step | Required capability | Gap? | Notes |
|------|---------------------|------|-------|
| Inventory universe and identities | Provider adapter, local catalog | Unknown | EODHD coverage and GPW scope require verification. |
| Import and resume raw history | Quota-aware ingestion, local storage | Unknown | Preserve revisions and checkpoints. |
| Reconcile and report coverage | Validation and coverage report | Unknown | Full-history target remains visible even with gaps. |

### WF2: Calculate and publish the daily barometer

**Journey:** Owner registers and activates a validated declarative indicator version → GPW session closes → system waits for that definition's required inputs → selects one immutable input snapshot → shared engine evaluates the version → applies a versioned signal policy to the score → publishes the result with session and calculation times → owner opens Today and inspects it. A correction creates a new result revision and labels the earlier result superseded.

**ROI:** Measure the share of eligible GPW sessions with one published result by 08:30 Europe/Warsaw before the next GPW session, plus the share explicitly marked pending/blocked. For sessions when the local Mac is running through the cutoff, the first-version target is 100% accounted for as published or blocked by 08:30. Track powered-off sessions separately; reconcile them at startup and mark their result late or blocked. No predictive-performance claim is made by this operational metric.

**Key persona:** Owner reads the result; system computes and publishes.

**Boundaries:** Starts after a GPW close; the decision cutoff is 08:30 Europe/Warsaw before the next scheduled GPW session; ends with a published result or explicit blocked state. It does not place trades. A result published after the cutoff cannot be retroactively used for an action at that next session's open.

**Edge cases:**
1. A required input is late at 08:30 → show a pending state with the missing series; a later calculation is labeled late and cannot affect the upcoming session's historical action → never fabricate or backdate a score.
2. A provider correction arrives → recalculate with a new snapshot/revision and show the change → preserve auditability.
3. Market holiday or no GPW session → do not emit a daily result → avoid false continuity.
4. Invalid definition, calculation failure or out-of-range score → keep the prior activated version when validation fails; otherwise block the affected result and surface an error → avoid misleading posture.
5. A source series has a different frequency or release lag → use only the latest observation available by the decision cutoff → avoid look-ahead.

**Platform readiness:** No platform capabilities can be claimed yet; formula and input mapping are a separate product blocker.

| Step | Required capability | Gap? | Notes |
|------|---------------------|------|-------|
| Check session and input readiness | Calendar, availability gate | Unknown | Publication cutoff requires a chosen formula. |
| Validate and activate definition | Versioned JSON/DSL schema and validation | Unknown | First release registers one definition without an in-app editor. |
| Compute and version result | Shared deterministic interpreter, snapshots | Unknown | Same definition, engine version and snapshot must reproduce the same score. |
| Display Today and correction | Local page and result history | Unknown | Show session, freshness, posture and allocation. |

### WF3: Validate a fixed indicator on historical data

**Journey:** Owner selects immutable indicator and signal-policy versions, then supplies a versioned JSON test protocol and date span → system validates the protocol and input/benchmark coverage → the shared engine evaluates point-in-time signals → a longer signal test applies the policy to theoretical WIG index changes against fixed 100% WIG exposure → a separate execution test applies it to the protocol's WIG20TR, mWIG40TR and sWIG80TR ETF basket with declared weights and costs, beginning only after all three existed → each report shows return, maximum drawdown, turnover, date coverage and limitations → saves reproducible runs. The owner can compare another protocol without changing the indicator or overwriting prior runs.

**ROI:** Measure reproducibility (same protocol, version and snapshot produce identical reported metrics) and the share of tested periods with disclosed coverage limitations (target 100%). Historical excess return and drawdown are evaluation results to observe, not targets to promise in advance.

**Key persona:** Owner starts and interprets the test; system validates inputs and computes it.

**Boundaries:** Starts with a version, period and protocol; ends with stored signal and execution reports or an explicit blocker for either. The signal test does not imply direct trading in the WIG index. It does not optimize parameters on the untouched evaluation period or infer live profitability from one backtest.

**Edge cases:**
1. Input, benchmark, instrument or membership history is incomplete → block the affected period or label a restricted test; do not extend a tradable proxy backward before its inception → avoid silent bias.
2. Observation publication time is unknown → disclose the assumption and mark point-in-time validity limited → avoid false precision.
3. A data correction follows an earlier run → retain the old snapshot and offer a new run → preserve comparisons.
4. No following tradable session exists at period end → stop before an impossible trade → avoid inflated returns.
5. JSON protocol omits costs, dividend/cash treatment or valid basket weights → reject the run before calculation, with field-level errors → avoid an ambiguous comparison.

**Platform readiness:** No platform capabilities can be claimed yet; protocol and holdout design are product blockers.

| Step | Required capability | Gap? | Notes |
|------|---------------------|------|-------|
| Choose and validate test | Local form, coverage gate | Unknown | Fixed indicator version only in version 1. |
| Register test protocol | Versioned JSON schema and validation | Unknown | ETF weights and costs are configuration, not indicator code. |
| Simulate point-in-time decisions | Backtest engine, protocol store | Unknown | Next-session execution, no future inputs. |
| Reuse indicator calculation | Same JSON/DSL interpreter as WF2 | Unknown | No separate hand-coded backtest formula. |
| Report and retain run | Charts, metrics, immutable results | Unknown | Show theoretical WIG test and tradable execution test separately, each with its own valid dates. |

#### Checklist (per workflow)
- [x] End-to-end journey — first touchpoint to value delivery, no gaps `PM`
- [x] Measurable ROI — a specific metric that moves, not "users benefit" `PM`
- [x] Boundaries — explicit start, end, and NOT-this-workflow `PM`
- [x] 3–5 edge cases — high-probability production scenarios `PM`
- [x] Every step mapped to a platform capability `Architect`

#### Checklist (overall)
- [x] 3–7 core workflows defined `PM`
- [x] Any workflow needing >200 lines of new code was re-checked against the capability catalog for a missed platform capability — and its size justified when none exists `Architect`

---

## 3.5 UI Architecture `PM + UX`

> Defines what each persona sees in the UI: navigation, pages, dashboard widgets, key user flows.
> The PM drafts from user stories; UX reviews for clarity and task completion.
> Everything here uses the platform's existing UI building blocks — no custom components unless flagged.

### Initial one-user screen direction

- **Today:** score, named posture, suggested equity allocation, GPW session date, calculation time, and a visible stale/incomplete-data state.
- **History:** score and posture over sessions, with links to the indicator version and the data available at that time.
- **Version detail:** read-only definition summary, input bindings, schema/engine version and activation history; first release has no visual formula editor.
- **Historical comparison:** separate theoretical WIG signal path and tradable-instrument execution path, each beside its own fixed-exposure baseline, with date coverage, drawdown, return, turnover and declared costs.
- **Data health:** each input series' last observation and availability time; missing and revised data shown explicitly.

The repository has no UI framework or component library yet; route purposes are fixed above and implementation building blocks are selected in feature specs.

### Navigation (per role)

> What sidebar groups and items does each role see? Order matters — most-used first.

| Role | Sidebar groups | Notes |
|------|---------------|-------|
| Owner | Today; History; Tests; Data coverage | One local surface; Today is the landing page. |

### Dashboard Widgets (per role)

> What does each role see on their dashboard after login? Widgets should answer "what do I need to do right now?"

| Widget | Roles that see it | Data shown | Click-through |
|--------|------------------|------------|---------------|
| Latest result | Owner | Session date, score, posture, allocation, version and freshness/block state | History for revisions and context |
| Input readiness | Owner | Missing or stale required inputs and last import status | Data coverage |
| Last historical test | Owner | Tested version/period, return, drawdown, comparison and limitations | Tests |

### Custom Pages

> Planned Angular pages beyond the standard data-entry surfaces.

| Page | URL pattern | Role | Purpose | Building block |
|------|------------|------|---------|----------------|
| Today | `/` | Owner | Read current result or why it is pending/blocked | Angular route + NestJS API |
| History | `/history` | Owner | Inspect dated scores, bands, versions and revisions | Angular route + NestJS API |
| Tests | `/tests` | Owner | Start a test and compare a saved run to a baseline | Angular route + NestJS API |
| Data coverage | `/data` | Owner | Inspect imported universe, series, dates, gaps and quotas | Angular route + NestJS API |

### Portal Pages (when §2 Portal = USED)

N/A. The owner uses one local browser surface; no external portal exists in version 1.

### Widget Injections

N/A. No existing platform pages or documented injection points exist in this greenfield repository.

### Key User Flows

> For each persona's primary task, trace the click path from login to completion.

| Persona | Task | Flow (login → done) | Clicks | Notes |
|---------|------|---------------------|--------|-------|
| Owner | Read daily result | Open local app → Today shows result or block reason | 0 | Local runtime may have no login in version 1. |
| Owner | Inspect historical behavior | Today → Tests → saved result or start test | 1–2 | Test execution may take time; show progress and completion. |
| Owner | Check history completeness | Today → Data coverage → gap detail | 1–2 | Historical acquisition remains a first-version target. |

### Empty States

> What does a first-time user see? Empty states should guide, not confuse.

| Page/Widget | Empty state message | Action |
|-------------|-------------------|--------|
| Today | No result yet; inputs are being acquired or required data are missing. | Open Data coverage. |
| History | No published barometer sessions yet. | Open Today for current status. |
| Tests | No historical test has completed. | Start a test after coverage and formula gates pass. |
| Data coverage | No source configured or no import completed. | Show local setup instructions and first import action. |

#### Checklist
- [x] Every persona has a defined login-to-primary-task flow `PM`
- [x] Navigation grouping matches how users think about their work `UX`
- [x] Dashboard widgets answer "what to do next", not just "data" `UX`
- [x] Empty states are helpful, not blank pages `UX`
- [x] Custom pages use the platform's building blocks — custom UI only where flagged `Architect`
- [x] Click count from login to primary task is ≤ 3 for each persona `UX`
- [x] If Portal USED (N/A — no portal): every portal page specced in the table with its building block `PM`
- [x] If Portal USED (N/A — no portal): real-time events mapped per page that uses them `Architect`
- [x] If Portal USED (N/A — no portal): empty states + stage gates defined `UX`

---

## 4. Workflow Gap Analysis `Architect`

> Gap analysis maps each workflow step to a platform capability.

### Gap Scoring — Atomic Commits

Each gap is measured in **atomic commits** — one self-contained, testable increment that a single focused loop can deliver.

| Score | Meaning | Example |
|-------|---------|---------|
| 0 | Platform does it, zero commits | An existing feature or a permission/role config |
| 1 | 1 commit: config/seed only | Pipeline stages or defaults in seed data |
| 2 | 1–2 commits: small gap | A widget/extension-point addition + i18n |
| 3 | 2–3 commits: medium gap | New entity + CRUD route + admin page |
| 4 | 3–5 commits: large gap | Multi-entity + pages + a workflow definition |
| 5 | 5+ commits or external dependency | External API integration, an LLM pipeline |

### Per-Workflow Gap Matrix

There is no application code in this repository yet. The accepted [technology decision](research/decisions/2026-11-04-platform-technology.md) names the framework and storage stack, but no capability is implemented, so no row claims a zero-code platform match. Commit counts are provisional planning estimates; the feature specs provide the implementable steps. External provider access is a procurement/data gate, not a code commit.

| Workflow and step | Platform capability | Gap | Scope | Atomic commits | Evidence / gate |
|---|---|---:|---|---:|---|
| WF1 source inventory and identities | None in repo | 5 | app | 3 | Provider adapters and dated symbol mapping; provider entitlement unverified. |
| WF1 resumable raw archive | None in repo | 5 | app | 4 | Local storage, quota-aware checkpoints and revision retention. |
| WF1 coverage/correction view | None in repo | 4 | app | 3 | Expected vs acquired dates, stale dependency marking. |
| WF2 definition registry and validation | None in repo | 5 | app | 3 | Versioned JSON/DSL, restricted operator set. |
| WF2 generic calculation and cutoff | None in repo | 5 | app | 5 | Point-in-time engine, breadth, 08:30 schedule and D03 mapping. |
| WF2 Today/History views | None in repo | 4 | app | 3 | Current, pending, blocked and revised states. |
| WF3 protocol registry | None in repo | 3 | app | 2 | Versioned JSON test setup; no ETF weights in indicator definition. |
| WF3 simulation and holdout | None in repo | 5 | app | 5 | WIG and ETF runs, costs, next-close execution, immutable snapshots. |
| WF3 report/comparison | None in repo | 4 | app | 3 | Separate charts, metrics, limitations and version comparison. |
| Source account/license and coverage sample | Outside repo | 5 | external | 0 | Must be verified before WF1/2/3 data-dependent acceptance. |

> **Scope column:** where does this commit live? `app` = this repo, `platform` = a contribution to the platform itself, `automation` = an external automation/integration layer, `external` = outside both.
> Commits scoped `platform` are upstream contributions — welcome, but they need an upstream PR + approval. Flag them as dependencies: your phase can't ship that commit until upstream merges. Check first whether a sanctioned extension point can cover it from the app side.
>
> **Notes column — evidence and tier:** say how the capability claim is backed — `grounded: <verdict> (<N>/<M>, <tier>)` when `om-gap-analysis` verified it against a validated platform checkout, or `docs-only: <catalog source file>` otherwise — and the license tier when the platform's knowledge declares one. A licensed capability is a cost §7 must carry.

### Gap Summary

| Workflow | Business Priority | Atomic Commits (raw) | Workaround? | Commits (effective) | Blocks ROI? |
|----------|------------------|---------------------|-------------|---------------------|-------------|
| WF1 | High: reusable local history | 10 | None for the full-history goal | 10 | Yes until provider access and coverage sample. |
| WF2 | High: daily result | 11 | Show blocked state until daily copper and other feeds are verified | 11 | Yes until valid bindings. |
| WF3 | High: evidence of usefulness | 10 | Theoretical WIG report can precede ETF report only if clearly labeled | 10 | Yes until protocol and point-in-time coverage pass. |

Total planning estimate: **31 atomic commits** across three complete workflows. The external gate is uncounted work, not zero effort. Feature-spec implementation plans take precedence over these provisional counts.

Detailed proposed commit boundaries are in `app-spec-notes/commit-plan.md`.

#### Checklist
- [x] Every workflow step scored in atomic commits `PM`
- [x] Architect checkpoint: workflow-to-platform mapping verified — no capability missed, no overengineering, commit plans saved `Architect`

---

## 4.5 Module Architecture `Architect`

> Consolidated view of which platform capabilities this app uses, how it extends them, and what new modules it creates.
> Derived from the per-workflow gap analysis (§4) — the Architect consolidates after checkpoint #1.

### Platform capabilities used

| Capability | Usage | Extension points used | Notes |
|-----------|-------|----------------------|-------|
| None | N/A | None identified | The repository is greenfield; OpenMercato is the method, not a software dependency. |

### Shared modules (existing or proposed)

> If a gap is reusable (2+ apps would benefit), propose it as a shared/upstream module instead of building it into the app.
> Proposed modules need clear boundaries: single responsibility, no app-specific domain logic.

| Module | Status | Usage | Extension points | Rationale |
|--------|--------|-------|-----------------|-----------|
| None in repository | N/A | N/A | N/A | Generic libraries may be selected in feature specs, but no shared application module exists yet. |

### App modules

> App-specific domain logic that is NOT reusable across other apps.

| Module | Responsibility | Entities owned | Notes |
|--------|---------------|----------------|-------|
| Market archive | Provider boundary, dated universe, immutable raw observations and coverage | Instrument, InstrumentIdentity, CorporateAction, IndexMembership, DailyBar, DataSeries, Observation, DataSnapshot, CoverageReport | External source formats stop here. |
| Indicator research | JSON/DSL registry, shared evaluator, D03 policy, daily results and tests | IndicatorDefinition, IndicatorVersion, SignalPolicyVersion, IndicatorResult, BacktestProtocolVersion, BacktestRun | One module keeps definition, result and run invariants together; its UI exposes separate tasks. |

The accepted [technology decision](research/decisions/2026-11-04-platform-technology.md) selects a TypeScript monorepo: Angular UI, NestJS loopback API, a separate NestJS import/calculation worker, PostgreSQL as the canonical store for dated market observations, revisions and metadata, and checksummed local files for original provider responses. Docker Compose runs the local services. The worker reconciles missed sessions after restart; powered-off periods cannot meet the 08:30 target. The two app modules communicate through immutable data snapshots; a provider revision marks dependent results stale but does not mutate saved runs.

#### Checklist
- [x] Every platform capability listed with explicit usage type (as-is / extend) and extension points `Architect`
- [x] Every listed capability traces to a user story or workflow — template defaults don't count; if §2 rejects the portal, don't list portal capabilities `Architect`
- [x] Every shared module listed — existing ones with extension points, proposed ones with rationale `Architect`
- [x] Every gap scored `platform` in §4 has an upstream investigation (specs, issues, PRs — via read-only tracker operations when available; otherwise logged in §10) `Architect`
- [x] Reusability check: no reusable pattern hidden inside an app module — if 2+ apps would need it, propose it as shared `Architect`
- [x] Proposed shared modules have a clear boundary — single responsibility, no app-specific domain logic leaked in `Architect`
- [x] App module count justified — if >2 app modules, explain why they can't be one `Architect`
- [x] Extension points into shared modules documented — the same sanctioned patterns as for the platform core `Architect`
- [x] No direct modification of platform or shared-module code — extend only via sanctioned extension points, or FLAG as an upstream PR `PM + Architect`
- [x] Module boundaries align with bounded-context boundaries — if two modules share invariants or domain events that must be transactionally consistent, they should be one module `DDD`

---

## 5. User Stories `PM`

> Each story traces to a workflow step. Story = an atomic action by one persona with measurable success.

All stories use the one local `owner` surface in §2 and the pages in §3.5. Automated jobs act for that owner; no second persona or external account is created.

### WF1 — market history

**US-1.1** As owner, I register a data-source credential locally and start a resumable history import so that the GPW archive is populated once and refreshed incrementally. **Success:** every attempted symbol/date batch has a persisted status and source identity. **Happy:** import resumes from its last checkpoint. **Alternate:** I pause and resume; already stored bars are not duplicated. **Failure:** invalid credential, quota or network error leaves completed batches intact and shows the next retry point on Data coverage.

**US-1.2** As owner, I inspect Main Market and NewConnect data, including later-delisted shares and corporate actions, so that I know acquired dates and import problems. **Success:** report shows acquired counts/ranges by data class and source. **Happy:** Data coverage shows import problems and provenance. **Alternate:** unavailable historic index membership is marked unavailable rather than invented. **Failure:** incomplete source evidence blocks a claim of complete GPW history.

**US-1.3** As owner, I rerun an incremental import after a provider correction so that later calculations can use the revised value while prior versions remain auditable. **Success:** the raw revision is retained, dependent results are marked stale, and a new snapshot can be generated. **Happy:** correction and affected results are linked. **Alternate:** identical provider response changes nothing. **Failure:** malformed revision is quarantined; the previous archive and published results remain readable.

### WF2 — daily barometer

**US-2.1** As owner, I register a JSON/DSL indicator definition and D03 policy so that the generic engine can calculate v0 without indicator-specific code. **Success:** schema, bindings, after-close cadence and output range validate before one version activates. **Happy:** version detail shows its hash and inputs. **Alternate:** a new version is registered while the old one remains available for research. **Failure:** invalid operation or missing binding yields field-level errors; no partial activation occurs.

**US-2.2** As owner, I open Today by 08:30 before the next GPW session so that I see the prior session's score, posture, suggested allocation and freshness when my Mac and the local services are running. **Success:** each eligible session is either published with exact versions/snapshot or explicitly pending/blocked; no score uses data first available after the cutoff. **Happy:** one on-time result appears. **Alternate:** a holiday creates no GPW result; a powered-off Mac causes startup reconciliation with a late/blocked marker. **Failure:** late/missing input or calculation error shows why it is blocked; no fabricated result or next-session action is recorded.

**US-2.3** As owner, I inspect a day's result and its revisions in History so that I can explain a changed score. **Success:** current and superseded results show calculation time, source snapshot and definition/policy versions. **Happy:** chart links to the result detail. **Alternate:** a late correction creates a new revision with a visible reason. **Failure:** a recomputation error preserves the previous revision and marks it stale rather than silently replacing it.

### WF3 — historical validation

**US-3.1** As owner, I register a JSON backtest protocol so that basket weights, costs, timing and benchmark are explicit before a run. **Success:** a valid immutable protocol has a hash; ETF equity weights sum to 100%. **Happy:** Tests shows the saved protocol. **Alternate:** I register another version for sensitivity analysis. **Failure:** invalid weights or missing cost/cash rule reject the protocol without starting a run.

**US-3.2** As owner, I run the theoretical WIG signal test and the three-ETF execution test so that I can compare return, maximum drawdown and turnover with each fixed-exposure baseline. **Success:** runs retain definition, policy, protocol and data snapshot; no ETF return predates its listing. **Happy:** two separately labeled reports show valid dates and cost scenarios. **Alternate:** only one test has adequate coverage, so that report completes and the other remains explicitly blocked. **Failure:** missing point-in-time inputs or benchmark history blocks the affected period; no partial result is presented as validated.

**US-3.3** As owner, I compare saved versions and inspect the untouched holdout separately so that I can reject an apparently attractive result that depends on tuning or revised data. **Success:** every report states eligible sessions, data gaps, cost assumptions, holdout boundary and whether publication timing is verified or assumed. **Happy:** versions appear side by side. **Alternate:** I rerun on a new snapshot while the prior run remains. **Failure:** a protocol changed after viewing holdout results loses the untouched-validation label and is recorded as exploratory.

### Default user stories

N/A: this is a private single-owner application, not a reference/demo app. First-run setup provides an empty state and a documented local import path; no demo accounts or synthetic market data may be mistaken for real results.

### Cross-story impact matrix

| State change | Affected stories | Risk | Rule |
|---|---|---|---|
| US-1.1 imports or pauses | US-1.2, US-2.2, US-3.2 | Partial history appears complete | Coverage is checkpointed; calculation/test readiness checks it. |
| US-1.3 adds a revision | US-2.3, US-3.3 | Earlier outputs silently change | Preserve old snapshots; mark affected outputs stale and create new revisions/runs. |
| US-2.1 activates a version | US-2.2, US-3.2 | Two versions score one session ambiguously | Exactly one active version per indicator/session; old versions remain explicit research choices. |
| US-2.2 publishes late | US-3.2 | Backtest grants an impossible next-session trade | Store actual publication time; late result cannot affect the already opened session. |
| US-3.1 changes a protocol | US-3.2, US-3.3 | Results become irreproducible | New immutable protocol version and new run. |
| US-3.3 explores holdout | US-3.2 | Multiple trials masquerade as one untouched test | Preserve attempt history and exploratory label; require a fresh untouched period for later claims. |

#### Checklist (domain stories)
- [x] Every story has: persona + action + measurable outcome + success criteria
- [x] Every story has alternate and failure paths — happy-path-only stories killed
- [x] Every story traces to a workflow step — no orphan stories
- [x] Identity checkpoint per story — internal or external? What role key?
- [x] No weak stories — vague verbs killed: "manage", "track", "handle", "view data"

#### Checklist (default stories)
- [x] US-0.1: N/A — private single-owner app; no demo accounts
- [x] US-0.2: N/A — no synthetic data presented as market history

---

## 6. User Story Gap Analysis `Architect`

> Map each story to a platform capability. Measure in atomic commits.

| Story | Platform Match | Atomic Commits | Notes |
|-------|---------------|----------------|-------|
| US-1.1 | New Market archive module | 1–6 of WF1 | Provider boundary, resumable import; external entitlement gate. |
| US-1.2 | New Market archive module + Data coverage page | 7–9 of WF1 | Expected vs acquired history and explicit gaps. |
| US-1.3 | New Market archive module | 6, 10 of WF1 | Revisions and stale dependency marking. |
| US-2.1 | New Indicator research module | 1–3 of WF2 | Validated JSON/DSL, activation. |
| US-2.2 | New Indicator research module + Today page | 4–8, 10 of WF2 | Point-in-time cutoff, score, D03 policy, blocked state. |
| US-2.3 | New Indicator research module + History page | 9, 11 of WF2 | Traceable corrections and version detail. |
| US-3.1 | New Indicator research module | 1–2 of WF3 | JSON protocol and run identity. |
| US-3.2 | New Indicator research module | 3–6, 8–9 of WF3 | Separate WIG/ETF simulations and data gates. |
| US-3.3 | New Indicator research module | 7, 10 of WF3 | Holdout/attempt labels and saved-run comparison. |

Mapping ladder outcome for every story: existing feature — none; configuration/seed — none; sanctioned platform extension — none; platform workflow/notification — none; new app code — required. This is grounded in the current lack of application code; the accepted framework is documented separately. Counts refer to shared commit groups in §4 and must not be summed row by row.

The commit boundaries are recorded once in `app-spec-notes/commit-plan.md` and referenced by story above.

#### Checklist
- [x] Every story mapped to a specific platform capability/mechanism with an atomic-commit estimate `PM`
- [x] Every mapping that decides a phase is grounded, or labeled `docs-only` with its catalog source and logged in §10 `Architect`
- [x] Architect checkpoint: story-to-platform mapping verified — simplest solution per story, commit plans saved `Architect`

---

## 7. Phasing & Rollout `PM`

> Phasing logic: high business priority + low gap = ship first.
> Every phase must deliver measurable business value. If you can't state the ROI — the phase is artificial. Merge it or cut it.

### Phase 1: Local GPW history and coverage (WF1)

**Goal:** Owner can import and inspect the full provider-available Main Market and NewConnect history locally, with explicit gaps back toward each market's beginning. **Why first:** Daily scoring and honest backtests need a durable point-in-time archive. Provider entitlement and local-retention rights are an entry gate; the product never claims unavailable records were acquired.

| Stories | What ships | Atomic commits |
|---|---|---:|
| US-1.1–1.3 | Resumable import, revisions, universe reconciliation, local coverage page | 10 |

**Domain criteria (DDD):** raw observations keep source/date/revision/availability; repeat imports are idempotent; delisted instruments remain addressable; corrections produce new snapshots and mark dependent outputs stale; reports show acquired data and import state. **Business criteria (PM):** owner can import and reopen the archive after restart, inspect acquired dates for Main Market/NewConnect, and see why an instrument or action is absent. **Value/ROI:** reusable local research archive with source provenance and visible import limitations. **Historical index constituents:** excluded from the current E02 archive issues by the owner on 2026-11-05; no import or coverage row is required in this phase. A future task must identify an authorized source before adding them. **Estimate:** 10 commits.

### Phase 2: One daily declarative barometer (WF2)

**Goal:** When the Mac and required inputs are available, owner sees one v0 score, D03 posture and allocation by 08:30 before the next GPW session, or an explicit blocked state. After a powered-off interval, startup reconciliation shows a late or blocked result. **Why second:** It uses Phase 1's audited inputs and delivers the first day-to-day decision aid. A daily copper series and all required bindings must pass a coverage sample before activation.

| Stories | What ships | Atomic commits |
|---|---|---:|
| US-2.1–2.3 | JSON/DSL registry, shared calculation, 08:30 scheduling, Today and History | 11 |

**Domain criteria (DDD):** one active immutable definition per indicator/session; result references definition, policy, engine and input snapshot; invalid definitions never activate; no future or stale input crosses the declared cutoff; score maps to exactly one D03 band; revisions are traceable. **Business criteria (PM):** owner sees session, score, posture, allocation, calculation time and freshness; can inspect a correction; can register a new JSON version without editing indicator-specific source code. **Value/ROI:** 100% of eligible sessions with the Mac running are accounted for as published or blocked at 08:30; powered-off sessions are reconciled and labeled late or blocked on startup. Predictive value remains unproven until Phase 3. **Workaround:** if a required series is absent, show a blocked result rather than a partial score. **PM challenge:** a visual formula editor is deferred; JSON registration and read-only version detail suffice. **Estimate:** 11 commits.

### Phase 3: Historical evidence (WF3)

**Goal:** Owner can run and compare a theoretical WIG signal test and a three-ETF execution test, with saved JSON protocols, costs and untouched holdout. **Why third:** Test results depend on an immutable daily definition, source revisions and data coverage from earlier phases.

| Stories | What ships | Atomic commits |
|---|---|---:|
| US-3.1–3.3 | JSON protocol registry, two simulation modes, holdout, charts and audit | 10 |

**Domain criteria (DDD):** every run fixes definition/policy/protocol/snapshot versions; execution-test dates start after all three ETFs exist; transactions occur no earlier than the stated next-session convention; known-at constraints are enforced or limitations labeled; reruns never overwrite prior runs; exploratory variants cannot keep an untouched label. **Business criteria (PM):** owner can see return, maximum drawdown, turnover, cost sensitivity, coverage and baseline for both tests, with the two result types clearly distinguished. **Value/ROI:** 100% of reported runs reproducible from recorded versions and assumptions; the app answers the agreed first question about drawdown and return without promising improvement. **Workaround:** if ETF data are incomplete, the WIG signal report may complete alone but the execution report is blocked and labeled. **PM challenge:** tax optimization and real brokerage integration are deferred; realistic cost scenarios and clear limits are essential. **Estimate:** 10 commits.

Phase completion is binary per workflow; a demo screen with no end-to-end data does not pass.

### Rollout Summary

| Phase | Complete workflow | Estimated commits | External gate |
|---|---|---:|---|
| 1 | WF1 local archive | 10 | Historical-data entitlement and retention rights |
| 2 | WF2 daily v0 | 11 | Verified daily copper, FX, rates and GPW inputs |
| 3 | WF3 historical tests | 10 | Point-in-time and ETF history coverage |
| **Total** | | **31** | Counts exclude procurement and data licensing. |

#### Checklist
- [x] Phases ordered by: business priority × gap score × blocker status
- [x] Each phase delivers a complete, usable increment — no half-done workflows
- [x] Workarounds documented for high-gap blockers (gap >3)
- [x] Total atomic commits estimated per phase `Architect`
- [x] Acceptance criteria per phase: DDD wrote domain criteria, PM wrote business criteria `DDD + PM`
- [x] PM challenged the DDD criteria — over-engineered criteria cut or deferred, essential ones accepted `PM`
- [x] Business value + ROI metric stated per phase — no artificial phases
- [x] No artificial phases — every phase delivers measurable business value. If ROI is unclear, merge with an adjacent phase or cut.

---

## 8. Cross-Spec Conflicts `PM`

| Conflict | Specs involved | Resolution |
|----------|---------------|------------|
| Scope of GPW archive versus first barometer inputs | Product brief; this App Spec | Archive aims at full available GPW history; the first version of the formula may consume only a subset. Coverage is reported for both scopes. |
| Ten posture bands and next-session timing | D03 decision; this App Spec | D03 owns band thresholds; this App Spec owns daily publication and test workflows. Score is not called a calibrated probability. |
| Provider bindings versus technical architecture | Product brief; this App Spec | The platform architecture is accepted; EODHD/GPW/FX and FRED source bindings still require a real account/sample. U.S. Treasury auctions are outside v0. |

#### Checklist
- [x] All related specs listed with what each contributes
- [x] Identity model consistent across specs
- [x] Terminology consistent — matches the glossary
- [x] Shared entities owned by one spec — if two specs reference the same entity, one is the owner
- [x] Every named domain concept in the conflict table matches §1.3 and a workflow/story; no phantom entities `PM`
- [x] Every conflict has a resolution, not "TBD"

---

## 9. Reference App Quality Gate `Architect`

> Only if this project is an example/reference app. N/A otherwise.

N/A. Lesine is a personal research application, not an example app for a chosen software platform. The OpenMercato method governs the planning process only.

---

## 10. Open Questions `PM`

| # | Question | Options | Impact | Owner | Status |
|---|----------|---------|--------|-------|--------|
| Q01 | Can exact provider bindings satisfy accepted v0 at 08:30? | WIG daily close, Main Market bars, daily copper, USD/PLN, FRED DGS2/DGS10; 90% eligible-share breadth coverage; freshness rules in `app-spec-notes/completion-decisions.md` | Phase 2 acceptance gate; missing input blocks score, not this App Spec | Implementer/provider | Product rule decided; live source samples pending |
| Q02 | Does the first JSON test protocol yield reproducible, honestly labeled results? | Next-session close execution, 0/10/30 bp cost scenarios, 0% cash, latest 25% eligible sessions as untouched holdout (minimum 252); details in `app-spec-notes/completion-decisions.md` | Phase 3 acceptance gate, not a performance promise | Implementer/owner | Default approved with the App Spec; variations are new protocol versions |
| Q03 | Which licensed sources cover the target GPW archive and allow local retention? | EODHD first, supplement or replace missing classes with documented sources; never claim unavailable coverage | Phase 1 acceptance gate and possible cost decision | Owner/provider | Source check pending; free EOD tier documents one year of history |
| Q04 | How much Main Market/NewConnect history actually exists in each source? | Acquire all available history from each market's beginning; report acquired dates and source limitations | Phase 1 coverage report, not a reason to truncate the archive to v0's period | Implementer/provider | Product scope decided; actual depth pending |
| Q05 | What local technical base will implement the app? | Angular, NestJS API plus separate TypeScript worker, PostgreSQL canonical history/metadata, checksummed provider-response files, Docker Compose; see [technology decision](research/decisions/2026-11-04-platform-technology.md) | Commit estimates remain provisional after stack revision | Owner/architect | Accepted on 2026-11-04; no OpenMercato software assumed |
| Q06 | How do the two defensive bands treat speculative holdings? | Show the exact D03 posture text; no position tagging or automatic closing in first release | Phase 2 UI copy only | Owner | Decided by first-version no-trading scope; revisit if portfolio holdings are added |
| Q07 | What is the first JSON/DSL grammar? | Restricted typed expression graph with dated source selection, lags, returns, breadth, moving average, percentile and weighted sum; exact schema in feature spec | Phase 2 engineering gate | Architect | Semantic contract decided; syntax deferred |

#### Checklist
- [x] Every question has: options, impact, owner, status
- [x] No BLOCKER question unresolved before its phase starts
- [x] Decided questions have their rationale recorded

---

## Production Readiness `PM`

> Assessed per implementation phase. Updated as phases ship.

| Workflow | Deployable | Blocker | What the client would say |
|----------|-----------|---------|---------------------------|
| WF1 Acquire history | No | Provider entitlement/retention rights and implemented local archive/coverage report | "I cannot tell which GPW data I have locally or what is missing." |
| WF2 Daily barometer | No | Verified daily copper and other source bindings plus implemented JSON/DSL evaluator | "There is no trustworthy result for today's session." |
| WF3 Historical validation | No | Point-in-time evidence/limitations, actual ETF history and implemented versioned test protocol | "The chart could be using information that was not available then." |

#### Checklist
- [x] Each workflow assessed: deployable or not — binary, with the specific blocker
- [x] "What would the client say?" test — the complaint, not the technical gap
- [x] No workflow stops midway — if it can start but can't complete, it's worse than not existing

---

## Changelog

### 2026-11-04
- Drafted the personal GPW market research App Spec from the product brief and owner decisions.
- Recorded v0 mathematics, D03 policy, 08:30 cutoff, full local GPW history target and separate WIG/ETF tests.
- Separated JSON indicator definitions from JSON backtest protocols; added stories, gap mapping and phased acceptance with provider gates.
- Owner confirmed the App Spec. Feature briefs may now be derived; implementation remains subject to the data gates in §10.

**Feature decomposition after confirmation:**

| Feature | Phase | Draws on | Provisional gap | Brief | Spec status |
|---|---:|---|---:|---|---|
| Local GPW history with coverage | 1 | WF1, US-1.1–1.3, Data coverage, Market archive | 10 commits | `briefs/2026-11-04-lesine-gpw-history.md` | Written: `2026-11-04-local-gpw-history-with-coverage.md` |
| Daily declarative GPW barometer | 2 | WF2, US-2.1–2.3, Today/History, Indicator research | 11 commits | `briefs/2026-11-04-lesine-daily-barometer.md` | Written: `2026-11-04-daily-declarative-gpw-barometer.md` |
| Theoretical WIG validation | 3 | WF3, US-3.1–3.3, Tests, Indicator research | Share of Phase 3's 10 provisional commits | `briefs/2026-11-04-lesine-historical-validation.md` | Written: `2026-11-04-theoretical-wig-validation.md` |
| Three-ETF execution validation | 3 | WF3, US-3.1–3.3, Tests, Indicator research | Share of Phase 3's 10 provisional commits | `briefs/2026-11-04-lesine-historical-validation.md` | Written: `2026-11-04-three-etf-execution-validation.md` |

The owner chose two independently deliverable feature specs for WF3. The App Spec's two-test workflow and total provisional Phase 3 estimate remain unchanged; the WIG spec owns shared protocol/replay contracts and the ETF spec extends them.
