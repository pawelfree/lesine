#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
project="${LESINE_COMPOSE_PROJECT:-lesine}"
compose=(docker compose -p "$project")
command="${1:-}"
bundle="${2:-}"
if [[ "$command" != backup && "$command" != restore || -z "$bundle" ]]; then
  echo 'Usage: scripts/archive.sh backup|restore /absolute/bundle-directory' >&2
  exit 2
fi
if [[ "$bundle" != /* ]]; then echo 'Bundle path must be absolute' >&2; exit 2; fi

"${compose[@]}" up -d --wait db
"${compose[@]}" build worker

if [[ "$command" == backup ]]; then
  if [[ -e "$bundle" ]]; then echo 'Backup destination already exists' >&2; exit 2; fi
  legacy_schema="$("${compose[@]}" exec -T db psql -U lesine -d lesine -Atc \
    "SELECT to_regclass('public.raw_file_manifests') IS NULL")"
  mkdir -p "$(dirname "$bundle")"
  temporary="$(mktemp -d "$(dirname "$bundle")/.lesine-backup.XXXXXX")"
  cleanup_backup() {
    if [[ -d "$temporary" ]]; then rm -rf -- "$temporary"; fi
    if [[ "$legacy_schema" == f ]]; then
      "${compose[@]}" up -d --wait api worker >/dev/null || true
    else
      echo 'Pre-manifest database: API and worker remain stopped; deploy the upgraded stack after checking the backup.' >&2
    fi
  }
  trap cleanup_backup EXIT
  "${compose[@]}" stop api worker
  "${compose[@]}" exec -T db pg_dump -U lesine -d lesine --format=custom --no-owner --no-acl > "$temporary/database.dump"
  "${compose[@]}" run --rm --no-deps -v "$temporary:/backup" worker \
    node apps/worker/dist/archive-cli.js export /backup
  mv -- "$temporary" "$bundle"
  echo "Verified backup: $bundle"
else
  if [[ ! -d "$bundle" ]]; then echo 'Backup directory does not exist' >&2; exit 2; fi
  "${compose[@]}" stop api worker
  "${compose[@]}" run --rm --no-deps -v "$bundle:/backup:ro" worker \
    node apps/worker/dist/archive-cli.js check-bundle /backup
  table_count="$("${compose[@]}" exec -T db psql -U lesine -d lesine -Atc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
  if [[ "$table_count" != 0 ]]; then
    echo 'Restore requires an empty database; existing data was not changed' >&2
    exit 1
  fi
  "${compose[@]}" run --rm --no-deps -v "$bundle:/backup:ro" worker \
    node apps/worker/dist/archive-cli.js restore-files /backup
  "${compose[@]}" exec -T db pg_restore -U lesine -d lesine --exit-on-error --no-owner --no-acl < "$bundle/database.dump"
  "${compose[@]}" run --rm --no-deps worker node apps/worker/dist/archive-cli.js verify
  "${compose[@]}" up -d --wait api worker
  echo 'Restore verified; API and worker restarted'
fi
