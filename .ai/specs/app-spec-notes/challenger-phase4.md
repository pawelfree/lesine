# Phase 4 rollout challenger

Execution: sequential fallback. Review inputs: App Spec §7, §1.3 glossary, and `challenger-prompt.md`.

## CRITICAL

- None remaining after the protocol-weight correction. Phase 3 requires an explicit JSON protocol per run, so no hidden ETF weighting is baked into the app.

## WARNING

- Phase 1's full-history aspiration depends on provider rights and historical depth outside this repository. Acceptance requires a coverage report and local retention of all *available* data; it must never claim that absent vendor history was imported.
- Phase 2 cannot publish a trustworthy v0 until a daily copper binding, GPW history and timing/freshness evidence pass. The blocked state is part of the usable workflow, but a permanently blocked result does not count as Phase 2 delivery.
- Phase 3's holdout can be too short if the ETF overlap begins late. The protocol requires at least 252 sessions and reports insufficient evidence otherwise.

## OK

- Three phases each deliver one complete owner task and a measurable operational outcome.
- Acceptance criteria protect data lineage, definition immutability and historical execution timing while deferring portfolio tracking and brokerage orders.
