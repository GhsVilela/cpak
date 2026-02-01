---

description: "Task list for cpak (Cross Platform Achievement Keeper)"
---

# Tasks: cpak — Cross Platform Achievement Keeper

**Input**: Design documents from `/specs/001-cpak/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Only include tests if requested. Not required for MVP.

**Organization**: Tasks are grouped by user story (US1–US3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize frontend (Next.js static), backend (Fastify), local MongoDB, and proxy scaffolding.

- [X] T001 Create repository structure: `frontend/`, `backend/`, `ops/`, `data/` at repo root
- [X] T002 Initialize Next.js app in `frontend/` with TypeScript and App Router
- [X] T003 [P] Configure Next.js static export (output to `frontend/dist`) in `frontend/next.config.js`
- [X] T004 [P] Initialize backend Node project in `backend/` with TypeScript, Fastify, Mongoose
- [X] T005 [P] Add env config loader in `backend/src/utils/config.ts` (reads `API_PORT`, `API_BASE_PATH`, `MONGO_URI`, `MONGO_DB`, `ALLOWED_ORIGINS`)
- [X] T006 [P] Add structured logging in `backend/src/utils/logger.ts`
- [X] T007 Create Docker Compose scaffold in `docker-compose.yml` (web, api, mongo) per quickstart.md
- [X] T008 [P] Add `ops/Caddyfile` routing `/` → `frontend/dist` and `/api` → backend

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required before any user story.

- [X] T009 Setup Fastify server and base middleware in `backend/src/api/server.ts`
- [X] T010 [P] Implement CORS middleware in `backend/src/api/middleware/cors.ts`
- [X] T011 [P] Implement health and version endpoints in `backend/src/api/routes/system.ts`
- [X] T012 [P] Setup MongoDB connection in `backend/src/utils/db.ts` using Mongoose
- [X] T013 Define Mongoose schemas: `Profile`, `Game`, `Achievement` in `backend/src/models/*.ts`
- [X] T014 [P] Add base API routing under `API_BASE_PATH` in `backend/src/api/routes/index.ts`
- [X] T015 [P] Frontend runtime config loader in `frontend/src/services/config.ts` (reads `dist/config.json` or `window.__CONFIG__`)
- [X] T016 Create UI layout and theming baseline in `frontend/src/styles/globals.css` and `frontend/src/app/layout.tsx`
- [X] T017 Add API client in `frontend/src/services/apiClient.ts` (base URL from config)

**Checkpoint**: Foundation ready — proceed to user stories in parallel.

---

## Phase 3: User Story 1 — First-Time Setup & Initial Sync (Priority: P1) 🎯 MVP

**Goal**: Setup wizard, capture credentials, initial sync, platform pages with default 100% filter.

**Independent Test**: Configure Steam only; run sync; verify Steam page lists only 100% completed games.

### Implementation

- [X] T018 [P] [US1] Create Setup Wizard page in `frontend/src/app/setup/page.tsx` (forms for Steam/Xbox/PlayStation + SteamGridDB key)
- [X] T019 [US1] Implement Profiles API: `GET/POST/PATCH/DELETE /api/profiles` in `backend/src/api/routes/profiles.ts`
- [X] T020 [US1] Implement Sync trigger: `POST /api/sync/{platform}` in `backend/src/api/routes/sync.ts`
- [X] T021 [P] [US1] Implement Steam adapter in `backend/src/services/adapters/steam.ts` (fetch games/achievements)
- [X] T022 [US1] Implement Sync service orchestration in `backend/src/services/syncService.ts` (rate-limit aware)
- [X] T023 [P] [US1] Implement Games API: `GET /api/games?platform=&profileId=&onlyCompleted=true` in `backend/src/api/routes/games.ts`
- [X] T024 [P] [US1] Implement Achievements API: `GET /api/achievements?gameId=&profileId=` in `backend/src/api/routes/achievements.ts`
- [X] T025 [P] [US1] Create Steam page in `frontend/src/app/steam/page.tsx` with default 100% filter
- [X] T026 [P] [US1] Create Xbox page in `frontend/src/app/xbox/page.tsx` with default 100% filter
- [X] T027 [P] [US1] Create PlayStation page in `frontend/src/app/playstation/page.tsx` with default 100% filter
- [X] T028 [US1] Wire Setup Wizard to Profiles API and start initial sync per selected platforms
- [X] T029 [US1] Add loading states and error handling on sync start in `frontend/src/components/SyncStatus.tsx`

**Checkpoint**: US1 complete — app usable with single platform and default filters.

---

## Phase 4: User Story 2 — Multi-Profile Management & Scheduling (Priority: P2)

**Goal**: Multiple profiles per platform and daily scheduler for updates.

**Independent Test**: Add second Steam profile; enable daily sync; verify automatic and manual updates.

### Implementation

- [X] T030 [P] [US2] Extend `Profile` schema for multiple accounts in `backend/src/models/profile.ts` (indexes)
- [X] T031 [US2] Add profile selection and management UI in `frontend/src/app/settings/page.tsx` (add/edit/remove profiles)
- [X] T032 [US2] Implement scheduler service in `backend/src/services/scheduler.ts` (cron from `SCHEDULER_CRON`)
- [X] T033 [P] [US2] Record sync runs in `backend/src/models/syncRun.ts` and expose `GET /api/sync/runs` in `backend/src/api/routes/syncRuns.ts`
- [X] T034 [US2] Implement manual sync per profile from settings page in `frontend/src/components/ProfileSyncControls.tsx`
- [X] T035 [P] [US2] Implement rate-limiting/backoff in `backend/src/services/rateLimiter.ts`
- [X] T036 [US2] Update frontend pages to filter by selected `profileId` in `frontend/src/services/apiClient.ts`

**Checkpoint**: US1 and US2 independently functional; profiles manageable; scheduler runs.

---

## Phase 5: User Story 3 — Game Images & Themed Views (Priority: P3)

**Goal**: Visual tiles with images; platform-consistent theming; responsive/mobile-first.

**Independent Test**: Provide SteamGridDB key; verify images load with fallback; pages are responsive.

### Implementation

- [X] T037 [P] [US3] Implement SteamGridDB adapter in `backend/src/services/adapters/steamgriddb.ts` (cache metadata)
- [X] T038 [P] [US3] Implement Images API: `GET /api/images?gameId=` in `backend/src/api/routes/images.ts`
- [X] T039 [US3] Add image rendering tile component in `frontend/src/components/GameTile.tsx` (uses Images API)
- [X] T040 [P] [US3] Add platform themes (Steam/Xbox/PlayStation) via CSS variables in `frontend/src/styles/themes.css`
- [X] T041 [US3] Ensure responsive grid layout in `frontend/src/components/GameGrid.tsx` (mobile-first)
- [X] T042 [US3] Fallback to native images when provider missing in `backend/src/services/adapters/nativeImages.ts`

**Checkpoint**: All stories functional; enhanced UI with images and themes.

---

## Phase N: Polish & Cross-Cutting Concerns

- [X] T043 [P] Documentation updates: `README.md` and `specs/001-cpak/quickstart.md`
- [X] T044 Code cleanup and refactoring across `frontend/` and `backend/`
- [X] T045 Performance tuning: query pagination and memoization in `backend/src/services/*`
- [X] T046 [P] Export/import JSON endpoints in `backend/src/api/routes/exportImport.ts`
- [X] T047 Security hardening: encrypt tokens at rest in `backend/src/utils/crypto.ts`
- [X] T048 [P] Validate `docker-compose.yml` and `ops/Caddyfile` with a local run

---

## Dependencies & Execution Order

- Setup (Phase 1) → Foundational (Phase 2) → User Stories (Phase 3–5) → Polish
- User story order by priority: US1 → US2 → US3
- Each story independently testable: US1 (setup+sync+pages), US2 (profiles+scheduler), US3 (images+themes)

### Parallel Opportunities per Story

- US1: T021, T023–T027 in parallel (adapters and pages)
- US2: T030, T033, T035 in parallel (schema, runs, rate limiter)
- US3: T037–T040 in parallel (adapter, API, themes)

## Implementation Strategy

- MVP: Complete US1 only, validate independently.
- Incremental: Add US2, then US3.
- Frontend responsive from the start; backend endpoints stable and versioned.
