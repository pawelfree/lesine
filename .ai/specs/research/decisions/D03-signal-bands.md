# D03 — Original score and posture bands

- Date, owner: 2026-11-04; product owner (requester)
- Context: the original PW barometer formula is unavailable in the supplied material. The owner chose an original 0–100 score for the broad Polish stock market and supplied these posture bands for the first indicator.
- Decision: map the score to a named posture and suggested equity allocation as below. These allocations are a proposed signal to validate historically, not a measured optimal policy. The data-ingestion and feature-engineering diagram in the supplied data proposal is a separate candidate architecture, not part of this confirmed mapping. At a shared boundary, use the higher band: 70.00 belongs to 70–75; 75.00 remains in 70–75 because the top band is >75. The meaning of speculative positions remains open in Q04 of the product brief.
- Why: the owner wants both a market assessment and an action-oriented signal.
- Consequences: historical tests must evaluate the allocation scheme separately from score quality, using only data available at each decision time. A 0–100 score must not be labeled a probability without calibration evidence.
- Revisit: after the first out-of-sample validation or when the owner changes the scope.
- Status: active; superseded by: none.
- Source: owner, conversation on 2026-11-04; supplied data proposal §6.

| Score | Posture | Suggested equities |
|---|---|---:|
| >75 | Ultra offensive | 100% |
| 70–75 | Decisively offensive | 90% |
| 65–70 | Offensive | 80% |
| 60–65 | Moderately offensive | 70% |
| 55–60 | Neutral | 60% |
| 50–55 | Moderately defensive | 50% |
| 45–50 | Defensive; consider closing speculative positions | 50% |
| 40–45 | Decisively defensive; close speculative positions | 40% |
| 35–40 | Ultra defensive | 30% |
| <35 | High bear-market risk | 20% |


## Candidate architecture (not yet adopted)

The supplied data-source document proposes EODHD as the primary source, with FRED and U.S. Treasury connectors. Store raw observations with their frequency and publication timestamps, derive 5/20/60-session changes, trends, spreads and liquidity features, then combine them into a market-risk score and detect regime changes. Verify series coverage, release timing, revision history, and account-plan access before adopting this design.
