# Claude project instructions

@AGENTS.md

Follow `AGENTS.md` for all project work. It is the canonical source for the AI artifact workflow; this file exists so Claude-compatible tooling discovers the same rules.

## Required AI artifact structure

```text
.ai/
├── specs/YYYY-MM-DD-slug.md
├── specs/implemented/YYYY-MM-DD-slug.md
├── specs/archive/YYYY-MM-DD-slug.md
├── runs/YYYY-MM-DD-slug.md
├── lessons.md
└── lessons/YYYY-MM-DD-slug.md
```

Use lowercase hyphen-separated slugs and the exact `YYYY-MM-DD-slug.md` filename format. Never replace an existing dated artifact.

Every spec, run log, and lesson record must start with YAML front matter containing at least `type`, `date`, and `slug`. Specs also require `status`; run logs require `status`.

Before substantial implementation, consult or create the relevant SDD spec. After implementation, verification, or archival, move the spec to the appropriate lifecycle directory while preserving its content. Every autonomous run must leave a log in `.ai/runs/` covering its objective, decisions, changes, verification, and blockers. Record durable findings in `.ai/lessons/` and index them from `.ai/lessons.md`.

Do not record secrets or sensitive personal data in any `.ai` artifact. See `AGENTS.md` for the complete workflow and metadata templates.
