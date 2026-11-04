# Resumable EOD import — issue #10

Goals: Deliver durable quota-aware EODHD import jobs, safe restart and lease fencing, and visible job progress.
Spec: [Local GPW history with coverage](../specs/2026-11-04-local-gpw-history-with-coverage.md)
Status: in-progress

## Commit log

2026-11-04 — Add the execution plan for issue #10 and this task journal.
Decision: scope work to the durable EOD import task; immutable revisions and full coverage remain follow-up issues.
Remaining: implement, verify, review and publish the import PR.
