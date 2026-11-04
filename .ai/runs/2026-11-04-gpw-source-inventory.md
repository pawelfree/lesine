# GPW source inventory

Goals: Implement issue #3 in an isolated worktree, covering its empty Data view, source inventory, bounded source probe and safe local access.
Spec: [Local GPW history with coverage](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: done

## Commit log

2026-11-04 — Add a resumable plan for issue #3 and this task journal.
Decision: scope this implementation to E01-S01 and tasks #8–#9; the shared spec's later import and archive phases remain separate issues.
Remaining: implement, verify, review and publish the issue #3 flow.

2026-11-04 — Implement the local Data view, source catalog schema, bounded worker probe and access guard.
Decision: keep WAR market classification unclassified and require a manual probe with a persisted daily budget; do not fetch on restart.
Verification: Node and Angular tests, full build, and isolated Compose checks including a fake-provider database probe passed.
Remaining: review the PR, address findings, finish UI evidence if a browser is available, and mark the run complete.

2026-11-04 — Mark all planned implementation steps complete and attach PR #12 to the tracking plan.
Decision: real EODHD access remains an acceptance evidence gate (Q06), so the report keeps rights and full-history status unverified.
Remaining: run the review loop, address findings and finalize the PR handoff.

2026-11-04 — Fix review findings: reject malformed CSRF input, avoid repeat catalog calls, serialize probes and ignore stale UI filter responses.
Decision: use forward-only migration replay checks and live HTTP denial tests as integration evidence; source account access remains unverified.
Verification: full build, unit tests, isolated PostgreSQL migration and provider-stub tests, and HTTP boundary tests passed.
Remaining: publish the review-fix commit, finalize PR labels/body and arrange manual UI QA.

2026-11-04 — Prioritize active and delisted catalog calls before optional depth probes under the default two-call budget.
Decision: reserve the limited Free-tier allowance for both source lists; representative depth checks wait for an explicitly larger local budget.
Verification: full build and a database integration case for both two-call and eight-call budgets passed.
Remaining: finalize PR review handoff and manual UI/source-account acceptance.

2026-11-04 — Finalize the implementation handoff on ready PR #12 with review notes, SDLC labels and manual QA instructions.
Decision: the code task is done; independent review, manual UI QA and real-account Q06 evidence remain downstream acceptance gates.
Verification: the final configured build passed; no automated GitHub checks were reported on the PR.
Remaining: reviewers perform QA and approve; the epic keeps the real-source completeness gate open.

2026-11-04 — Restore shared styles for the Data page after browser screenshot QA exposed missing component styling.
Decision: register app.css as a global Angular stylesheet so routed components receive the shared page styles.
Verification: full build, unit tests, desktop and mobile browser screenshots, and the delisted filter check passed.
Remaining: independent review, manual acceptance and real-account Q06 evidence remain PR gates.
