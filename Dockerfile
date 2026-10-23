# ==============================================================================
# Stage 1: Build Frontend and Server
# ==============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools in case native recompilation is needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (including devDependencies required for Vite and tsc)
COPY package*.json ./
RUN npm ci

# Copy full source tree and compile both client and server bundles
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Production Runner
# ==============================================================================
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8090 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/zigbee_sentinel.db

# better-sqlite3 automatically downloads prebuilt binaries for linux-arm64 and linux-x64 on Debian (glibc)
# We install python3 and build-essential as fallback, then clean apt caches to minimize image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend and server distribution files from builder
COPY --from=builder /app/dist ./dist

# Create storage directory for SQLite database and set ownership to node user
RUN mkdir -p /app/data && chown -R node:node /app

# Run as non-privileged node user (UID 1000)
USER node

# Default port for Zigbee Sentinel web interface and REST / WebSocket API
EXPOSE 8090

# Persistent storage volume for SQLite database and history logs
VOLUME ["/app/data"]

# Start production server
CMD ["node", "dist/server/index.js"]
