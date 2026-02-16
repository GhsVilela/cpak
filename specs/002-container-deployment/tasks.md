# Tasks: Containerization Improvements for Self-Hosted Deployment

**Input**: Design documents from `/specs/002-container-deployment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT included in this implementation (not requested in specification)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure needed for unified container

- [X] T001 Create scripts directory for container orchestration at scripts/
- [X] T002 [P] Create supervisord configuration template directory at config/supervisord/
- [X] T003 [P] Create unified Caddy configuration directory at config/caddy/
- [X] T004 [P] Update frontend/next.config.js to use standalone output mode
- [X] T005 [P] Create docker-compose.unified.yml example for single-service deployment
- [X] T006 [P] Create docker-compose.external-db.yml example for external database mode

**Checkpoint**: Project structure ready for unified container implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Install and configure supervisord in Alpine base - research implementation in Docker context
- [X] T008 Define volume mount detection logic strategy for /app/data vs /app/data/db + /app/data/images
- [X] T009 Define database mode detection strategy for bundled vs external MongoDB
- [X] T010 Create configuration precedence framework (database > environment > defaults)
- [X] T011 [P] Document container image metadata labels (OCI annotations) for plan reference

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Deploy Application with Single Container (Priority: P1) 🎯 MVP

**Goal**: Create unified container image that bundles web server, frontend, backend, and optionally MongoDB, deployable with minimal configuration (≤3 environment variables)

**Independent Test**: Pull the image, start with single volume mount, access UI at http://localhost:8000

### Implementation for User Story 1

#### Docker Build Infrastructure

- [X] T012 [US1] Create multi-stage Dockerfile at repository root with backend builder stage
- [X] T013 [US1] Add frontend builder stage to Dockerfile using Next.js standalone build
- [X] T014 [US1] Add runtime stage to Dockerfile with Node.js 20 Alpine base + MongoDB installation
- [X] T015 [US1] Add Caddy installation to runtime stage in Dockerfile
- [X] T016 [US1] Add final assembly stage copying backend dist and node_modules to Dockerfile
- [X] T017 [US1] Add frontend standalone output copy to final stage in Dockerfile
- [X] T018 [US1] Configure Docker build cache optimization and layer ordering in Dockerfile

#### Process Management & Orchestration

- [X] T019 [US1] Create supervisord.conf at config/supervisord/supervisord.conf with MongoDB program definition
- [X] T020 [US1] Add backend API program definition to config/supervisord/supervisord.conf
- [X] T021 [US1] Add Caddy program definition to config/supervisord/supervisord.conf with priority ordering
- [X] T022 [US1] Configure supervisord logging to stdout/stderr in config/supervisord/supervisord.conf

#### Container Entrypoint & Startup Logic

- [X] T023 [US1] Create docker-entrypoint.sh at scripts/docker-entrypoint.sh with shebang and error handling
- [X] T024 [US1] Implement database mode detection logic (EXTERNAL_DB/MONGO_URI check) in scripts/docker-entrypoint.sh
- [X] T025 [US1] Implement MongoDB service disabling for external mode in scripts/docker-entrypoint.sh
- [X] T026 [US1] Implement volume detection logic for unified vs split volumes in scripts/docker-entrypoint.sh
- [X] T027 [US1] Add data directory creation (/app/data/db, /app/data/images) to scripts/docker-entrypoint.sh
- [X] T028 [US1] Add volume permissions validation to scripts/docker-entrypoint.sh
- [X] T029 [US1] Add supervisord startup command at end of scripts/docker-entrypoint.sh
- [X] T030 [US1] Make docker-entrypoint.sh executable and set as Docker ENTRYPOINT in Dockerfile

#### Web Server Configuration

- [X] T031 [P] [US1] Create Caddyfile.unified at config/caddy/Caddyfile.unified for single-container routing
- [X] T032 [US1] Configure /api/* reverse proxy to backend:8080 in config/caddy/Caddyfile.unified
- [X] T033 [US1] Configure / reverse proxy to Next.js frontend on port 3000 in config/caddy/Caddyfile.unified
- [X] T034 [US1] Add gzip compression and JSON logging to config/caddy/Caddyfile.unified
- [X] T035 [US1] Copy Caddyfile.unified to /etc/caddy/Caddyfile in Dockerfile

#### Health Checks & Validation

- [X] T036 [US1] Implement Docker HEALTHCHECK in Dockerfile checking /api/health endpoint
- [X] T037 [US1] Add MongoDB health check logic to docker-entrypoint.sh (bundled mode only)
- [X] T038 [US1] Add startup error logging with clear error messages to docker-entrypoint.sh
- [X] T039 [US1] Add ENCRYPTION_KEY warning log when using default key in docker-entrypoint.sh

#### Environment Variable Cleanup

- [X] T040 [P] [US1] Update backend server startup to use fixed internal ports (API_PORT=8080) in backend/src/utils/config.ts
- [X] T041 [P] [US1] Update backend to use fixed API_BASE_PATH=/api in backend/src/utils/config.ts
- [X] T042 [P] [US1] Update backend ALLOWED_ORIGINS to auto-detect from request headers in backend/src/api/middleware/cors.ts
- [X] T043 [P] [US1] Update backend IMAGES_DIR to fixed /app/data/images in backend/src/utils/config.ts

#### Docker Compose Examples

- [X] T044 [P] [US1] Implement docker-compose.unified.yml with single cpak service and single volume
- [X] T045 [P] [US1] Implement docker-compose.external-db.yml with cpak + external MongoDB service
- [X] T046 [P] [US1] Add environment variable documentation to docker-compose examples (ENCRYPTION_KEY, EXTERNAL_DB)

#### Build & Size Optimization

- [X] T047 [US1] Test Docker build and verify image size under 500MB target
- [X] T048 [US1] Optimize Dockerfile layer caching for faster rebuilds
- [X] T049 [US1] Add .dockerignore file to exclude unnecessary files from build context

**Checkpoint**: At this point, User Story 1 should be fully functional - users can pull image and deploy with single command

---

## Phase 4: User Story 2 - Automated Release Publishing (Priority: P2)

**Goal**: Automate container image building and publishing to Docker Hub + GitHub Container Registry when semantic version tags are pushed

**Independent Test**: Push test tag v0.1.0-test, verify workflow triggers and publishes to both registries with correct tags

### Implementation for User Story 2

#### GitHub Actions Workflow

- [X] T050 [US2] Create .github/workflows/release.yml with semantic version tag trigger (v[0-9]+.[0-9]+.[0-9]+)
- [X] T051 [US2] Add repository checkout step to .github/workflows/release.yml
- [X] T052 [US2] Add Docker Buildx setup step to .github/workflows/release.yml
- [X] T053 [US2] Configure docker/metadata-action for multi-registry tags in .github/workflows/release.yml
- [X] T054 [US2] Add Docker Hub login step with DOCKERHUB_USERNAME and DOCKERHUB_TOKEN secrets in .github/workflows/release.yml
- [X] T055 [US2] Add GitHub Container Registry login step with GITHUB_TOKEN in .github/workflows/release.yml
- [X] T056 [US2] Add docker/build-push-action for unified Dockerfile build in .github/workflows/release.yml
- [X] T057 [US2] Configure build caching (type=gha) in .github/workflows/release.yml
- [X] T058 [US2] Add multi-registry push configuration to .github/workflows/release.yml
- [X] T059 [US2] Add GitHub release creation step with auto-generated notes in .github/workflows/release.yml

#### Registry Configuration & Metadata

- [X] T060 [P] [US2] Add OCI image labels to Dockerfile (title, description, version, source, licenses)
- [X] T061 [P] [US2] Configure semantic version tag patterns (version, major.minor, major, latest) in .github/workflows/release.yml

#### Workflow Permissions & Secrets

- [X] T062 [US2] Document required repository secrets (DOCKERHUB_USERNAME, DOCKERHUB_TOKEN) in README or quickstart
- [X] T063 [US2] Configure workflow permissions (contents: write, packages: write) in .github/workflows/release.yml
- [X] T064 [US2] Add workflow status badge configuration (optional) in .github/workflows/release.yml

#### Build Validation

- [X] T065 [US2] Test release workflow with test tag to verify build succeeds
- [X] T066 [US2] Verify Docker Hub image is published with correct tags
- [X] T067 [US2] Verify GitHub Container Registry image is published with correct tags
- [X] T068 [US2] Verify GitHub Release is created with release notes

**Checkpoint**: At this point, User Stories 1 AND 2 should both work - deployable image exists and releases are automated

---

## Phase 5: User Story 3 - Simplified Configuration via UI (Priority: P3)

**Goal**: Move optional configuration (platform API keys, scheduler settings, sync parameters) from environment variables to UI-managed database storage

**Independent Test**: Deploy without optional env vars, configure Steam API key in UI Settings, trigger sync successfully

### Implementation for User Story 3

#### Database Model

- [X] T069 [P] [US3] Create Settings Mongoose schema in backend/src/models/settings.ts with key, value, category, isSecret fields
- [X] T070 [P] [US3] Add encryption/decryption methods to Settings model in backend/src/models/settings.ts
- [X] T071 [P] [US3] Add unique index on key field and index on category field in backend/src/models/settings.ts
- [X] T072 [P] [US3] Add validation rules (key pattern, category enum, value max length) in backend/src/models/settings.ts

#### Configuration Service Layer

- [X] T073 [US3] Create ConfigService in backend/src/services/configService.ts with getSetting() method
- [X] T074 [US3] Implement precedence logic (database > env var > default) in backend/src/services/configService.ts
- [X] T075 [US3] Add setSetting() method with encryption for secrets in backend/src/services/configService.ts
- [X] T076 [US3] Add deleteSetting() method in backend/src/services/configService.ts
- [X] T077 [US3] Add getSettingsByCategory() method in backend/src/services/configService.ts

#### API Endpoints

- [X] T078 [P] [US3] Implement GET /api/settings endpoint in backend/src/api/routes/settings.ts
- [X] T079 [P] [US3] Implement GET /api/settings/:key endpoint with secret masking in backend/src/api/routes/settings.ts
- [X] T080 [P] [US3] Implement PUT /api/settings/:key endpoint in backend/src/api/routes/settings.ts
- [X] T081 [P] [US3] Implement DELETE /api/settings/:key endpoint in backend/src/api/routes/settings.ts
- [X] T082 [US3] Add request validation middleware for settings endpoints in backend/src/api/routes/settings.ts
- [X] T083 [US3] Register settings routes with Fastify in backend/src/api/server.ts

#### Backend Integration

- [X] T084 [US3] Update sync service to use ConfigService for STEAM_API_KEY in backend/src/services/syncService.ts
- [ ] T085 [US3] Update Xbox adapter to use ConfigService for credentials in backend/src/services/adapters/xbox.ts
- [ ] T086 [US3] Update PlayStation adapter to use ConfigService for credentials in backend/src/services/adapters/playstation.ts
- [X] T087 [US3] Update SteamGridDB integration to use ConfigService for API key in backend/src/services/adapters/steamgrid.ts
- [X] T088 [US3] Update scheduler to use ConfigService for SCHEDULER_ENABLED and SCHEDULER_CRON in backend/src/services/scheduler.ts
- [X] T089 [US3] Update sync settings to use ConfigService for batch size and concurrency in backend/src/services/syncService.ts

#### Frontend UI

- [X] T090 [P] [US3] Create settings page layout at frontend/app/settings/page.tsx
- [X] T091 [P] [US3] Create SettingsForm component in frontend/components/SettingsForm.tsx
- [ ] T092 [P] [US3] Create PlatformAPISettings component for Steam/Xbox/PlayStation keys in frontend/components/PlatformAPISettings.tsx (N/A - platform keys managed per profile)
- [X] T093 [P] [US3] Create SchedulerSettings component for cron configuration in frontend/components/SchedulerSettings.tsx
- [X] T094 [P] [US3] Create SyncSettings component for batch size and concurrency in frontend/components/SyncSettings.tsx
- [X] T095 [US3] Implement settings API client methods in frontend/services/apiClient.ts
- [X] T096 [US3] Add secret input masking and validation in frontend components
- [X] T097 [US3] Add success/error toast notifications for settings save in frontend/components/SettingsForm.tsx

#### Migration & Initialization

- [X] T098 [US3] Create settings collection initialization in backend/src/services/configService.ts
- [X] T099 [US3] Add environment variable import logic on first run in backend/src/services/configService.ts
- [X] T100 [US3] Add default values population for non-secret settings in backend/src/services/configService.ts

#### Documentation Update

- [X] T101 [P] [US3] Update README.md to document UI-based configuration approach
- [X] T102 [P] [US3] Update environment variables documentation marking platform keys as deprecated in README.md

**Checkpoint**: All user stories should now be independently functional - complete feature implementation

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories or finalize the feature

- [X] T103 [P] Update main README.md with unified container deployment instructions
- [X] T104 [P] Add quickstart deployment examples to README.md (bundled, external DB, split volumes)
- [X] T105 [P] Create docs/troubleshooting.md with common deployment issues and solutions
- [X] T106 [P] Validate quickstart.md deployment scenarios work correctly
- [X] T107 [P] Update old docker-compose.yml examples to reference new unified approach
- [X] T108 [P] Add container image size badge to README.md
- [X] T109 Security review of encryption implementation for settings storage
- [X] T110 Performance testing of container startup time (target <30s)
- [X] T111 Verify image size meets <500MB target
- [X] T112 [P] Update CONTRIBUTING.md with unified container development workflow
- [X] T113 [P] Create deployment documentation for TrueNAS SCALE in docs/platforms/truenas.md
- [X] T114 [P] Create deployment documentation for Portainer in docs/platforms/portainer.md
- [X] T115 Tag and test v1.0.0 release candidate

**Checkpoint**: All Phase 6 polish tasks complete - Project ready for v1.0.0 release

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion - Highest priority (P1)
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion (needs unified image to publish)
- **User Story 3 (Phase 5)**: Depends on Foundational phase completion - Can run in parallel with US1/US2 for backend work, integration requires US1 container
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories - This is MVP
- **User Story 2 (P2)**: Requires User Story 1 completed (needs unified Dockerfile to build/publish)
- **User Story 3 (P3)**: Can start backend work after Foundational (Phase 2), but full testing requires User Story 1 container - Independently testable

### Within Each User Story

**User Story 1 (Deploy Application)**:
1. Docker build infrastructure (T012-T018) - can all run in parallel
2. Process management config (T019-T022) - can run in parallel with Docker work
3. Entrypoint and startup logic (T023-T030) - sequential, depends on understanding supervisord config
4. Web server config (T031-T035) - can run in parallel with other work
5. Health checks (T036-T039) - requires entrypoint script first
6. Environment cleanup (T040-T043) - can run in parallel with Docker work
7. Docker Compose examples (T044-T046) - can run in parallel after Dockerfile done
8. Optimization (T047-T049) - must come last after everything works

**User Story 2 (Automated Release)**:
1. All workflow steps (T050-T061) can be developed together
2. Documentation (T062-T064) can run in parallel
3. Validation (T065-T068) must come last

**User Story 3 (UI Configuration)**:
1. Database model (T069-T072) - can all run in parallel
2. Service layer (T073-T077) - sequential, depends on model
3. API endpoints (T078-T083) - can run in parallel, depends on service layer
4. Backend integration (T084-T089) - can run in parallel, depends on service layer
5. Frontend UI (T090-T097) - can run in parallel with backend work
6. Migration (T098-T100) - depends on service layer
7. Documentation (T101-T102) - can run in parallel with implementation

### Parallel Opportunities

**Setup Phase (Phase 1)**:
- T002 (supervisord config dir), T003 (Caddy config dir), T004 (Next.js config), T005 (docker-compose.unified), T006 (docker-compose.external-db) can all run in parallel

**Foundational Phase (Phase 2)**:
- T011 (OCI labels doc) can run in parallel with research tasks (T007-T010)

**User Story 1**:
- T012-T018 (Docker build stages) - 7 parallel tasks
- T031-T034 (Caddy config) - 4 parallel tasks
- T040-T043 (env var cleanup) - 4 parallel tasks
- T044-T046 (compose examples) - 3 parallel tasks

**User Story 2**:
- T060-T061 (metadata) - 2 parallel tasks

**User Story 3**:
- T069-T072 (Settings model) - 4 parallel tasks
- T078-T081 (API endpoints) - 4 parallel tasks
- T084-T089 (backend integration) - 6 parallel tasks
- T090-T094 (frontend components) - 5 parallel tasks
- T101-T102 (documentation) - 2 parallel tasks

**Polish Phase (Phase 6)**:
- T103-T108, T112-T114 (documentation) - 11 parallel tasks

---

## Parallel Example: User Story 1

```bash
# Launch Docker build infrastructure tasks together:
# Task T012: Create multi-stage Dockerfile at repository root with backend builder stage
# Task T013: Add frontend builder stage to Dockerfile using Next.js standalone build
# Task T014: Add runtime stage to Dockerfile with Node.js 20 Alpine base + MongoDB installation
# Task T015: Add Caddy installation to runtime stage in Dockerfile
# Task T016: Add final assembly stage copying backend dist and node_modules to Dockerfile
# Task T017: Add frontend standalone output copy to final stage in Dockerfile
# Task T018: Configure Docker build cache optimization and layer ordering in Dockerfile

# In parallel, launch web server configuration tasks:
# Task T031: Create Caddyfile.unified at config/caddy/Caddyfile.unified
# Task T032: Configure /api/* reverse proxy to backend:8080
# Task T033: Configure / reverse proxy to Next.js frontend on port 3000
# Task T034: Add gzip compression and JSON logging

# In parallel, launch environment variable cleanup tasks:
# Task T040: Update backend server startup to use fixed internal ports
# Task T041: Update backend to use fixed API_BASE_PATH=/api
# Task T042: Update backend ALLOWED_ORIGINS to auto-detect
# Task T043: Update backend IMAGES_DIR to fixed /app/data/images
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (6 tasks)
2. Complete Phase 2: Foundational (5 tasks) - CRITICAL
3. Complete Phase 3: User Story 1 (38 tasks)
4. **STOP and VALIDATE**: Build image, deploy with docker-compose, test all features
5. If validated, this is MVP ready for use

**MVP Deliverable**: Users can deploy CPAK with single docker-compose command and 1-2 environment variables

### Incremental Delivery

1. **Sprint 1**: Setup + Foundational → Foundation ready
2. **Sprint 2**: User Story 1 → Test independently → **Deploy MVP** (unified container)
3. **Sprint 3**: User Story 2 → Test independently → Deploy with automated releases
4. **Sprint 4**: User Story 3 → Test independently → Deploy with UI configuration
5. **Sprint 5**: Polish → Final documentation and optimization

### Parallel Team Strategy

With 3 developers after Foundational phase completes:

**Developer A**: User Story 1 (unified container) - Priority P1
- Focus on Docker, entrypoint, orchestration
- Critical path for MVP

**Developer B**: User Story 3 backend (Settings model, API) - Priority P3
- Can work on backend/model/service/API independently
- Doesn't block Developer A

**Developer C**: User Story 3 frontend (Settings UI) - Priority P3
- Can work on UI components independently
- Integrates with Developer B's API work

Once Developer A completes US1, Developer A moves to User Story 2 (release automation).

---

## Validation Checklist

Before marking feature complete, verify:

- [ ] Unified container image builds successfully under 500MB
- [ ] Container starts in under 30 seconds
- [ ] Bundled database mode works with single volume mount
- [ ] External database mode works with EXTERNAL_DB flag
- [ ] Split volume mode automatically detected and works
- [ ] Health checks pass for all services (MongoDB, backend, Caddy)
- [ ] UI accessible at http://localhost:8000 after deployment
- [ ] All game library features work (sync, profiles, achievements)
- [ ] Semantic version tag triggers release workflow
- [ ] Docker Hub receives published image with correct tags
- [ ] GitHub Container Registry receives published image with correct tags
- [ ] GitHub Release created with release notes
- [ ] Settings can be configured via UI (Steam API key test)
- [ ] UI-configured settings persist across container restarts
- [ ] Scheduler behavior updates immediately after UI config change
- [ ] Environment variables marked deprecated still work (backward compatibility)
- [ ] Volume permissions validated on startup with clear error messages
- [ ] ENCRYPTION_KEY warning logged when using default key
- [ ] quickstart.md deployment scenarios all work correctly
- [ ] Image size, startup time, and env var count meet success criteria (SC-002, SC-006, SC-007)

---

## Summary

**Total Tasks**: 115 tasks across 6 phases

**Breakdown by Phase**:
- Phase 1 (Setup): 6 tasks
- Phase 2 (Foundational): 5 tasks (CRITICAL - blocks all stories)
- Phase 3 (User Story 1 - P1): 38 tasks ← **MVP**
- Phase 4 (User Story 2 - P2): 19 tasks
- Phase 5 (User Story 3 - P3): 34 tasks
- Phase 6 (Polish): 13 tasks

**Parallel Opportunities**: 47 tasks can run in parallel (marked with [P])

**MVP Scope**: Phases 1 + 2 + 3 = 49 tasks for deployable unified container

**Estimated Delivery**:
- MVP (User Story 1): ~2-3 weeks
- User Story 2 (Release automation): +1 week
- User Story 3 (UI configuration): +2 weeks
- Polish: +1 week
- **Total**: ~6-7 weeks for complete feature

**Success Criteria Alignment**:
- SC-001 (deployment <5 min): Achieved by US1
- SC-002 (≤3 env vars): Achieved by US1 + US3
- SC-003 (no config file edits): Achieved by US1
- SC-004 (release <15 min): Achieved by US2
- SC-005 (100% UI configurable): Achieved by US3
- SC-006 (image <500MB): Validated in US1
- SC-007 (startup <30s): Validated in US1
- SC-008 (zero support requests): Validated by quickstart testing in Polish phase
