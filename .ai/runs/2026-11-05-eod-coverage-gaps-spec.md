# EOD coverage and gap view specification

Goals: Specify issue #5's EOD coverage API and `/data` gap view; publish and review the design PR, correcting actionable findings.
Specification: [2026-11-05-eod-coverage-gaps.md](../specs/2026-11-05-eod-coverage-gaps.md)
Status: done

2026-11-05 — Drafted the EOD-only coverage report, API, UI states and phased implementation plan for issue #5.
Decision: preserve retained identities, persist report generations, and label unverified date intervals honestly; a fresh-context review clarified refresh and filter contracts.
Verification: documentation and link checks; no runtime code changed. Remaining: publish the spec PR, post assumptions, and hand back the issue.

2026-11-05 — Published ready spec PR #22, posted the defaults and SDLC rationale, and handed issue #5 back to its author.
Decision: use the accepted text wireframe; no new visual evidence was possible without a prepared test-environment descriptor.
Verification: PR and issue comments are visible on GitHub; remaining: human review/merge and separate implementation.

2026-11-05 — Corrected PR #22 after a specification review found two contract gaps and a source-freshness ambiguity.
Decision: fingerprint every coverage input, preserve the parent no-report response, and separate calculation time from last EOD acquisition.
Verification: Markdown links and diff checks; no runtime code changed. Remaining: publish correction, re-review and release the PR claim.

2026-11-05 — Published correction 88888e3 and the clean design re-review on PR #22; released the review lock.
Decision: GitHub refused formal self-approval, so the PR remains labeled `review` for an independent reviewer.
Verification: local links, JSON example and diff checks passed; no CI checks reported. Remaining: independent approval/merge and separate implementation.
