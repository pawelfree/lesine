# Lessons

Index of verified, reusable lessons from AI-assisted work. Link detailed notes in [`lessons/`](lessons/) when evidence or recovery steps need more space.

- [Coverage requests and browser cache](lessons/2026-11-05-coverage-ui-async-cache.md): discard stale HTTP responses before any side effect, and validate cached report shape and timestamp before rendering it.
- [Rolling provider windows](lessons/2026-11-06-rolling-provider-window.md): recheck persisted request dates immediately before a quota-limited provider call; a job planned yesterday can fall outside today's entitlement window.
