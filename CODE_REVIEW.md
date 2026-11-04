# Code review

## Priorities

1. Check that the change does what its issue or PR says, including failure paths.
2. Check security risks introduced by new inputs, permissions, data handling, and dependencies.
3. Check changes to any public contract against `BACKWARD_COMPATIBILITY.md`.
4. Confirm that the PR describes how it was verified.

## Repository-specific checks

This repository has no application code, tests, or CI yet. When those are added, record stack-specific review rules here and add validation commands to `.ai/agentic.config.json`. An empty validation gate is not a passed test suite.

## Severity

- **Blocker:** data loss, exploitable security issue, or a broken required contract or merge gate.
- **Major:** likely user-facing defect or missing verification for a high-risk change.
- **Minor:** maintainability or clarity issue with a limited effect.

Use the risk and priority labels defined in `.ai/agentic.config.json`; they describe different things.
