# Repository instructions

`lesine` is a greenfield application with an initial Angular/NestJS/PostgreSQL shell. Product decisions are in `.ai/specs/`; the accepted stack is in [the technology decision](.ai/specs/research/decisions/2026-11-04-platform-technology.md). Market data and indicator features are not implemented yet.

| When the task involves… | Read first | Key rules |
|---|---|---|
| Project scope or new implementation | `README.md`, `.ai/specs/2026-11-04-app-spec-lesine.md`, `.ai/specs/research/decisions/2026-11-04-platform-technology.md` | Use the accepted product rules and technology decision; check the relevant feature spec before coding. |
| Agent pipeline or tracker workflow | `.ai/agentic.config.json`, `SDLC.md` | Keep the configuration and process document aligned. |
| Code review | `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md` | Apply the documented review and compatibility rules. |
| Validation or CI | `.ai/agentic.config.json`, `README.md` | Run the configured build check with supported Node.js 24.15+; use Docker Compose for the local smoke test. <!-- discovery:routing-start --> |
| Product discovery, a brief, or a backlog | `.ai/specs/product-brief.md`, `.ai/specs/research/`, `SDLC.md` | Apply the Definition of Ready and protected product decisions in `SDLC.md`; treat synthetic personas as hypotheses. <!-- discovery:routing-end --> |
| Writing or resuming a specification | `.ai/specs/` | Name each specification `YYYY-MM-DD-slug.md`; keep active specs in `.ai/specs/`, completed ones in `.ai/specs/implemented/`, and superseded or abandoned ones in `.ai/specs/archive/`. Preserve the filename when moving it. |
| Starting, resuming, or committing an AI-assisted task | `.ai/runs/` | Use the single task journal described below; read it before resuming and update it in the same commit as the work it records. |
| Recording a reusable lesson | `.ai/lessons.md`, `.ai/lessons/` | Add a concise index entry and, when detail is useful, a linked note under `.ai/lessons/`. |

## AI work records

### Specifications

Store SDD specifications in `.ai/specs/` with the filename `YYYY-MM-DD-slug.md`. The date is the day the specification is first created. Move an implemented specification to `.ai/specs/implemented/` after its work is complete; move a superseded or abandoned specification to `.ai/specs/archive/`. Keep its original filename and update links that point to it. Briefs, research, assets, and other supporting material may remain in their own subdirectories.

### Task journals

For each AI-assisted task that reaches a commit, create `.ai/runs/YYYY-MM-DD-slug.md` **before its first commit** and stage it with that commit. Use the task's start date in the filename. Before resuming or taking over a task, search `.ai/runs/` for its existing journal and read it; continue that file across sessions and dates. Keep its filename fixed and never create a continuation journal for the same task.

Keep a stable header at the top with the task title, current goals, a link to its specification when one exists, and exactly one status line: `Status: in-progress` or `Status: done`. Update the header goals and status as work changes; set `done` only after the task is complete.

Before **every commit** for that task, append one 2–5 line entry at the end of the same journal stating the date, what the commit covers, decisions or pitfalls, and remaining work. Stage the entry in the commit it describes. Earlier entries are append-only; edit only the header when goals or status change. Check the staged diff for the journal entry before committing. A task without a commit does not need a journal yet.


### Lessons

Use `.ai/lessons.md` as the index of reusable findings. Add a short finding with a link to a detailed Markdown note in `.ai/lessons/` when context, evidence, or a recovery procedure matters. Record lessons after a verified bug fix or an observed process improvement; do not treat guesses as established lessons.

The configured build gate checks compilation. It does not replace a running Compose smoke test for runtime changes. Follow `SDLC.md`'s PR test environment cleanup rule after every PR smoke test, including failed or interrupted runs.

When spawning agents for simple tasks, use lower models and efforts.
