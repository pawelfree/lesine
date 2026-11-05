# Code review

## Priorities

1. Check that the change does what its issue or PR says, including failure paths.
2. Check security risks introduced by new inputs, permissions, data handling, and dependencies.
3. Check changes to any public contract against `BACKWARD_COMPATIBILITY.md`.
4. Confirm that the PR describes how it was verified.

## Repository-specific checks

The repository has Angular, NestJS, a TypeScript worker and PostgreSQL migrations. Run the configured build gate in `.ai/agentic.config.json`; for changes to background jobs or data publication, run focused database integration tests in isolated Compose. For UI changes, verify loading, failure, confirmation and keyboard behavior in a browser. Remove the temporary Compose project and volumes after verification.

## Severity

- **Blocker:** data loss, exploitable security issue, or a broken required contract or merge gate.
- **Major:** likely user-facing defect or missing verification for a high-risk change.
- **Minor:** maintainability or clarity issue with a limited effect.

Use the risk and priority labels defined in `.ai/agentic.config.json`; they describe different things.
