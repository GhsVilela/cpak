# Implementation Plan: Containerization Improvements for Self-Hosted Deployment

**Branch**: `002-container-deployment` | **Date**: February 12, 2026 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-container-deployment/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Create a unified container image that simplifies CPAK deployment to a single-service configuration. The image will bundle Caddy web server, Next.js frontend, Fastify backend, and optionally MongoDB, reducing required environment variables from ~15 to 3 essential settings (database config, encryption key, data volumes). Implement automated release pipeline triggered by semantic version tags (v*.*.*) that builds and publishes to both Docker Hub and GitHub Container Registry. Support both bundled MongoDB (default, single volume) and external database modes (advanced users).

## Technical Context

**Language/Version**: Node.js 20 (Alpine base), TypeScript 5.7+  
**Primary Dependencies**: 
- Backend: Fastify 5.2, Mongoose 8.9, node-cron 4.2
- Frontend: Next.js 15.1, React 19
- Web Server: Caddy 2 (reverse proxy)
- Database: MongoDB 6 (bundled or external)

**Storage**: MongoDB (document store), filesystem (achievement images)  
**Testing**: Current build workflows test compilation; container health checks needed  
**Target Platform**: Linux containers (x86_64/amd64), self-hosted environments (Docker, Portainer, TrueNAS SCALE)  
**Project Type**: Web application (frontend + backend + web server + optional database)  
**Performance Goals**: 
- Container startup <30 seconds
- Image size <500MB
- Support modest self-hosted hardware (2 CPU cores, 4GB RAM)

**Constraints**: 
- Must work without internet access after initial pull (except for game API sync)
- Zero-config default deployment (database mode)
- Preserve data across container restarts/upgrades

**Scale/Scope**: 
- Single-user or family deployments (1-10 users)
- 1000s of games, 10,000s of achievements per user
- Deployment time <5 minutes from container pull to accessible UI

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Static Frontend Minimalism** | ✅ COMPLIANT | Next.js builds to static assets in `dist/`, runtime config via `config.json` - no changes needed |
| **II. REST Backend Simplicity** | ✅ COMPLIANT | Single Fastify service with existing `/health` and `/version` endpoints - no changes needed |
| **III. Self-Hosting First** | ✅ ENHANCED | Feature explicitly improves self-hosting by creating unified container; Caddy already handles routing |
| **IV. Security Baseline** | ✅ COMPLIANT | Existing ENCRYPTION_KEY for secrets, CORS configured, HTTPS at proxy - no changes needed |
| **V. Observability & Operations** | ✅ COMPLIANT | Structured logging via Pino, health endpoints exist - will add container health checks |

### Configuration Variables Alignment

**Current State** (~15 variables):
- Infrastructure: `API_PORT`, `API_BASE_PATH`, `MONGO_URI`, `MONGO_DB`, `ALLOWED_ORIGINS`, `ENCRYPTION_KEY`, `IMAGES_DIR`
- Platform APIs: `STEAM_API_KEY`, `XBOX_CLIENT_ID`, `XBOX_CLIENT_SECRET`, `PLAYSTATION_CLIENT_ID`, `PLAYSTATION_CLIENT_SECRET`, `STEAMGRID_API_KEY`
- Scheduler: `SCHEDULER_ENABLED`, `SCHEDULER_CRON`, `SYNC_BATCH_SIZE`, `ICON_DOWNLOAD_CONCURRENCY`

**Target State** (≤3 essential for bundled mode):
- Essential (deployment): `ENCRYPTION_KEY`, data volume paths (implicit via mounts)
- UI-configurable: All platform API keys, scheduler settings, sync parameters

**Target State** (external database mode):
- Essential (deployment): `MONGO_URI`, `ENCRYPTION_KEY`, data volume path

### Violations & Justifications

| Requirement | Current Impact | This Feature's Impact | Justification |
|-------------|---------------|----------------------|---------------|
| Single container vs multi-service | Currently 4 services (frontend, api, mongo, web) in docker-compose | Will create unified single container with all components | Specification requirement for simplified deployment; constitution allows this for distribution |
| Bundled database option | Constitution recommends MongoDB as separate self-hosted service | Will support both bundled (default) and external (advanced) | Bundled mode simplifies self-hosting for non-technical users; external mode preserves flexibility |

**GATE STATUS**: ✅ **PASSED**  
- No constitution violations
- Enhancements align with Core Principle III (Self-Hosting First)
- Configuration reduction aligns with constitution's environment variable specification
- Dual database mode preserves flexibility while improving ease of use

## Project Structure

### Documentation (this feature)

```text
specs/002-container-deployment/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── environment.json # Environment variable schema
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Current Structure** (multi-service):
```text
backend/
├── Dockerfile           # Current: standalone backend image
├── src/
│   ├── api/
│   │   └── server.ts   # Fastify server, middleware, routes
│   ├── models/         # Mongoose schemas
│   ├── services/       # Sync service, adapters, scheduler
│   └── utils/          # Config, crypto, db, logger
└── tests/

frontend/
├── Dockerfile           # Current: standalone Next.js image
├── app/                # Next.js 15 app router
│   ├── layout.tsx
│   ├── page.tsx
│   └── [platform]/     # Platform-specific pages
├── components/         # React components
└── public/
    └── config.json     # Runtime API configuration

ops/
└── Caddyfile           # Current: reverse proxy config

docker-compose.yml       # Current: orchestrates 4 services

.github/workflows/
└── build.yml           # Current: builds/tests backend + frontend separately
```

**New Structure** (unified image):
```text
Dockerfile               # NEW: multi-stage unified build
  Stage 1: Build backend (TypeScript compilation)
  Stage 2: Build frontend (Next.js static export or standalone)
  Stage 3: Install MongoDB
  Stage 4: Install Caddy
  Stage 5: Runtime - copy all artifacts, setup entrypoint

docker-compose.yml       # UPDATED: simplified single-service example
docker-compose.external-db.yml  # NEW: example for external database mode

scripts/
└── docker-entrypoint.sh  # NEW: startup orchestration script
    - Detect database mode (bundled vs external)
    - Start MongoDB if bundled mode
    - Wait for database health
    - Run migrations
    - Start backend
    - Start Caddy

.github/workflows/
├── build.yml           # EXISTING: keep for PR builds
└── release.yml         # NEW: semantic version tag workflow
    - Build unified image
    - Push to Docker Hub
    - Push to GitHub Container Registry (ghcr.io)
    - Create GitHub Release

backend/                # No structural changes needed
frontend/               # May need build config changes for static export
ops/Caddyfile.unified   # NEW: Caddy config for unified container
```

**Structure Decision**: Hybrid approach - unified Dockerfile at repository root creates single deployable image, but source code structure remains unchanged to maintain development workflow. This allows developers to continue working with familiar structure (backend/, frontend/) while producing a simplified deployment artifact.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: No violations requiring justification. Constitution Check passed with alignment and enhancements to existing principles.

---

## Post-Phase 1 Constitution Re-Check

*Following completion of research, data-model, contracts, and quickstart documentation*

### Design Decisions Review

| Design Area | Constitution Alignment | Assessment |
|-------------|----------------------|------------|
| **Multi-stage Docker Build** | Self-Hosting First (Principle III) | ✅ COMPLIANT - Optimized image size (~310MB estimated) enables faster deployment on modest hardware |
| **Next.js Standalone Mode** | Static Frontend Minimalism (Principle I) | ✅ COMPLIANT - Produces minimal runtime bundle while preserving full features; runtime config via environment |
| **supervisord Process Manager** | Observability & Operations (Principle V) | ✅ COMPLIANT - Proper logging, health checks, automatic restart on failure |
| **Settings Database Collection** | REST Backend Simplicity (Principle II) | ✅ COMPLIANT - Simple CRUD endpoints (`/api/settings`), stored in MongoDB as prescribed |
| **Dual Database Mode** | Self-Hosting First (Principle III) | ✅ ENHANCED - Bundled mode removes external dependencies; external mode preserves advanced use cases |
| **Volume Organization** | Self-Hosting First (Principle III) | ✅ COMPLIANT - Unified `/data` volume simplifies backup/restore; split mode available for advanced users |
| **Multi-Registry Publishing** | Self-Hosting First (Principle III) | ✅ ENHANCED - Multiple distribution channels increase availability for self-hosters |
| **UI Configuration Layer** | REST Backend Simplicity (Principle II) | ✅ COMPLIANT - RESTful settings API, encrypted storage, standard MongoDB access patterns |

### Environment Variables Reduction

**Constitution Prescribed Variables** (from constitution reference):
- ✅ `API_PORT`: Now fixed internally (8080) - not user-configurable
- ✅ `API_BASE_PATH`: Now fixed internally (/api) - not user-configurable  
- ✅ `MONGO_URI`: Optional (bundled mode) or required (external mode) - **PRESERVED**
- ✅ `MONGO_DB`: Fixed internally - not user-configurable
- ✅ `ALLOWED_ORIGINS`: Auto-detected - not user-configurable
- ✅ Domain variables: All moved to UI configuration - **IMPROVED**

**Result**: Reduced from 15+ variables to 2-3 essential (ENCRYPTION_KEY + optional EXTERNAL_DB/MONGO_URI), meeting specification target of ≤3.

### Security Baseline Compliance

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| HTTPS in production | Reverse proxy (Caddy) handles TLS | ✅ MAINTAINED |
| CORS configured | Auto-configured based on host | ✅ MAINTAINED |
| Secrets not hardcoded | ENCRYPTION_KEY via env var; API keys in encrypted DB | ✅ ENHANCED |
| JWT auth (if required) | Not modified by this feature | ✅ MAINTAINED |

### API Endpoint Review

**New Endpoints** (Settings Management):
- `GET /api/settings` - List all settings (secrets masked)
- `GET /api/settings/:key` - Get specific setting
- `PUT /api/settings/:key` - Update or create setting
- `DELETE /api/settings/:key` - Delete setting (revert to default)

**Constitution Compliance**:
- ✅ RESTful design (CRUD under `/api/settings`)
- ✅ Returns JSON
- ✅ Simple, stateless operations
- ✅ Follows existing CPAK API patterns

### MongoDB Collections Impact

**New Collection**: `settings`
- Simple schema (key/value with metadata)
- Encrypted storage for sensitive values
- Standard Mongoose model
- No breaking changes to existing collections

**Constitution Alignment**: ✅ COMPLIANT - MongoDB is prescribed document store; adding one collection for configuration is within prescribed architecture.

### Final Assessment

**GATE STATUS**: ✅ **PASSED POST-DESIGN REVIEW**

**Summary**:
- All Phase 1 design decisions comply with constitution principles
- No new architectural patterns introduced that violate minimalism
- Configuration simplification aligns with constitution's self-hosting focus
- Security baseline maintained and enhanced (encrypted settings storage)
- New API endpoints follow existing REST patterns
- Environment variable reduction honors constitution's prescribed configuration approach

**Conclusion**: Feature design is approved for implementation. Proceed to `/speckit.tasks` to break down into actionable development tasks.
