#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-${project_root}/.env}"
output_dir="${1:-${project_root}/backups}"

if [[ ! -f "${env_file}" ]]; then
  echo "Environment file not found: ${env_file}" >&2
  echo "Set ENV_FILE or create .env before backing up." >&2
  exit 1
fi

mkdir -p "${output_dir}"
umask 077
timestamp="$(date '+%Y%m%d-%H%M%S')"
backup_file="${output_dir}/backup-${timestamp}.sql"
temporary_file="${backup_file}.tmp"

if [[ -n "${COMPOSE_BIN:-}" ]]; then
  compose=("${COMPOSE_BIN}" --env-file "${env_file}" --project-directory "${project_root}")
elif docker compose version >/dev/null 2>&1; then
  compose=(docker compose --env-file "${env_file}" --project-directory "${project_root}")
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose --env-file "${env_file}" --project-directory "${project_root}")
else
  echo "Docker Compose was not found." >&2
  exit 1
fi

echo "Creating a transaction-consistent MySQL backup..."
if ! "${compose[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump \
    --single-transaction --quick --routines --triggers --no-tablespaces \
    --default-character-set=utf8mb4 -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  >"${temporary_file}"; then
  rm -f "${temporary_file}"
  echo "Backup failed; no backup file was kept." >&2
  exit 1
fi

mv "${temporary_file}" "${backup_file}"
echo "Backup created: ${backup_file}"
