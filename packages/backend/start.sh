#!/bin/sh
set -e

echo "[backend-start] Preparing Drizzle schema before starting backend..."

# Prefer idempotent db:migrate. If drizzle_migrations is out of sync with
# the real DB state, migrate will fail with "already exists" errors. In
# that case fall back to db:push --force so the schema always matches
# src/db/schema.ts before the server starts.
apply_migrations() {
  if bun run db:migrate; then
    echo "[backend-start] Drizzle migrations applied."
  else
    echo "[backend-start] db:migrate failed (likely stale drizzle_migrations), using db:push --force..."
    bun run db:push -- --force
  fi
}

success=0
for i in 1 2 3; do
  if apply_migrations; then
    success=1
    break
  fi
  echo "[backend-start] Schema preparation attempt $i failed, retrying in 5s..."
  sleep 5
done

if [ "$success" -ne 1 ]; then
  echo "[backend-start] Could not prepare Drizzle schema after 3 attempts. Exiting."
  exit 1
fi

echo "[backend-start] Schema ready. Starting backend..."
exec bun run src/main.ts
