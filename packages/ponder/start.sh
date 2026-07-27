#!/bin/sh
set -e

echo "[ponder-start] Applying Drizzle migrations before starting Ponder..."

# Run Drizzle migrations before Ponder so Ponder's internal setup and
# Drizzle schema changes never execute concurrently. Drizzle migrations
# are idempotent; if they are already applied this exits quickly.
success=0
for i in 1 2 3; do
  if bun run db:migrate; then
    success=1
    break
  fi
  echo "[ponder-start] Migration attempt $i failed, retrying in 5s..."
  sleep 5
done

if [ "$success" -ne 1 ]; then
  echo "[ponder-start] Drizzle migrations failed after 3 attempts. Exiting."
  exit 1
fi

echo "[ponder-start] Migrations applied. Starting Ponder..."
exec bun --bun ponder start
