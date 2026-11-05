# Issue #6 specifications

Goals: Define independently implementable corporate-action, instrument-identity and point-in-time snapshot capabilities for issue #6, excluding historical index constituents.
Specifications: [actions](../specs/2026-11-05-gpw-corporate-actions.md), [identities](../specs/2026-11-05-gpw-instrument-identities.md), [snapshots](../specs/2026-11-05-point-in-time-archive-snapshots.md)
Status: done

2026-11-05 — Add three phased specifications, data-model views and alignment with the parent archive spec.
Decision: identity links come from an owner-reviewed local evidence file; unknown publication times stay explicit.
Verification: reviewed current migration/API contracts, official EODHD fields and independent scope-cohesion findings.
Remaining: implement and review the three capabilities under issue #6.

2026-11-05 — Align the parent archive diagram and identity/snapshot descriptions with the implemented EOD schema during PR #26 review.
Decision: distinguish existing archive records from proposed capabilities and label identity links owner-attested.
Verification: compared the parent spec with migrations 001–007 and all three child specifications; documentation diff checked.
Remaining: finish the specification review and land the PR through its normal gates.
