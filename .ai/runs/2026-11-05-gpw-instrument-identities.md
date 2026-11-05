# GPW instrument identities

Goals: Implement the dated, owner-attested identity map and open a reviewed implementation PR.
Specification: [2026-11-05-gpw-instrument-identities.md](../specs/2026-11-05-gpw-instrument-identities.md)
Status: in-progress

2026-11-05 — Commit adds the resumable implementation plan before runtime changes.
Decision: use a separate worktree and PR for this capability; the spec remains in design PR #26.
Remaining: schema, validation/import, archive integration, read API, tests and review.

2026-11-05 — Commit implements immutable batches, local JSON validation/import, archive retention and read-only API.
Decision: migration 009 is independent of the separate action migration 008; repeated evidence files keep old batches.
Pitfall: macOS /private/tmp canonicalization required checking both lexical and real input paths.
Remaining: formal review, any fixes and final PR status.

2026-11-05 — Commit records completed plan steps 1.1–3.1 after implementation commit fc8b8f7.
Decision: full build, isolated database tests and Compose smoke passed; temporary infrastructure was removed.
Remaining: code review, findings if any, and PR completion.

2026-11-05 — Commit rejects duplicate JSON keys and ambiguous overlapping uses of the same provider symbol.
Decision: compatibility notes now name the new CLI, API and private evidence mount.
Remaining: finish PR review and publish final verification evidence.

2026-11-05 — Final commit marks plan complete after build, PostgreSQL tests, Compose smoke and technical review.
Correction: duplicate-key and symbol-collision checks were in fc8b8f7; 9cf4d2c added compatibility notes.
Decision: GitHub rejected native author approval; PR #28 needs independent review and QA before merge.
Remaining: reviewer and QA gates outside this implementation task.

2026-11-05 — Commit adds the snapshot-to-identity-batch foreign key when migration 010 ran first.
Decision: migration 010 adds the same constraint when 009 ran first.
Remaining: cross-order test, re-review and final PR update.
