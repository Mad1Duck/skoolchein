FROM oven/bun:1-alpine
WORKDIR /app

# Install deps from workspace root so workspace:* references resolve
COPY package.json bun.lock ./
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/ponder/package.json ./packages/ponder/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/contract/package.json ./packages/contract/package.json
RUN bun install

# packages/backend/src/config/ponder-client.ts imports Ponder's onchain
# table schema directly (../../../ponder/ponder.schema) — Ponder is the
# sole owner/migrator of that schema, backend only reads types from it.
COPY packages/ponder/ponder.schema.ts ./packages/ponder/ponder.schema.ts

# Copy backend source
WORKDIR /app/packages/backend
COPY packages/backend/src ./src
COPY packages/backend/drizzle.config.ts ./drizzle.config.ts
COPY packages/backend/tsconfig.json ./tsconfig.json
COPY packages/backend/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 3001

CMD ["./start.sh"]
