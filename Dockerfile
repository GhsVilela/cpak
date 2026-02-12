# Multi-Stage Dockerfile for CPAK Unified Container
# Builds: Backend, Frontend, and assembles with MongoDB, Caddy, supervisord
# Target image size: < 500MB

# Build arguments for metadata
ARG NODE_VERSION=20
ARG ALPINE_VERSION=3.21
ARG MONGODB_VERSION=8.0.4-r0
ARG BUILD_DATE
ARG GIT_SHA
ARG VERSION=dev

# ============================================================================
# Stage 1: Backend Builder
# ============================================================================
FROM node:${NODE_VERSION}-alpine AS backend-builder

WORKDIR /build/backend

# Copy package files and install dependencies
COPY backend/package*.json ./
RUN npm ci --only=production && \
    cp -R node_modules /tmp/backend-prod-modules && \
    npm ci

# Copy source and build TypeScript
COPY backend/ ./
RUN npm run build

# ============================================================================
# Stage 2: Frontend Builder
# ============================================================================
FROM node:${NODE_VERSION}-alpine AS frontend-builder

WORKDIR /build/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build Next.js in standalone mode
COPY frontend/ ./
RUN npm run build

# ============================================================================
# Stage 3: Runtime Base with System Dependencies
# ============================================================================
FROM node:${NODE_VERSION}-slim AS runtime

# Install dependencies for MongoDB repository
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    wget \
    ca-certificates \
    debian-keyring \
    debian-archive-keyring \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# Add MongoDB repository
RUN curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg && \
    echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" | tee /etc/apt/sources.list.d/mongodb-org-8.0.list

# Add Caddy repository
RUN curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && \
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list

# Install all required packages
RUN apt-get update && apt-get install -y \
    supervisor \
    caddy \
    mongodb-org-server \
    mongodb-org-shell \
    mongodb-org-tools \
    bash \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create MongoDB user and directories
RUN mkdir -p /data/db /data/images && \
    chown -R mongodb:mongodb /data/db

# Create application directories
RUN mkdir -p \
    /app/backend \
    /app/frontend \
    /var/log/supervisor \
    /etc/supervisor/conf.d

# ============================================================================
# Stage 4: Final Assembly
# ============================================================================
FROM runtime

WORKDIR /app

# Copy backend build artifacts and production dependencies
COPY --from=backend-builder /build/backend/dist /app/backend/dist
COPY --from=backend-builder /tmp/backend-prod-modules /app/backend/node_modules
COPY --from=backend-builder /build/backend/package.json /app/backend/

# Copy frontend standalone build
COPY --from=frontend-builder /build/frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /build/frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /build/frontend/public /app/frontend/public

# Copy configuration files
COPY config/supervisord/supervisord.conf /etc/supervisor/conf.d/cpak.conf
COPY config/caddy/Caddyfile.unified /etc/caddy/Caddyfile

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set metadata labels
LABEL org.opencontainers.image.title="CPAK" \
      org.opencontainers.image.description="Cross-Platform Achievement Keeper - Unified container with backend, frontend, web server, and database" \
      org.opencontainers.image.vendor="ghsvilela" \
      org.opencontainers.image.url="https://github.com/ghsvilela/cpak" \
      org.opencontainers.image.source="https://github.com/ghsvilela/cpak" \
      org.opencontainers.image.documentation="https://github.com/ghsvilela/cpak/blob/main/README.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      cpak.components="caddy,nextjs,fastify,mongodb" \
      cpak.database.bundled="true" \
      cpak.database.external="supported" \
      cpak.ports.http="80" \
      cpak.optional.env="ENCRYPTION_KEY" \
      cpak.optional.env="MONGO_URI,EXTERNAL_DB"

# Expose HTTP port (Caddy listens on 80)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD wget --quiet --tries=1 --spider http://localhost/api/health || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
