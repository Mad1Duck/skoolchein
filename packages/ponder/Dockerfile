FROM oven/bun:1-alpine
WORKDIR /app

# Install deps from workspace root so workspace:* references resolve
COPY package.json bun.lock ./
COPY packages/ponder/package.json ./packages/ponder/package.json
COPY packages/backend/package.json ./packages/backend/package.json
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/contract/package.json ./packages/contract/package.json
# Some deps (bufferutil, utf-8-validate) have no prebuilt binary for Alpine/musl, so their
# install script falls back to node-gyp, which needs Python and a C toolchain.
RUN apk add --no-cache python3 make g++
RUN bun install

# Copy indexer source
WORKDIR /app/packages/ponder
COPY packages/ponder/abis ./abis
COPY packages/ponder/src ./src
COPY packages/ponder/ponder.config.ts ./ponder.config.ts
COPY packages/ponder/ponder.schema.ts ./ponder.schema.ts
COPY packages/ponder/tsconfig.json ./tsconfig.json
COPY packages/ponder/start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 42069

CMD ["./start.sh"]
