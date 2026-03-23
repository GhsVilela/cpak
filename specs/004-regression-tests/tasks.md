# Tasks: Regression Test Suite

**Input**: Design documents from `/specs/004-regression-tests/`  
**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) · [data-model.md](data-model.md) · [contracts/test-command-interface.md](contracts/test-command-interface.md) · [quickstart.md](quickstart.md)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label — [US1] through [US4]
- All file paths are absolute from repository root

---

## Phase 1: Setup

**Purpose**: Install dependencies, configure test runners, add npm scripts. No user story work can begin until this phase is complete.

- [X] T001 Refactor `backend/src/api/server.ts` to export `buildServer()` factory function and guard `listen()` with `import.meta.url` check (see research.md Finding 6)
- [X] T002 Add `vitest`, `@vitest/coverage-v8`, `mongodb-memory-server` to `backend/package.json` devDependencies
- [X] T003 [P] Add `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `msw` to `frontend/package.json` devDependencies
- [X] T004 Create `backend/vitest.config.ts` with node environment, globals, setupFiles pointing to `tests/setup.ts`, v8 coverage provider, 70% line/function/branch thresholds on `src/**/*.ts`
- [X] T005 [P] Create `frontend/vitest.config.ts` with jsdom environment, globals, `@vitejs/plugin-react` plugin, setupFiles pointing to `tests/setup.ts`, v8 coverage provider, 60% line/function/branch thresholds on `components/**/*.tsx` and `app/**/*.tsx`
- [X] T006 Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `backend/package.json`
- [X] T007 [P] Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `frontend/package.json`

**Checkpoint**: Both workspaces can run `npm test` (no test files yet — runner exits cleanly)

---

## Phase 2: Foundational (Blocking Test Infrastructure)

**Purpose**: Shared setup files and helper utilities that ALL test phases depend on. Must be fully complete before any tests are written.

**⚠️ CRITICAL**: No user story test work can begin until this phase is complete.

- [X] T008 Create `backend/tests/setup.ts` — `beforeAll` starts `MongoMemoryServer` and connects Mongoose; `afterEach` deletes all documents from every Mongoose collection; `afterAll` disconnects Mongoose and stops MongoMemoryServer
- [X] T009 Create `backend/tests/helpers/server.ts` — exports `createTestServer()` that calls `buildServer()`, calls `app.ready()`, and returns the Fastify instance for use with `app.inject()`
- [X] T010 [P] Create `frontend/tests/setup.ts` — imports `@testing-library/jest-dom` matchers; `beforeAll` calls `server.listen({ onUnhandledRequest: 'error' })`; `afterEach` calls `server.resetHandlers()`; `afterAll` calls `server.close()`
- [X] T011 [P] Create `frontend/tests/mocks/handlers.ts` — exports MSW `server` (`setupServer` from `msw/node`) with one handler per apiClient endpoint: GET `/api/games`, GET `/api/games/:id`, GET `/api/profiles`, POST `/api/profiles`, GET `/api/sync/status`, POST `/api/sync/start`, POST `/api/sync/cancel`, GET `/api/achievements`, GET `/api/backup`, POST `/api/backup`, POST `/api/restore`, GET `/api/settings`, PUT `/api/settings`, GET `/api/health`, GET `/api/version`, GET `/api/export`, POST `/api/import`

**Checkpoint**: `npm test` in backend runs setup lifecycle without errors; MSW server boots in frontend test environment

---

## Phase 3: User Story 1 — Backend API Integration Tests (Priority: P1) 🎯 MVP

**Goal**: Every existing API route has at least one success-path and one error-path integration test executed against the real Fastify server backed by `mongodb-memory-server`.

**Independent Test**: Run `cd backend && npm test -- tests/integration` — all integration route tests pass in isolation.

- [X] T012 [P] [US1] Create `backend/tests/integration/routes/achievements.test.ts` — test GET, create, and list achievements; assert 200 success, 400 invalid input, 404 missing resource status codes
- [X] T013 [P] [US1] Create `backend/tests/integration/routes/backup.test.ts` — test list backups, trigger backup job, assert 200/202 success and 400 invalid request error responses
- [X] T014 [P] [US1] Create `backend/tests/integration/routes/exportImport.test.ts` — test export data and import data endpoints; assert correct content-type headers and 400 on malformed import payload
- [X] T015 [P] [US1] Create `backend/tests/integration/routes/games.test.ts` — test GET all games (empty and populated), GET game by id, assert 200 success, 400 invalid query params, 404 not found
- [X] T016 [P] [US1] Create `backend/tests/integration/routes/icons.test.ts` — test GET icon, assert 200 with image response and 404 for unknown game
- [X] T017 [P] [US1] Create `backend/tests/integration/routes/profiles.test.ts` — test GET profiles, POST create profile, GET by id, DELETE; assert 200, 201, 400, 404 status codes
- [X] T018 [P] [US1] Create `backend/tests/integration/routes/settings.test.ts` — test GET settings and PUT settings update; assert 200 success and 400 for invalid setting keys/values
- [X] T019 [P] [US1] Create `backend/tests/integration/routes/sync.test.ts` — test POST start sync, POST cancel sync, GET sync status; assert 200/202 success, 409 conflict when already running, 404 for unknown job
- [X] T020 [P] [US1] Create `backend/tests/integration/routes/syncRuns.test.ts` — test GET sync run history by profile, assert 200 with array response and 404 for unknown profile
- [X] T021 [P] [US1] Create `backend/tests/integration/routes/system.test.ts` — test GET `/api/health` returns `{ status: "ok" }` with 200; test GET `/api/version` returns semver string with 200

**Checkpoint**: `cd backend && npm test -- --coverage` passes with ≥ 70% aggregate coverage across route files; US1 acceptance scenarios verified

---

## Phase 4: User Story 2 — Frontend Component & Page Tests (Priority: P2)

**Goal**: All 12 shared components and all 8 app pages have tests covering their primary render states (loading, success, error, empty) and key user interactions, with `apiClient` HTTP calls intercepted by MSW.

**Independent Test**: Run `cd frontend && npm test` — all component and page tests pass in isolation without a running backend.

### Shared Component Tests

- [X] T022 [P] [US2] Create `frontend/tests/components/BackupProgressModal.test.tsx` — test loading state renders progress indicator and cancel button; test success state renders completion message; test closed state renders nothing
- [X] T023 [P] [US2] Create `frontend/tests/components/GameGrid.test.tsx` — test empty state renders empty message; test populated state renders correct number of `GameTile` elements; test loading state renders skeleton/spinner
- [X] T024 [P] [US2] Create `frontend/tests/components/GameTile.test.tsx` — test renders game name, cover image alt text, and sync status indicator; test click interaction triggers expected callback
- [X] T025 [P] [US2] Create `frontend/tests/components/Logo.test.tsx` — test renders logo image or SVG with correct accessible label
- [X] T026 [P] [US2] Create `frontend/tests/components/ProfileSelector.test.tsx` — test renders list of profiles; test selecting a profile triggers onSelect callback; test empty state renders add-profile prompt
- [X] T027 [P] [US2] Create `frontend/tests/components/ProfileSyncControls.test.tsx` — test sync button renders and triggers onSync callback on click; test cancel button visible during active sync; test disabled state when sync is running
- [X] T028 [P] [US2] Create `frontend/tests/components/ProgressIndicator.test.tsx` — test renders progress percentage; test 0% and 100% boundary values display correctly
- [X] T029 [P] [US2] Create `frontend/tests/components/RestoreProgressModal.test.tsx` — test loading state renders progress and cancel button; test error state displays error message; test success state renders completion message
- [X] T030 [P] [US2] Create `frontend/tests/components/SchedulerSettings.test.tsx` — test renders current schedule value; test editing schedule field updates displayed value; test save triggers onSave callback
- [X] T031 [P] [US2] Create `frontend/tests/components/SyncSettings.test.tsx` — test renders sync toggle and interval input; test toggling sync enabled triggers callback; test invalid interval shows validation message
- [X] T032 [P] [US2] Create `frontend/tests/components/SyncStatus.test.tsx` — test idle state renders idle label; test syncing state renders progress; test error state renders error message with `role="alert"`; test success state renders last-synced timestamp
- [X] T033 [P] [US2] Create `frontend/tests/components/Toast.test.tsx` — test info/success/error variants render with correct styling class or icon; test auto-dismiss fires onClose after timeout using fake timers

### Page Tests

- [X] T034 [P] [US2] Create `frontend/tests/pages/home.test.tsx` for `app/page.tsx` — test page mounts and renders main navigation or redirect; assert no unhandled MSW requests
- [X] T035 [P] [US2] Create `frontend/tests/pages/steam.test.tsx` for `app/steam/page.tsx` — test empty state (MSW returns `{ games: [] }`); test populated state renders game grid; test error state (MSW returns 500) displays error UI
- [X] T036 [P] [US2] Create `frontend/tests/pages/steamGame.test.tsx` for `app/steam/game/[id]/page.tsx` — test game detail renders title and achievement list; test 404 MSW response renders not-found UI
- [X] T037 [P] [US2] Create `frontend/tests/pages/playstation.test.tsx` for `app/playstation/page.tsx` — test empty state; test populated game grid; test error state from MSW 500
- [X] T038 [P] [US2] Create `frontend/tests/pages/xbox.test.tsx` for `app/xbox/page.tsx` — test empty state; test populated game grid; test error state from MSW 500
- [X] T039 [P] [US2] Create `frontend/tests/pages/settings.test.tsx` for `app/settings/page.tsx` — test settings form renders fields; test save submits PUT `/api/settings` (verified by MSW handler); test success toast appears after save
- [X] T040 [P] [US2] Create `frontend/tests/pages/settingsEdit.test.tsx` for `app/settings/edit/[id]/page.tsx` — test renders edit form prefilled with existing value; test submit triggers correct API call; mock `useParams` with `vi.mock('next/navigation')`
- [X] T041 [P] [US2] Create `frontend/tests/pages/setup.test.tsx` for `app/setup/page.tsx` — test setup wizard initial step renders; test required fields validated before allowing next step; test completion redirects (mock `useRouter`)

**Checkpoint**: `cd frontend && npm test -- --coverage` passes with ≥ 60% aggregate coverage across component and page files; US2 acceptance scenarios verified

---

## Phase 5: User Story 3 — Critical Service Logic Unit Tests (Priority: P3)

**Goal**: Core backend services and adapters have unit tests with all external dependencies mocked, covering normal operation and key failure/edge cases.

**Independent Test**: Run `cd backend && npm test -- tests/unit` — all unit tests pass in isolation with zero real network calls or database connections.

- [X] T042 [P] [US3] Create `backend/tests/unit/services/syncService.test.ts` — mock Mongoose models and platform adapters with `vi.mock`; test sync start records a sync run; test cancellation via `syncCancellation` halts mid-run; test adapter failure results in structured error in sync run record
- [X] T043 [P] [US3] Create `backend/tests/unit/services/scheduler.test.ts` — mock `node-cron` with `vi.mock('node-cron')`; test that `start()` registers cron job with correct expression; test that updating schedule re-registers job without restart; test that `stop()` destroys the cron task
- [X] T044 [P] [US3] Create `backend/tests/unit/services/rateLimiter.test.ts` — test requests under limit are allowed; test requests over limit are rejected/queued per policy; test window reset restores capacity; use `vi.useFakeTimers()` for time-based window tests
- [X] T045 [P] [US3] Create `backend/tests/unit/services/adaptiveBatchController.test.ts` — test initial batch size; test batch size decreases on error signal; test batch size increases on success signal up to configured maximum
- [X] T046 [P] [US3] Create `backend/tests/unit/services/adaptiveConcurrencyController.test.ts` — test concurrency limit is respected; test limit adjusts upward under low utilization; test limit adjusts downward under high error rate
- [X] T047 [P] [US3] Create `backend/tests/unit/services/adaptiveThrottler.test.ts` — test delay is applied between requests; test delay increases under rate-limit response signals; test delay decreases on sustained success
- [X] T048 [P] [US3] Create `backend/tests/unit/services/syncCancellation.test.ts` — test `cancel(jobId)` sets cancellation flag; test `isCancelled(jobId)` returns true after cancel; test `clear(jobId)` resets flag; test that cancelling unknown jobId is a no-op
- [X] T049 [P] [US3] Create `backend/tests/unit/services/configService.test.ts` — mock Mongoose `Setting` model; test `get(key)` returns value from mocked model; test `set(key, value)` calls model upsert; test missing key returns configured default
- [X] T050 [P] [US3] Create `backend/tests/unit/services/adapters/steam.test.ts` — mock `fetch` / HTTP client with `vi.mock`; test `getGames(steamId)` returns mapped game array on success; test `getAchievements(gameId)` returns achievement list; test network failure returns structured error object
- [X] T051 [P] [US3] Create `backend/tests/unit/services/adapters/steamgriddb.test.ts` — mock HTTP client; test `getGameArt(gameId)` returns image URL on success; test 404 response returns `null`; test API key missing throws configuration error
- [X] T052 [P] [US3] Create `backend/tests/unit/utils/crypto.test.ts` — test `encrypt(value, key)` returns non-plaintext string; test `decrypt(encrypted, key)` round-trips to original value; test decryption with wrong key throws; test empty string input is handled

**Checkpoint**: `cd backend && npm test -- tests/unit` passes; coverage for `src/services/**` and `src/utils/crypto.ts` meets 70% threshold

---

## Phase 6: User Story 4 — Automated CI Test Gating (Priority: P4)

**Goal**: GitHub Actions runs both test suites automatically on every pull request and blocks merge on any failure.

**Independent Test**: Open a pull request — both `Test Backend` and `Test Frontend` status checks appear on the PR and must be green before merge is permitted.

- [X] T053 [US4] Add `test-backend` job to `.github/workflows/build.yml` — checkout, setup Node 20 with npm cache on `backend/package-lock.json`, `npm ci` in `backend/`, `npm test -- --coverage` in `backend/`; job runs in parallel with existing `build-backend`
- [X] T054 [P] [US4] Add `test-frontend` job to `.github/workflows/build.yml` — checkout, setup Node 20 with npm cache on `frontend/package-lock.json`, `npm ci` in `frontend/`, `npm test -- --coverage` in `frontend/`; job runs in parallel with existing `build-frontend`

**Checkpoint**: Push branch to GitHub — Actions tab shows `Test Backend` and `Test Frontend` jobs running; both appear as required checks on the pull request; a forced test failure blocks merge

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, environment hygiene, developer experience.

- [X] T055 Run `cd backend && npm test -- --coverage` end-to-end per `quickstart.md`; confirm all route and service test files are discovered, all tests pass, coverage report is printed to stdout, exit code is 0
- [X] T056 [P] Run `cd frontend && npm test -- --coverage` end-to-end per `quickstart.md`; confirm all component and page test files are discovered, all tests pass, MSW `onUnhandledRequest: 'error'` is active, coverage report is printed to stdout, exit code is 0
- [X] T057 [P] Verify `npm test` exits with code 1 when a test is intentionally broken (manually break one assertion, run, confirm failure, revert)

**Checkpoint**: All quickstart.md scenarios produce expected output; CI shows green on the feature branch PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 completion — **BLOCKS Phases 3, 4, 5**
- **Phase 3 (US1)**: Depends on Phase 2; no dependency on Phases 4 or 5
- **Phase 4 (US2)**: Depends on Phase 2; no dependency on Phases 3 or 5
- **Phase 5 (US3)**: Depends on Phase 1 only (unit tests don't need mongodb-memory-server or MSW); can start after T004 and T006 are done
- **Phase 6 (US4)**: Depends on Phases 3 + 4 (needs passing tests to gate)
- **Phase 7 (Polish)**: Depends on Phases 3 + 4 + 5 + 6

### User Story Dependencies

| Story | Can start after | Depends on other stories? |
|-------|----------------|--------------------------|
| US1 (P1) | Phase 2 complete | No |
| US2 (P2) | Phase 2 complete | No |
| US3 (P3) | Phase 1 complete (T004, T006) | No |
| US4 (P4) | US1 + US2 complete | Yes — needs green tests to gate |

### Within Each Phase

- All route test files in Phase 3 are [P] — write in any order or simultaneously
- All component and page test files in Phase 4 are [P] — write in any order or simultaneously
- All service unit test files in Phase 5 are [P] — write in any order or simultaneously
- Phase 6 jobs (T053, T054) are [P] — both CI jobs can be added in the same commit

---

## Parallel Execution Examples

### User Story 1 — Backend API integration tests (all 10 routes in parallel)

```bash
# After Phase 2 is complete, all route test files can be written simultaneously:
# T012 backend/tests/integration/routes/achievements.test.ts
# T013 backend/tests/integration/routes/backup.test.ts
# T014 backend/tests/integration/routes/exportImport.test.ts
# T015 backend/tests/integration/routes/games.test.ts
# T016 backend/tests/integration/routes/icons.test.ts
# T017 backend/tests/integration/routes/profiles.test.ts
# T018 backend/tests/integration/routes/settings.test.ts
# T019 backend/tests/integration/routes/sync.test.ts
# T020 backend/tests/integration/routes/syncRuns.test.ts
# T021 backend/tests/integration/routes/system.test.ts
```

### User Story 2 — Frontend tests (all 20 files in parallel)

```bash
# After Phase 2 is complete, all component and page test files can be written simultaneously:
# T022-T033: frontend/tests/components/*.test.tsx  (12 files)
# T034-T041: frontend/tests/pages/*.test.tsx        (8 files)
```

### User Story 3 — Service unit tests (all 11 files in parallel)

```bash
# After T004 + T006, all service unit test files can be written simultaneously:
# T042-T052: backend/tests/unit/services/**/*.test.ts  (11 files)
```

### User Stories 1 + 2 + 3 — Running in parallel while staffed

Once Phase 2 is complete, US1, US2, and US3 have zero cross-dependencies and can be implemented simultaneously by different contributors.

---

## Implementation Strategy

### MVP Scope (US1 alone)

Completing Phases 1–3 (T001–T021) delivers a fully operational backend regression suite for all 10 API routes with coverage reporting and CI gating scaffolded. This is independently valuable and can be merged before US2 or US3 begin.

### Incremental Delivery Order

1. **Phases 1 + 2** (T001–T011): Infrastructure foundation — no observable user value yet but enables all subsequent work
2. **Phase 3 / US1** (T012–T021): Backend API test suite — immediate regression protection for existing routes ← **Suggested merge point #1**
3. **Phase 4 / US2** (T022–T041): Frontend component and page test suite — adds UI regression protection ← **Suggested merge point #2**
4. **Phase 5 / US3** (T042–T052): Service unit tests — deepens backend coverage for complex business logic ← **Suggested merge point #3**
5. **Phases 6 + 7 / US4 + Polish** (T053–T057): CI gating activated; full regression suite complete ← **Final merge**

---

## Task Count Summary

| Phase | Tasks | Parallel | Story |
|-------|-------|----------|-------|
| Phase 1: Setup | 7 (T001–T007) | 3 [P] | — |
| Phase 2: Foundational | 4 (T008–T011) | 2 [P] | — |
| Phase 3: US1 Backend API Tests | 10 (T012–T021) | 10 [P] | US1 |
| Phase 4: US2 Frontend Tests | 20 (T022–T041) | 20 [P] | US2 |
| Phase 5: US3 Service Unit Tests | 11 (T042–T052) | 11 [P] | US3 |
| Phase 6: US4 CI Gating | 2 (T053–T054) | 1 [P] | US4 |
| Phase 7: Polish | 3 (T055–T057) | 2 [P] | — |
| **Total** | **57** | **49 [P]** | |
