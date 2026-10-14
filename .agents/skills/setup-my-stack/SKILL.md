---
name: setup-my-stack
description: Import or create an application in this Custom sandbox, install its stack, configure platform services, and start a working preview.
---

# Setup my stack

Set up the application requested by the user in `/workspace`. Do the work instead of narrating commands, and do not ask the user to install or start anything.

The workspace preview on `0.0.0.0:3000` is the only supported way for an application to expose an HTTP or HTTPS endpoint from this sandbox. Configure the application's externally reachable web server through that preview and do not expose a different application port.

## Choose the source

- When the user supplies a repository URL or `owner/name`, import that repository.
- When the user describes a new app or supplies no repository, scaffold it locally in `/workspace`. A GitHub repository is optional.
- GitHub authentication is not a prerequisite for stack setup. Public Git URLs work with `git clone`. Ask for `gh auth login` only if a private repository cannot be read without it, or if the user explicitly asks you to create or push a GitHub repository.

## Validate and clarify the stack

- Interpret the user's description into a concrete stack before changing the workspace. Verify framework and runtime compatibility, required versions, package-manager expectations, build commands, data stores, and other external service requirements against the imported project or authoritative project documentation when available.
- Identify missing, ambiguous, or conflicting choices that would materially change the implementation. Ask concise, stack-specific questions to resolve those choices before proceeding. Do not ask about details that can be safely inferred from the project or established defaults.
- If the request is already precise and compatible, state the interpreted stack briefly and proceed without an unnecessary confirmation round.
- Install the additional runtimes, system packages, libraries, CLIs, and local services the verified stack needs. Reuse the sandbox's PostgreSQL and Redis services when compatible. Configure and run any other required local services as workspace processes; do not silently substitute a different technology.

## Execute

1. Read `/workspace/openmercato.toml`. Keep it at version 2: commands only, with no `env`, `port`, or `cwd` properties. The preview command must bind `0.0.0.0:3000`; adapt frameworks that default to another host or port.
2. For an import, clone into a temporary directory because `/workspace` is not empty. Prefer plain `git clone` for a supplied URL. Overlay the project and its `.git` into `/workspace`, replacing the bootstrap files and manifest.
3. For a new app, replace the bootstrap files and scaffold directly in `/workspace`. Do not initialize or publish a GitHub repository unless the user asks for one.
4. Inspect the package manager, scripts, build and migration requirements, listen address, and service dependencies. Install all required application libraries, runtimes, system packages, CLIs, and additional local services yourself.
5. Reuse the platform PostgreSQL and Redis when they match the requested stack. If the user chooses another service or database, such as MySQL, install and configure it in the workspace and add its long-running command as a named `[[processes]]` entry. Do not silently substitute a different database. Configure compatible platform services with:
   - `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/open-mercato`
   - `REDIS_URL=redis://:redis-dev-password@127.0.0.1:6379/1`
   Run required migrations and seeds against those services; use `workspace-postgres wait` when needed.
6. Write `openmercato.toml` with `prepare` commands for dependency installation/build steps and a `[preview].command` that serves on `0.0.0.0:3000`.
7. Apply the new manifest with `workspace-agent-cli start`. Do not use only `control v1 restart preview` after changing prepare or command argv.
8. Verify the preview responds, diagnose failures, and retry until it works.
9. Only when GitHub publication was requested: check `command -v gh` and `gh auth status --hostname github.com`. If authentication is missing, ask the user once to run `gh auth login`; afterward run `gh auth setup-git --hostname github.com`, preserve imported history, and create/push the requested repository.
