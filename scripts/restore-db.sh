#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-${project_root}/.env}"
backup_file=""
assume_yes=false

usage() {
  echo "Usage: $0 <backup.sql> [--yes]" >&2
}

for argument in "$@"; do
  case "${argument}" in
    --yes)
      assume_yes=true
      ;;
    -*)
      usage
      exit 2
      ;;
    *)
      if [[ -n "${backup_file}" ]]; then
        usage
        exit 2
      fi
      backup_file="${argument}"
      ;;
  esac
done

if [[ -z "${backup_file}" || ! -f "${backup_file}" ]]; then
  usage
  exit 2
fi

if [[ ! -f "${env_file}" ]]; then
  echo "Environment file not found: ${env_file}" >&2
  exit 1
fi

database_line="$(sed -n 's/^[[:space:]]*MYSQL_DATABASE[[:space:]]*=[[:space:]]*//p' "${env_file}" | tail -n 1)"
MYSQL_DATABASE="${database_line%$'\r'}"
MYSQL_DATABASE="${MYSQL_DATABASE#\"}"
MYSQL_DATABASE="${MYSQL_DATABASE%\"}"
MYSQL_DATABASE="${MYSQL_DATABASE#\'}"
MYSQL_DATABASE="${MYSQL_DATABASE%\'}"

if [[ -z "${MYSQL_DATABASE}" ]]; then
  echo "MYSQL_DATABASE is not set in ${env_file}" >&2
  exit 1
fi

if [[ "${assume_yes}" != true ]]; then
  if [[ ! -t 0 ]]; then
    echo "Interactive confirmation is required; use --yes only after reviewing the restore plan." >&2
    exit 1
  fi
  echo "WARNING: this will replace the contents of database '${MYSQL_DATABASE}'."
  read -r -p "Type the database name to continue: " confirmation
  if [[ "${confirmation}" != "${MYSQL_DATABASE}" ]]; then
    echo "Restore cancelled."
    exit 1
  fi
fi

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
safety_dir="${project_root}/backups/pre-restore"

echo "Creating a safety backup before restore..."
ENV_FILE="${env_file}" "${project_root}/scripts/backup-db.sh" "${safety_dir}"

restart_services() {
  "${compose[@]}" up -d backend frontend >/dev/null 2>&1 || true
}
trap restart_services ERR

echo "Stopping application writes..."
"${compose[@]}" stop frontend backend

echo "Restoring ${backup_file} into ${MYSQL_DATABASE}..."
"${compose[@]}" exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql \
    --default-character-set=utf8mb4 -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  <"${backup_file}"

echo "Starting backend (migrations and idempotent Seed run on startup) and frontend..."
"${compose[@]}" up -d backend frontend

deadline=$((SECONDS + 180))
while (( SECONDS < deadline )); do
  backend_id="$("${compose[@]}" ps -q backend)"
  frontend_id="$("${compose[@]}" ps -q frontend)"
  backend_health="$(
    [[ -n "${backend_id}" ]] &&
      docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${backend_id}" 2>/dev/null || true
  )"
  frontend_health="$(
    [[ -n "${frontend_id}" ]] &&
      docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "${frontend_id}" 2>/dev/null || true
  )"
  if [[ "${backend_health}" == "healthy" && "${frontend_health}" == "healthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "${backend_health:-}" != "healthy" || "${frontend_health:-}" != "healthy" ]]; then
  echo "Services did not become healthy after restore." >&2
  exit 1
fi
trap - ERR

echo "Restore completed. Verify application health and the Alembic revision before reopening writes."
