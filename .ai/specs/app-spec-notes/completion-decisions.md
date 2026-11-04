# App Spec completion decisions — proposed defaults for review

These decisions complete the product contract without claiming that provider access or predictive performance has been verified. They are proposed by the assistant for the owner's Phase 5 confirmation; changing a default later creates a new version, not a rewrite of a saved run.

## First indicator readiness

- The accepted v0 mathematics and D03 policy are separate immutable JSON versions.
- Required logical series: WIG daily close, historical Main Market ordinary-share bars and listing identity, a daily copper market price or daily investable proxy, USD/PLN daily close, FRED DGS2 and DGS10. Exact provider symbols are adapter bindings and must pass a source sample/rights check before activation. EODHD's monthly `COPPER` endpoint does not qualify.
- At the 08:30 Europe/Warsaw cutoff before the next GPW session, choose only complete values known then. WIG and GPW bars must be from the immediately prior GPW session; copper and USD/PLN may be no older than one GPW session; DGS2/DGS10 may be no older than three GPW sessions because US holidays differ. If any required input is older or unproven, mark the result blocked rather than silently rebalance weights.
- For breadth, report the point-in-time Main Market universe count, shares with a valid 200-price SMA, and missing-price count. Require at least 90% of shares that had already accumulated 200 listed sessions to have valid data. New listings with fewer than 200 sessions are reported separately and do not enter the breadth denominator.
- The archive aims to retain all available Main Market and NewConnect history from each market's beginning, including later-delisted shares and corporate actions. The coverage report distinguishes desired, provider-available and acquired data. A provider gap does not delete an instrument from the expected universe.

## First JSON backtest protocols

- Signal test: theoretical WIG-index exposure, compare D03 daily allocation with constant 100% WIG exposure. This is an index-level research result, not a purchasable portfolio.
- Execution test: three-ETF basket (BETA ETF WIG20TR, mWIG40TR, sWIG80TR) from the first period when all three actually traded. The owner supplies basket weights in each validated JSON protocol; this App Spec does not prescribe a global weighting. The fixed-exposure baseline holds the **same basket weights** at 100% equity, so the comparison isolates the allocation signal. A different weighting creates another protocol version and run.
- A score for session `t` is known by 08:30 before session `t+1` only if all input gates pass. The first simulated allocation change uses the **close of `t+1`**, so the first affected close-to-close return begins after that close. This conservative EOD convention avoids crediting the strategy with returns before it could act; it is not a promise of a real closing-price fill.
- Transaction-cost sensitivity: 0, 10 and 30 basis points of one-way traded notional. Cash earns 0% in the default research protocol. ETF returns use recorded prices and corporate actions without adding fund expense ratios again to market-price returns. Actual brokerage terms, spread and tax are outside the first research result and must be disclosed.
- Each test reserves the latest 25% of eligible sessions as untouched evaluation, provided it contains at least 252 sessions; otherwise report insufficient holdout rather than a validated result. Formula and protocol versions are fixed before looking at that period. Every attempted variant remains logged; repeated exploration does not become independent validation.
- Report CAGR or annualized return, total return, maximum drawdown, turnover, cost sensitivity, number of active sessions, missing-session count and benchmark difference. No positive-performance promise is an acceptance criterion; the first outcome is a reproducible comparison.

## Local application base

Lesine is greenfield. The App Spec assumes one local process with a browser interface, loopback-only access, a local metadata store and local columnar time-series files, plus scheduled/import jobs. Python is the proposed calculation/runtime language because the shared DSL interpreter and historical research live in one process; exact web framework and storage libraries belong to feature specs. No OpenMercato software platform is assumed. All §4 capability gaps are therefore new app work unless a selected dependency is verified in a later feature spec.

## Remaining external gates

1. Obtain provider access and verify historical depth, daily copper symbol, GPW Main Market/NewConnect listings, delisted instruments, actions, index membership and local-retention terms. The documented EODHD free EOD tier exposes only one year; a paid or alternate source is required for the full-history goal. See `data-feasibility.md`.
2. Verify historical publication timing. If exact timestamps cannot be recovered, label historical tests as using a conservative release-lag assumption rather than claiming fully observed point-in-time inputs.
3. Verify tradable ETF price/action history from the first common listing date. No synthetic pre-listing ETF results.
