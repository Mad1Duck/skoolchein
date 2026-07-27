#!/bin/sh
set -e

echo "[ponder-start] Preparing Drizzle schema before starting Ponder..."

# Prefer idempotent db:migrate. If drizzle_migrations is out of sync with
# the real DB state (common after db:push + db:migrate mix), migrate will
# fail with "already exists" errors. In that case fall back to db:push --force
# so the schema always matches src/db/schema.ts before Ponder starts.
apply_migrations() {
  if bun run db:migrate; then
    echo "[ponder-start] Drizzle migrations applied."
  else
    echo "[ponder-start] db:migrate failed (likely stale drizzle_migrations), using db:push --force..."
    bun run db:push -- --force
  fi
}

success=0
for i in 1 2 3; do
  if apply_migrations; then
    success=1
    break
  fi
  echo "[ponder-start] Schema preparation attempt $i failed, retrying in 5s..."
  sleep 5
done

if [ "$success" -ne 1 ]; then
  echo "[ponder-start] Could not prepare Drizzle schema after 3 attempts. Exiting."
  exit 1
fi

echo "[ponder-start] Schema ready. Starting Ponder..."
exec bun --bun ponder start
