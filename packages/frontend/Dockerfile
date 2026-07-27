# ── Build ──────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Install deps from workspace root so workspace:* references resolve
COPY package.json bun.lock ./
COPY packages/frontend/package.json ./packages/frontend/package.json
COPY packages/ponder/package.json ./packages/ponder/package.json
COPY packages/contract/package.json ./packages/contract/package.json
RUN bun install

# Copy frontend source
WORKDIR /app/packages/frontend
COPY packages/frontend/index.html ./index.html
COPY packages/frontend/vite.config.ts ./vite.config.ts
COPY packages/frontend/tsconfig.json ./tsconfig.json
COPY packages/frontend/tsconfig.app.json ./tsconfig.app.json
COPY packages/frontend/tsconfig.node.json ./tsconfig.node.json
COPY packages/frontend/src ./src
COPY packages/frontend/public ./public

# VITE_* vars are baked into the bundle at build time — pass via docker-compose args
# VITE_BACKEND_HOST → REST API (packages/backend): /v4, /ipfs, /sse, /webhooks
# VITE_INDEXER_HOST → Ponder directly: /graphql, /sql (Ponder still owns these)
ARG VITE_BACKEND_HOST=http://localhost:3101
ARG VITE_INDEXER_HOST=http://localhost:42069
ARG VITE_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs
ARG VITE_RPC_URL=http://100.73.196.95:8550

ENV VITE_BACKEND_HOST=$VITE_BACKEND_HOST \
    VITE_INDEXER_HOST=$VITE_INDEXER_HOST \
    VITE_IPFS_GATEWAY=$VITE_IPFS_GATEWAY \
    VITE_RPC_URL=$VITE_RPC_URL

RUN bun run build

# ── Serve ──────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built SPA assets
COPY --from=builder /app/packages/frontend/dist ./

# Copy nginx config for SPA routing
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
