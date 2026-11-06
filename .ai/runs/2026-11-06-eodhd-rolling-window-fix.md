# EODHD Free rolling-window import fix

Goals: Prevent stale one-year EOD requests from spending provider calls; allow a fresh incremental import that reuses archived ranges.
Spec: [Quota-efficient EODHD import batches](../specs/implemented/2026-11-05-eodhd-efficient-import-batches.md)
Status: done

## Commit log

2026-11-06 — Guard stale Free-plan EOD chunks before quota reservation, offer a fresh import with current dates, and document the observed failure.
Decision: retain completed manifests and the failed job; a new incremental job excludes archived ranges and ends on the previous UTC day.
Verification: Node 24 build, worker and web tests, isolated PostgreSQL regression, Compose health and unchanged provider-call counter passed.
Remaining: none after this commit is pushed.
