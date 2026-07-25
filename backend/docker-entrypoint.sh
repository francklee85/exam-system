#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  alembic upgrade head
fi

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Seeding required reference data..."
  python -m app.scripts.seed
fi

exec "$@"
