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
