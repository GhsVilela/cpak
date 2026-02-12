# Research: Containerization Improvements for Self-Hosted Deployment

**Date**: February 12, 2026  
**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

This document consolidates research findings for creating a unified container image that bundles Caddy, Next.js frontend, Fastify backend, and optionally MongoDB, while supporting automated releases to multiple container registries.

## Research Areas

### 1. Multi-Stage Docker Build Strategy

**Decision**: Use multi-stage build with 5 stages - backend build, frontend build, MongoDB installation, Caddy installation, and final runtime assembly

**Rationale**:
- Minimizes final image size by excluding build tools and intermediate artifacts
- Separates build concerns (TypeScript compilation, Next.js build) from runtime
- Allows independent caching of each stage for faster rebuilds
- Standard pattern for complex applications with multiple components

**Alternatives Considered**:
- Single-stage build: Rejected due to bloated image size (includes all build tools in runtime)
- Separate images with docker-compose: Current approach, doesn't meet spec requirement for single unified image
- Base image with runtime installation: Rejected due to slower startup and complexity

**Implementation Pattern**:
```dockerfile
# Stage 1: Backend build
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 2: Frontend build
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 3: Runtime base with MongoDB
FROM node:20-alpine AS runtime
RUN apk add --no-cache mongodb mongodb-tools

# Stage 4: Add Caddy
RUN apk add --no-cache caddy

# Stage 5: Assemble application
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=backend-builder /app/backend/node_modules /app/backend/node_modules
COPY --from=frontend-builder /app/frontend/.next /app/frontend/.next
COPY --from=frontend-builder /app/frontend/node_modules /app/frontend/node_modules
# ... entrypoint and configuration
```

**Key Considerations**:
- Use Alpine base for smaller image size (~50MB vs ~900MB for debian)
- Copy only production dependencies and build artifacts
- Layer ordering matters for cache efficiency

---

### 2. Next.js Deployment Mode

**Decision**: Use Next.js **standalone mode** (not static export) to preserve full functionality including API routes and image optimization

**Rationale**:
- Next.js 15 standalone mode produces self-contained output (~40MB) with minimal dependencies
- Preserves all Next.js features (API routes, middleware, Image component optimization)
- Includes only necessary files for runtime, excludes build-time dependencies
- Native support for runtime configuration via environment variables

**Alternatives Considered**:
- Static Export (`output: 'export'`): Rejected because it removes API routes, middleware, and image optimization features that may be needed
- Standard build: Rejected because it requires full node_modules (100+ MB) vs standalone's minimal dependencies

**Configuration Required**:
```javascript
// frontend/next.config.js
module.exports = {
  output: 'standalone',
  // This creates .next/standalone/ with minimal runtime
}
```

**Image Component Consideration**: Next.js Image optimization requires the node server, which standalone mode preserves. Static export would require external image CDN or manual optimization.

---

### 3. Process Management in Container

**Decision**: Use **supervisord** for managing multiple processes (MongoDB, backend, Caddy) within unified container

**Rationale**:
- Purpose-built for managing multiple processes in containers
- Automatic restart on failure for each service
- Proper signal handling (graceful shutdown)
- Lightweight (~10MB) and well-established
- Provides process monitoring and logging

**Alternatives Considered**:
- Shell script with background processes: Rejected due to poor signal handling, no automatic restart, zombie process issues
- `tini` + custom script: Better than shell script but requires manual restart logic
- `s6-overlay`: Good option but more complex configuration than needed
- Separate containers: Doesn't meet single-image requirement

**Implementation Pattern**:
```ini
; /etc/supervisord.conf
[supervisord]
nodaemon=true
user=root

[program:mongodb]
command=/usr/bin/mongod --dbpath /data/db --bind_ip_all
autostart=true
autorestart=true
priority=1
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0

[program:backend]
command=node /app/backend/dist/api/server.js
autostart=true
autorestart=true
priority=2
environment=MONGO_URI="mongodb://localhost:27017"
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0

[program:caddy]
command=/usr/bin/caddy run --config /etc/caddy/Caddyfile
autostart=true
autorestart=true
priority=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
```

**Health Check Strategy**: Implement Docker HEALTHCHECK that verifies all critical services (MongoDB, backend API) are responding before marking container as healthy.

---

### 4. MongoDB Bundled vs External Mode

**Decision**: Support both modes with **entrypoint script detection** - default bundled, disable via environment flag

**Rationale**:
- Bundled mode: Simplest for non-technical users (zero external dependencies)
- External mode: Allows advanced users to use managed database services or separate MongoDB containers
- Single image supports both modes without rebuilding
- Detection via environment variable is standard pattern

**Mode Detection Logic**:
```bash
#!/bin/sh
# docker-entrypoint.sh

if [ -n "$EXTERNAL_DB" ] || [ -n "$MONGO_URI" ]; then
  # External database mode - disable MongoDB service
  sed -i '/\[program:mongodb\]/,/^\s*$/d' /etc/supervisord.conf
  echo "External database mode enabled"
else
  # Bundled mode - ensure data directory exists
  mkdir -p /data/db
  echo "Bundled database mode enabled"
fi

exec supervisord -c /etc/supervisord.conf
```

**Data Persistence**:
- Bundled mode: Requires `/data/db` volume mount
- External mode: No database volume needed, only `/data/images` for application data

---

### 5. Volume Organization Strategy

**Decision**: Implement **configurable volume strategy** with smart defaults - single unified volume (`/data`) with subdirectories by default, allow split volumes via optional mounts

**Rationale**:
- Single volume mode (`/data/db`, `/data/images` subdirectories): Simplest for users, atomic backups
- Split volume mode (separate mounts): Flexibility for advanced users who want database on faster storage
- Implementation detects which volumes are mounted and adapts automatically
- Standard Unix pattern - everything under `/data`

**Implementation**:
```bash
# Entrypoint detects mount points
if mountpoint -q /data/db && mountpoint -q /data/images; then
  echo "Split volume mode detected"
  DB_PATH=/data/db
  IMAGES_PATH=/data/images
else
  echo "Unified volume mode - using /data"
  DB_PATH=/data/db
  IMAGES_PATH=/data/images
  mkdir -p $DB_PATH $IMAGES_PATH
fi
```

**User Documentation**:
- Default: `docker run -v cpak_data:/data cpak:latest`
- Split: `docker run -v cpak_db:/data/db -v cpak_images:/data/images cpak:latest`

---

### 6. GitHub Actions Multi-Registry Publishing

**Decision**: Use **parallel publishing** to Docker Hub and GitHub Container Registry with semantic version tag filtering via workflow trigger

**Rationale**:
- Docker Hub: Most widely known, default for many users
- GitHub Container Registry (ghcr.io): Native integration, free for public images
- Publishing to both maximizes availability with minimal overhead
- Semantic version tag filter (`v*.*.*`) prevents accidental releases
- Parallel pushes faster than sequential

**Workflow Pattern**:
```yaml
name: Release

on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'  # Matches v1.2.3, not v1.2.3-beta

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ghsvilela/cpak
            ghcr.io/ghsvilela/cpak
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
      
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      
      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

**Tag Strategy**:
- `v1.2.3` creates tags: `1.2.3`, `1.2`, `1`, `latest`
- Pre-release tags (`v1.2.3-beta`) are filtered out by trigger pattern
- Both registries receive identical tags for consistency

**Required Secrets**:
- `DOCKERHUB_USERNAME`: Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub access token (not password)
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

---

### 7. Environment Variable Configuration Strategy

**Decision**: Use **layered configuration** - essential vars at container start, optional vars loadable via UI with database storage

**Rationale**:
- Encryption key must be set at deployment (needed before database decryption)
- Database connection (external mode) needed at container start
- Platform API keys can be added later via UI (better UX, no container restart)
- Matches specification requirement to reduce deployment-time configuration

**Variable Classification**:

**Essential (deployment-time only)**:
- `ENCRYPTION_KEY`: Required for encrypting/decrypting sensitive data in database
- `MONGO_URI`: Required when external database mode enabled
- `EXTERNAL_DB`: Flag to disable bundled MongoDB

**UI-Configurable (stored in database)**:
- `STEAM_API_KEY`
- `XBOX_CLIENT_ID`, `XBOX_CLIENT_SECRET`
- `PLAYSTATION_CLIENT_ID`, `PLAYSTATION_CLIENT_SECRET`
- `STEAMGRID_API_KEY`
- `SCHEDULER_ENABLED`, `SCHEDULER_CRON`
- `SYNC_BATCH_SIZE`, `ICON_DOWNLOAD_CONCURRENCY`

**Removed/Internal**:
- `API_PORT`: Fixed to 8080 internally (not user-configurable)
- `API_BASE_PATH`: Fixed to `/api` internally
- `ALLOWED_ORIGINS`: Set automatically based on detected hostname
- `IMAGES_DIR`: Fixed to `/data/images` internally

**Precedence Rule** (FR-012): UI settings > environment variables (for non-essential vars)

---

### 8. Image Size Optimization

**Decision**: Multi-pronged approach to target <500MB final image size

**Key Techniques**:
1. **Alpine Linux base** (~5MB) vs Debian (~120MB)
2. **Multi-stage builds** to exclude build tools
3. **Next.js standalone output** (~40MB) vs full build
4. **npm ci --production** for runtime dependencies
5. **MongoDB package** from Alpine repos (~100MB compressed)
6. **Caddy binary** from Alpine repos (~30MB)
7. Remove unnecessary files (docs, examples, tests) from node_modules

**Estimated Breakdown**:
- Base Alpine + Node.js: 50MB
- Backend runtime (app + deps): 60MB
- Frontend runtime (Next.js standalone): 50MB
- MongoDB: 100MB
- Caddy: 30MB
- Supervisord + utilities: 10MB
- Application code: 10MB
- **Total estimate: ~310MB** (well under 500MB target)

**Further Optimizations** (if needed):
- Use `node:20-alpine` slim variant
- Prune unused MongoDB tools
- Use multi-arch builds (arm64 variant smaller)

---

## Summary of Decisions

| Research Area | Decision | Key Benefit |
|--------------|----------|-------------|
| Build Strategy | Multi-stage Docker build (5 stages) | Minimal image size, fast rebuilds |
| Next.js Mode | Standalone output | Full features, minimal size (~40MB) |
| Process Manager | supervisord | Reliable multi-process management |
| Database Mode | Dual mode (bundled default, external optional) | Flexibility without complexity |
| Volume Strategy | Unified `/data` with subdirectories, split mode support | Simple default, flexible for advanced use |
| Registry Publishing | Parallel push to Docker Hub + GHCR | Maximum availability |
| Tag Filtering | Semantic version pattern in workflow trigger | Prevents accidental releases |
| Configuration | Layered (essential at deploy, optional via UI) | Reduces deployment complexity |
| Image Size | Alpine + optimizations | Target <500MB (estimated ~310MB) |

## Implementation Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| supervisord adds complexity | Medium | Document thoroughly, provide working examples |
| MongoDB startup time affects container health | Low | Implement health check with retry logic |
| Next.js standalone mode compatibility issues | Low | Next.js 15 has mature standalone support; test thoroughly |
| Users confused by dual database mode | Medium | Clear documentation, sensible defaults (bundled) |
| Image size exceeds 500MB | Low | Current estimate 310MB with 40% buffer |
| Multi-registry publishing requires secrets management | Low | Standard GitHub Actions pattern, well-documented |

## Next Steps

Phase 1 will generate:
1. **data-model.md**: Schema for UI-configurable settings storage
2. **contracts/**: Environment variable specifications and container configuration schema  
3. **quickstart.md**: User guide for deployment scenarios (bundled, external DB, volume configurations)
