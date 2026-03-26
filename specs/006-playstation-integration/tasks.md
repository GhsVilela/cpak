# Tasks: PlayStation Integration

**Input**: Design documents from `/specs/006-playstation-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-contracts.md, quickstart.md

**Tests**: Tests are REQUIRED per Constitution Principle VI for every new frontend page and new backend route/service.

**Coverage Floor**: Both `frontend/` and `backend/` MUST maintain ≥60% line coverage after every change. After any implementation task, verify with `npm run test -- --coverage`.

**Change Validation**: When modifying an existing source file, run the tests for that file and fix any failures before proceeding. Implementation and test updates are one atomic unit of work.

**Organization**: Tasks are grouped by user story. User stories map to spec.md priorities (P1 → P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies and prepare project structure

- [X] T001 Install `psn-api` npm package as a dependency in backend/package.json
- [X] T002 Create directory frontend/app/playstation/game/[id]/ for the game detail page route

---

## Phase 2: Foundational (Model Extensions)

**Purpose**: Schema changes that serve multiple user stories — MUST complete before ANY story implementation

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Add `trophyGrade` field (String enum: `'bronze'`, `'silver'`, `'gold'`, `'platinum'`, default `null`) and `isHidden` field (Boolean, default `false`) to Achievement schema in backend/src/models/achievement.ts
- [X] T004 [P] Add `trophyBronze`, `trophySilver`, `trophyGold`, `trophyPlatinum` fields (Number, default `null`) to Game schema in backend/src/models/game.ts
- [X] T005 Run existing backend tests (`cd backend && npm run test`) and fix any failures caused by schema changes

**Checkpoint**: Model extensions complete — user story implementation can begin

---

## Phase 3: User Story 1 — PlayStation Account Authentication (Priority: P1) 🎯 MVP

**Goal**: Users can connect their PSN account by providing an NPSSO token, which is exchanged for OAuth access + refresh tokens (~60-day refresh lifespan) and validated by fetching the user's PSN Online ID and avatar.

**Independent Test**: Navigate to settings, add a PlayStation profile with a valid NPSSO token, verify the profile appears with the correct PSN Online ID and avatar. Verify expired/invalid tokens show clear error messages.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US1] Write unit tests for PlayStationAdapter auth methods (exchangeNpssoForTokens, refreshAccessToken, getProfile) — mock `psn-api` functions — in backend/tests/unit/playstation-adapter.test.ts
- [X] T007 [P] [US1] Write integration test for POST /api/auth/playstation/validate endpoint (valid token → 200 with accountId/onlineId, invalid → 400 with error) in backend/tests/integration/routes/playstation-auth.test.ts

### Implementation for User Story 1

- [X] T008 [US1] Create PlayStationAdapter class with auth methods: `exchangeNpssoForTokens(npsso)` (calls `exchangeNpssoForCode` + `exchangeCodeForAccessToken`), `refreshAccessToken(refreshToken)` (calls `exchangeRefreshTokenForAuthTokens`), `getProfile(accessToken)` (fetches PSN Online ID + avatar) in backend/src/services/adapters/playstation.ts
- [X] T009 [US1] Add POST /api/auth/playstation/validate endpoint — accepts `{ npssoToken }`, validates via NPSSO→OAuth exchange + profile fetch, returns `{ valid, accountId, onlineId }` or error — in backend/src/api/routes/auth.ts
- [X] T010 [US1] Add PlayStation NPSSO→OAuth exchange handling to profile creation flow (POST /api/profiles) — exchange NPSSO for tokens, fetch profile, store encrypted OAuth credentials (access token, refresh token, expiresAt), discard raw NPSSO — in backend/src/api/ routes or backend/src/services/
- [X] T011 [US1] Run all US1 tests, verify they pass, check backend coverage ≥60%

**Checkpoint**: Users can create PlayStation profiles via NPSSO token — testable independently

---

## Phase 4: User Story 2 — PlayStation Game & Trophy Sync (Priority: P1)

**Goal**: Sync all PlayStation games where the user has earned ≥1 trophy, retrieving trophy grade breakdown (bronze/silver/gold/platinum), platform generation (PS3/PS4/PS5/PS Vita), completion percentage, hidden trophy resolution, and real-time sync progress tracking.

**Independent Test**: Create a PlayStation profile (US1), trigger sync via POST /api/sync/playstation, verify games with trophies appear with correct trophy counts, grade breakdown, platform generation in `devices`, and individual trophy records with `trophyGrade` set.

**Dependencies**: Requires US1 (authentication)

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US2] Write unit tests for PlayStationAdapter sync methods (getTrophyTitles, getTrophyDefinitions, getEarnedTrophies, resolveHiddenTrophies) with mocked `psn-api` responses in backend/tests/unit/playstation-adapter.test.ts
- [X] T013 [P] [US2] Write integration test for POST /api/sync/playstation endpoint (sync creates games with trophy fields, achievements with trophyGrade, correct devices array) in backend/tests/integration/routes/playstation-sync.test.ts

### Implementation for User Story 2

- [X] T014 [US2] Add sync data methods to PlayStationAdapter: `getTrophyTitles(auth, accountId)` wrapping `getUserTitles` with pagination, `getTrophyDefinitions(auth, npCommunicationId)` wrapping `getTitleTrophies`, `getEarnedTrophies(auth, accountId, npCommunicationId)` wrapping `getUserTrophiesEarnedForTitle` in backend/src/services/adapters/playstation.ts
- [X] T015 [US2] Add rate limiting and retry logic with exponential backoff (200ms default delay, 2s initial backoff on 429, max 3 retries, terminal on 403 privacy errors) to PlayStationAdapter in backend/src/services/adapters/playstation.ts
- [X] T016 [US2] Add hidden trophy resolution: call trophy definitions endpoint for real names/descriptions of hidden trophies; fallback to "Hidden Trophy" with generic icon if definitions redact them — in backend/src/services/adapters/playstation.ts
- [X] T017 [US2] Map `trophyTitlePlatform` to `devices` array (PS3→`['PS3']`, PS4→`['PS4']`, PS5→`['PS5']`, PSVITA/PSVita→`['PSVita']`; handle cross-gen comma-separated values) in backend/src/services/adapters/playstation.ts
- [X] T018 [US2] Implement `syncPlayStation(profileId)` method in backend/src/services/syncService.ts — orchestrate: refresh tokens if needed → fetch trophy titles → per-game fetch definitions + earned status → upsert Game (with trophyBronze/Silver/Gold/Platinum, devices, completionPercent) → upsert Achievement (with trophyGrade, isHidden) → track SyncOperation progress
- [X] T019 [US2] Add POST /api/sync/playstation route — accept `profileId` query param, validate profile exists with platform='playstation', call `syncPlayStation`, return 202 with operationId — in backend/src/api/ routes
- [X] T020 [US2] Run all US2 tests, verify they pass, check backend coverage ≥60%

**Checkpoint**: Full trophy sync operational — games, trophies, grades, platform generation all stored correctly

---

## Phase 5: User Story 3 — PlayStation Image Fetching with Fallback Chain (Priority: P2)

**Goal**: Download game cover art and trophy icons from PlayStation CDN as the primary source, falling back to SteamGridDB → PCGamingWiki → Wikipedia for game art. Store all images under `images/playstation/{gameId}/`.

**Independent Test**: Sync a PlayStation profile, verify game tiles display cover art, trophy icons render, images are stored under `images/playstation/`, and fallback sources activate when PlayStation CDN fails.

**Dependencies**: Requires US2 (sync provides games/trophies to fetch images for)

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T021 [P] [US3] Write unit tests for PlayStationAdapter image methods (downloadGameImage with full fallback chain, downloadTrophyIcon) — mock HTTP responses for CDN success/failure scenarios — in backend/tests/unit/playstation-adapter.test.ts

### Implementation for User Story 3

- [X] T022 [US3] Add `downloadGameImage(gameTitle, npCommunicationId, trophyTitleIconUrl)` method to PlayStationAdapter — try PlayStation CDN (`trophyTitleIconUrl`) → SteamGridDB (search by title via existing adapter) → PCGamingWiki → Wikipedia — store under `images/playstation/{npCommunicationId}/game_grid.jpg` in backend/src/services/adapters/playstation.ts
- [X] T023 [US3] Add `downloadTrophyIcon(npCommunicationId, trophyId, trophyIconUrl)` method to PlayStationAdapter — download from PlayStation CDN, store under `images/playstation/{npCommunicationId}/{trophyId}_icon.png` in backend/src/services/adapters/playstation.ts
- [X] T024 [US3] Integrate image downloading into the syncPlayStation() flow — download game art after game upsert, download trophy icons after achievement upsert, track icon download progress via SyncOperation counters — in backend/src/services/syncService.ts
- [X] T025 [US3] Run all US3 tests, verify they pass, check backend coverage ≥60%

**Checkpoint**: PlayStation images downloaded and stored locally — game tiles render with cover art, trophies with icons

---

## Phase 6: User Story 4 — PlayStation Game Library Browsing with Trophy Summary (Priority: P2)

**Goal**: PlayStation page displays trophy summary (total trophies + breakdown by grade for selected profile), game grid with cover art and completion percentages, console generation filter (PS3/PS4/PS5/PS Vita), sync controls, and re-auth notification banner.

**Independent Test**: Sync PlayStation data, navigate to /playstation, verify trophy summary stats display, game grid renders with images, generation filter works, and profile selector controls displayed data.

**Dependencies**: Requires US2 (synced data to display)

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T026 [P] [US4] Write frontend tests for PlayStation page — trophy summary rendering, generation filter interaction, empty state with setup prompt, profile selector — in frontend/tests/pages/playstation.test.tsx

### Implementation for User Story 4

- [X] T027 [US4] Add `trophySummary` aggregation (SUM of trophyBronze/Silver/Gold/Platinum across all games for profile) to GET /api/games response when `platform=playstation` in backend game routes
- [X] T028 [US4] Add `device` query parameter support for PlayStation generation filtering (PS3/PS4/PS5/PSVita) to GET /api/games endpoint in backend game routes
- [X] T029 [US4] Enhance PlayStation page with trophy summary header displaying total + bronze/silver/gold/platinum breakdown for the selected profile in frontend/app/playstation/page.tsx
- [X] T030 [US4] Add console generation filter UI (PS3/PS4/PS5/PS Vita) to PlayStation page in frontend/app/playstation/page.tsx
- [X] T031 [US4] Integrate ProfileSelector and ProfileSyncControls into PlayStation page in frontend/app/playstation/page.tsx
- [X] T032 [US4] Add re-auth notification banner — display when profile credentials are expired with instructions to obtain a new NPSSO token — in frontend/app/playstation/page.tsx
- [X] T033 [US4] Add empty state — when no PlayStation profiles configured, show message with link to settings page — in frontend/app/playstation/page.tsx
- [X] T034 [US4] Run all US4 tests, verify they pass, check frontend coverage ≥60%

**Checkpoint**: PlayStation library page fully functional — trophy summary, generation filter, sync controls, re-auth banner

---

## Phase 7: User Story 5 — PlayStation Game Detail & Trophy Page with Grade Badges (Priority: P2)

**Goal**: Game detail page at /playstation/game/[id] shows game title, trophy progress bar, play time (if available), last played (if available), and a trophy list where each trophy displays its grade badge (bronze/silver/gold/platinum), icon, name, description, unlock status, and unlock date.

**Independent Test**: Navigate to /playstation/game/[id], verify trophies display with correct grade badges (bronze=#cd7f32, silver=#a8a8a8, gold=#c8a800, platinum=#a0b4c8), unlock status shows dates for earned trophies, hidden trophies show "Hidden Trophy" fallback, play time/last played omitted when null.

**Dependencies**: Requires US2 (synced trophy data)

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T035 [P] [US5] Write tests for TrophyGradeBadge component — renders correct color/label for each grade, handles edge cases — in frontend/tests/components/trophy-grade-badge.test.tsx
- [X] T036 [P] [US5] Write tests for PlayStation game detail page — trophy list rendering, grade badges, locked/unlocked state, hidden trophy display, play time conditional rendering — in frontend/tests/pages/playstation-game.test.tsx

### Implementation for User Story 5

- [X] T037 [US5] Create TrophyGradeBadge component with distinct colors per grade (platinum: #a0b4c8/#1a3a5c, gold: #c8a800/#7a6800, silver: #a8a8a8/#4a4a4a, bronze: #cd7f32/#7a4b1e) in frontend/components/TrophyGradeBadge.tsx
- [X] T038 [US5] Create PlayStation game detail page displaying game title, trophy progress bar (earned/total), play time (if available), last played date (if available), and full trophy list — in frontend/app/playstation/game/[id]/page.tsx
- [X] T039 [US5] Integrate TrophyGradeBadge into each trophy row, display trophy icon with CSS grayscale filter for locked trophies, show unlock date for earned trophies — in frontend/app/playstation/game/[id]/page.tsx
- [X] T040 [US5] Handle hidden trophy display — show resolved name/description when available, fallback to "Hidden Trophy" placeholder with generic locked icon — in frontend/app/playstation/game/[id]/page.tsx
- [X] T041 [US5] Conditionally render play time and last played sections — omit when data is null rather than showing empty placeholders — in frontend/app/playstation/game/[id]/page.tsx
- [X] T042 [US5] Run all US5 tests, verify they pass, check frontend coverage ≥60%

**Checkpoint**: Game detail page with trophy grade badges fully functional

---

## Phase 8: User Story 6 — PlayStation Scheduled Auto-Sync (Priority: P3)

**Goal**: PlayStation profiles are included in the scheduled auto-sync mechanism alongside Steam and Xbox profiles, with graceful handling of expired credentials.

**Independent Test**: Configure a sync schedule, wait for it to trigger, verify PlayStation profiles are included in the sync run. Verify profiles with expired refresh tokens are skipped with a logged warning.

**Dependencies**: Requires US2 (sync infrastructure)

### Tests for User Story 6

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T043 [P] [US6] Write test for PlayStation inclusion in scheduled sync — verify scheduler iterates PlayStation profiles, verify expired-credential profiles are skipped with warning — in backend/tests/unit/ or backend/tests/integration/

### Implementation for User Story 6

- [X] T044 [US6] Include PlayStation profiles in scheduled auto-sync loop — query all profiles with platform='playstation', call syncPlayStation for each — in backend/src/services/syncService.ts or scheduler service
- [X] T045 [US6] Add credential expiration handling in auto-sync — check if refresh token is expired before attempting sync, skip profile with a structured log warning, continue with remaining profiles — in backend/src/services/syncService.ts
- [X] T046 [US6] Run all US6 tests, verify they pass, check backend coverage ≥60%

**Checkpoint**: PlayStation auto-sync operational alongside Steam and Xbox

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and cross-cutting improvements

- [X] T047 [P] Run full backend test suite with coverage (`cd backend && npm run test -- --coverage`) — verify ≥60% line coverage
- [X] T048 [P] Run full frontend test suite with coverage (`cd frontend && npm run test -- --coverage`) — verify ≥60% line coverage
- [X] T049 Verify PlayStation profile cascade-delete removes all associated games, achievements, sync operations, and images under `images/playstation/{gameId}/`
- [X] T050 Run quickstart.md validation — verify implementation matches all steps in specs/006-playstation-integration/quickstart.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 Auth (Phase 3)**: Depends on Foundational — BLOCKS US2
- **US2 Sync (Phase 4)**: Depends on US1 — BLOCKS US3, US4, US5, US6
- **US3 Images (Phase 5)**: Depends on US2 — can run in parallel with US4, US5, US6
- **US4 Library (Phase 6)**: Depends on US2 — can run in parallel with US3, US5, US6
- **US5 Detail (Phase 7)**: Depends on US2 — can run in parallel with US3, US4, US6
- **US6 Auto-Sync (Phase 8)**: Depends on US2 — can run in parallel with US3, US4, US5
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependency Graph

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: Model Extensions)
    ↓
Phase 3 (US1: Authentication) ← MVP entry point
    ↓
Phase 4 (US2: Trophy Sync) ← MVP core value
    ↓
    ├── Phase 5 (US3: Images)       ─┐
    ├── Phase 6 (US4: Library Page) ─┤ Can run in parallel
    ├── Phase 7 (US5: Detail Page)  ─┤
    └── Phase 8 (US6: Auto-Sync)    ─┘
                                     ↓
                      Phase 9 (Polish)
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/schema changes before services
- Services before endpoints/routes
- Backend before frontend (when story spans both)
- Core implementation before integration
- Coverage check at story completion

### Parallel Opportunities

- **Phase 2**: T003 and T004 can run in parallel (different model files)
- **Phase 3**: T006 and T007 can run in parallel (different test files)
- **Phase 4**: T012 and T013 can run in parallel (different test files)
- **Phase 5–8**: US3, US4, US5, US6 can all start in parallel after US2 completes
- **Within US5**: T035 and T036 can run in parallel (component test vs page test)
- **Phase 9**: T047 and T048 can run in parallel (backend vs frontend coverage)

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

**Phase 1 + 2 + 3 (US1)**: Minimum testable increment — PlayStation profile creation via NPSSO token exchange

**+ Phase 4 (US2)**: Core value delivered — full trophy sync with grade metadata, platform generation, hidden trophy resolution

### Incremental Delivery Order

1. **MVP**: US1 (Auth) + US2 (Sync) — user can connect PSN account and sync all trophies with grade data
2. **Visual Polish**: US3 (Images) + US4 (Library Page) + US5 (Detail Page) — full browsing experience with cover art, trophy summary, grade badges
3. **Automation**: US6 (Auto-Sync) — hands-off scheduled syncing with credential expiration handling

### Key Technical Notes

- **`psn-api` package**: Provides typed wrappers for `exchangeNpssoForCode`, `exchangeCodeForAccessToken`, `exchangeRefreshTokenForAuthTokens`, `getUserTitles`, `getTitleTrophies`, `getUserTrophiesEarnedForTitle`
- **No new env vars**: All PSN auth is per-profile via NPSSO token exchange stored in settings collection
- **No new collections**: All data fits in existing profiles, games, achievements, sync_operations collections
- **Adapter pattern**: PlayStationAdapter follows the same pattern as existing Xbox/Steam adapters in backend/src/services/adapters/
- **Encryption**: OAuth tokens encrypted via existing AES-256-GCM mechanism in credentials field


