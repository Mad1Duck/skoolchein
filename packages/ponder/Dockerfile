FROM oven/bun:1-alpine
WORKDIR /app

# Install deps from workspace root so workspace:* references resolve
COPY package.json bun.lock ./
COPY packages/ponder/package.json ./packages/ponder/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/contract/package.json ./packages/contract/package.json
RUN bun install

# Copy indexer source
WORKDIR /app/packages/ponder
COPY packages/ponder/abis ./abis
COPY packages/ponder/src ./src
COPY packages/ponder/drizzle ./drizzle
COPY packages/ponder/ponder.config.ts ./ponder.config.ts
COPY packages/ponder/ponder.schema.ts ./ponder.schema.ts
COPY packages/ponder/drizzle.config.ts ./drizzle.config.ts
COPY packages/ponder/tsconfig.json ./tsconfig.json

EXPOSE 42069

CMD ["bun", "--bun", "ponder", "start"]
