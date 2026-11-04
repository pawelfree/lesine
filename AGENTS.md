# Repository instructions

`lesine` currently contains a one-line README and no application code, tests, or CI. The project purpose and technical stack are still to be documented.

| When the task involves… | Read first | Key rules |
|---|---|---|
| Project scope or new implementation | `README.md` | TODO: document the product and stack before choosing implementation conventions. |
| Agent pipeline or tracker workflow | `.ai/agentic.config.json`, `SDLC.md` | Keep the configuration and process document aligned. |
| Code review | `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md` | Apply the documented review and compatibility rules. |
| Validation or CI | `.ai/agentic.config.json` | No validation commands are configured yet; add real checks when the stack exists. <!-- discovery:routing-start --> |
| Product discovery, a brief, or a backlog | `.ai/specs/product-brief.md`, `.ai/specs/research/`, `.ai/specs/backlog.md`, `SDLC.md` | Apply the Definition of Ready and protected product decisions in `SDLC.md`; treat synthetic personas as hypotheses. <!-- discovery:routing-end --> |

The configured validation gate is currently empty. Do not treat that as evidence that a change has been tested.

When spawning agents for simple tasks, use lower models and efforts.
