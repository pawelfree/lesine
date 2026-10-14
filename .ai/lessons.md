# Lessons learned

This file is the concise index of durable findings for AI-assisted project work. Store detailed lessons in `.ai/lessons/` using the filename format `YYYY-MM-DD-slug.md`.

## Index

<!-- Add entries as: - [YYYY-MM-DD-slug](lessons/YYYY-MM-DD-slug.md) — concise finding -->
- [2026-10-14-agent-browser-cli-for-ci](lessons/2026-10-14-agent-browser-cli-for-ci.md) — `agent-browser` is an AI-agent-interactive CLI, not a test framework; wrap it in `child_process` calls asserted from Jest, and use plain HTTP for unauthenticated Basic-Auth checks (native dialog risk).
