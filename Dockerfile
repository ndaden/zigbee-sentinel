# ==============================================================================
# Stage 1: Build Frontend and Server
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install native build tools required for better-sqlite3 compilation on Alpine
RUN apk add --no-cache python3 make g++

# Install all dependencies (including devDependencies required for Vite and tsc)
COPY package*.json ./
RUN npm ci

# Copy full source tree and compile both client and server bundles
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Production Runner
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8090 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/app/data/zigbee_sentinel.db

# better-sqlite3 is a C++ native addon requiring libstdc++ at runtime on Alpine.
# We temporarily install python3, make, and g++ to compile production bindings,
# then strip the build dependencies to maintain a minimal container image.
RUN apk add --no-cache libstdc++ && \
    apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps

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
