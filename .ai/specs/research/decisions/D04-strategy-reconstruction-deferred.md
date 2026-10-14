# D04 — Reconstructing the advisor's strategy, and building/testing own strategies, wait until after the MVP

- Date, owner: 2026-10-14, product owner (self)
- Context and the options weighed: the product owner wants to eventually (a) reverse-engineer the decision rules the external advisor appears to follow from the portfolio history, and (b) build and backtest the team's own reference strategies. Both require the MVP's extraction and tracking pipeline to exist first and were explicitly described as "a next step."
- Decision and why: the MVP (D02) only ingests, stores, and tracks performance and sentiment; it does not attempt rule detection or strategy backtesting. Strategy reconstruction and own-strategy work start after the MVP pipeline is working.
- Consequences, and what would make us revisit it: keeps the MVP scoped to what can be measured now. The product owner set an explicit kill criterion for the reconstruction attempt: if no reasonable agreement between the reconstructed rules and the advisor's actual decisions emerges after a longer evaluation period, abandon that method (the exact duration was not quantified — see the product brief's Open questions).
- Status: active
