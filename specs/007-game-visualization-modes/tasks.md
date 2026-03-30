# Tasks: Game Visualization Modes & Image Management

**Input**: Design documents from `/specs/007-game-visualization-modes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED per Constitution Principle VI for every new frontend page and new backend route/service. Include test tasks by default.

**Coverage Floor**: Both `frontend/` and `backend/` MUST maintain ≥60% line coverage after every change (Principle VI). After any implementation task, verify with `npm run test --coverage` — if coverage drops below 60%, add tests before marking the feature done.

**Change Validation**: When modifying an existing source file, include a task to run the tests for that file and fix any failures or behavior-changed tests before merging. Implementation and test updates are one atomic unit of work.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration & model changes shared by all user stories

- [x] T001 Create migration script to rename `imagePath` → `capsuleImagePath` in `backend/src/migrations/007-game-image-fields.ts`
- [x] T002 Update Game model with `capsuleImagePath`, `iconImagePath`, `heroImagePath`, `customTitle` fields and remove `imagePath` in `backend/src/models/game.ts`
- [x] T003 Add `'hero'` to ImageType union and add resize logic for icon (64×64 JPEG) and hero (1920×620 JPEG) in `backend/src/utils/imageStorage.ts`
- [x] T004 Run existing tests for modified files (`backend/tests/unit/imageStorage.test.ts`, game model tests) and fix any failures caused by schema/type changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend infrastructure that MUST be complete before user story UI work can begin

**⚠️ CRITICAL**: No user story frontend work can begin until this phase is complete

- [x] T005 Add `getIconImages(gameId)` method to SteamGridDB adapter in `backend/src/services/adapters/steamgriddb.ts`
- [x] T006 [P] Update Steam adapter to download icon (from header.jpg CDN, resized to 64×64) and hero (from library_hero.jpg CDN) images alongside existing grid download, using `Promise.all` per-game parallelism in `backend/src/services/adapters/steam.ts`
- [x] T007 [P] Update Xbox adapter to download icon (from displayImage resized to 64×64) and hero (from Emerald superHeroArt) images alongside existing grid download, using `Promise.all` per-game parallelism in `backend/src/services/adapters/xbox.ts`
- [x] T008 [P] Update PlayStation adapter to download icon (from trophyTitleIconUrl resized to 64×64) and hero (from SteamGridDB getHeroImages when configured) images alongside existing grid download, using `Promise.all` per-game parallelism in `backend/src/services/adapters/playstation.ts`
- [x] T009 Update all adapters to store new image paths (`iconImagePath`, `heroImagePath`) on the game document after downloading in `backend/src/services/adapters/steam.ts`, `backend/src/services/adapters/xbox.ts`, `backend/src/services/adapters/playstation.ts`
- [x] T010 Run existing adapter and imageStorage tests, fix any failures caused by the changes in this phase

**Checkpoint**: Backend can now download, resize, store, and serve all three image types for all platforms

---

## Phase 3: User Story 1 — Switch Between Game Visualization Modes (Priority: P1) 🎯 MVP

**Goal**: Users can switch between Capsule (Grid), List, and Hero visualization modes on any platform page with per-platform preference persistence

**Independent Test**: Navigate to any platform page, switch between all three view modes, verify correct layout and images render, page reload preserves selection

### Tests for User Story 1

- [x] T011 [P] [US1] Create test for ViewModeSelector component in `frontend/tests/components/ViewModeSelector.test.tsx`
- [x] T012 [P] [US1] Create test for GameListItem component in `frontend/tests/components/GameListItem.test.tsx`
- [x] T013 [P] [US1] Create test for GameHeroCard component in `frontend/tests/components/GameHeroCard.test.tsx`

### Implementation for User Story 1

- [x] T014 [P] [US1] Create ViewModeSelector component (Capsule/List/Hero toggle, saves to localStorage per-platform key `cpak-view-mode-{platform}`) in `frontend/components/ViewModeSelector.tsx`
- [x] T015 [P] [US1] Create GameListItem component (64×64 icon, title, completion %, platform-specific stats like gamerscore/trophies, truncated title with ellipsis, placeholder icon with first letter when missing) in `frontend/components/GameListItem.tsx`
- [x] T016 [P] [US1] Create GameHeroCard component (1920×620 hero banner with title overlay, fallback placeholder when no hero image, completion badge) in `frontend/components/GameHeroCard.tsx`
- [x] T017 [US1] Update GameTile to use `capsuleImagePath` instead of `imagePath` in `frontend/components/GameTile.tsx`
- [x] T018 [US1] Update GameGrid to accept `viewMode` prop and render GameTile (capsule), GameListItem (list), or GameHeroCard (hero) based on mode, with appropriate responsive grid layouts per mode in `frontend/components/GameGrid.tsx`
- [x] T019 [US1] Integrate ViewModeSelector into Steam page, pass viewMode to GameGrid, load preference from localStorage on mount in `frontend/app/steam/page.tsx`
- [x] T020 [P] [US1] Integrate ViewModeSelector into Xbox page, pass viewMode to GameGrid, load preference from localStorage on mount in `frontend/app/xbox/page.tsx`
- [x] T021 [P] [US1] Integrate ViewModeSelector into PlayStation page, pass viewMode to GameGrid, load preference from localStorage on mount in `frontend/app/playstation/page.tsx`
- [x] T022 [US1] Run existing page tests for Steam, Xbox, PlayStation and update them to account for the new ViewModeSelector and GameGrid viewMode prop in `frontend/tests/pages/`

**Checkpoint**: Users can switch between three view modes on all platform pages. Capsule mode works identically to current behavior. List mode shows icons. Hero mode shows banners. Preference persists per-platform.

---

## Phase 4: User Story 2 — Multi-Type Image Downloading (Priority: P1)

**Goal**: All three image types (icon, hero, capsule) are downloaded during game sync from platform CDNs and optional SteamGridDB, with parallel downloads per-game

**Independent Test**: Trigger a game sync for any platform. Verify `/app/data/images/{platform}/{gameId}/` contains `game_icon.jpg`, `game_hero.jpg`, and `game_grid.jpg`. Re-sync and verify images are not re-downloaded.

> Note: The backend download logic was implemented in Phase 2 (T005–T009). This phase validates the full end-to-end flow and ensures cache-skip works.

### Tests for User Story 2

- [x] T023 [P] [US2] Add unit tests for icon resize (64×64) and hero resize (1920×620) in imageStorage in `backend/tests/unit/imageStorage.test.ts`
- [x] T024 [P] [US2] Add integration test for `GET /api/games` response including `capsuleImagePath`, `iconImagePath`, `heroImagePath` fields in `backend/tests/integration/routes/games.test.ts`

### Implementation for User Story 2

- [x] T025 [US2] Verify `checkLocalFile` in imageStorage correctly detects existing `game_icon` and `game_hero` files to skip re-download in `backend/src/utils/imageStorage.ts`
- [x] T026 [US2] Ensure games API response includes all three image path fields and `customTitle` (update response mapping if needed) in `backend/src/api/routes/games.ts`
- [x] T027 [US2] Run backend coverage check (`npm run test -- --coverage` in `backend/`) and verify ≥60% line coverage is maintained

**Checkpoint**: Full sync downloads icon + hero + capsule for every game. API returns all three paths. Placeholders display for missing images.

---

## Phase 5: User Story 3 — Search Games by Name (Priority: P2)

**Goal**: Users can search games by title on any platform page with server-side filtering and 300ms debounce

**Independent Test**: Navigate to platform page with 100+ games, type a game name, verify only matching games display. Clear search, verify all games return. Test with active filters (Only Completed, device filter).

### Tests for User Story 3

- [x] T028 [P] [US3] Create test for GameSearchInput component (debounce behavior, clear, empty state) in `frontend/tests/components/GameSearchInput.test.tsx`
- [x] T029 [P] [US3] Add integration test for `GET /api/games?search=...` query parameter (case-insensitive matching, regex escaping, combination with existing filters) in `backend/tests/integration/routes/games.test.ts`

### Implementation for User Story 3

- [x] T030 [US3] Add `search` query parameter handling to GET /api/games route with escaped `$regex` and case-insensitive `$options: 'i'` in `backend/src/api/routes/games.ts`
- [x] T031 [US3] Create GameSearchInput component with 300ms debounce using `useRef` + `setTimeout`, clear button, and "No games found" empty state in `frontend/components/GameSearchInput.tsx`
- [x] T032 [US3] Integrate GameSearchInput into Steam page — wire search state to games API query, reset pagination offset to 0 on search, maintain search across view mode switches in `frontend/app/steam/page.tsx`
- [x] T033 [P] [US3] Integrate GameSearchInput into Xbox page with same search behavior in `frontend/app/xbox/page.tsx`
- [x] T034 [P] [US3] Integrate GameSearchInput into PlayStation page with same search behavior in `frontend/app/playstation/page.tsx`
- [x] T035 [US3] Update existing page tests for Steam, Xbox, PlayStation to cover search interaction in `frontend/tests/pages/`

**Checkpoint**: Search box visible on all platform pages. Typing filters games server-side. Works with all view modes and existing filters. Clear returns to full list.

---

## Phase 6: User Story 4 — Edit Game Image and Title (Priority: P3)

**Goal**: Users can edit a game's display title and upload custom images (icon, hero, capsule) with preview, validation, and sync-safe persistence

**Independent Test**: Click a game, open edit modal. Change title, verify it persists. Upload each image type, verify resize and display. Re-sync, verify custom title and images are preserved.

### Tests for User Story 4

- [x] T036 [P] [US4] Create test for GameEditModal component (render current images, title edit, image preview, upload flow, validation errors) in `frontend/tests/components/GameEditModal.test.tsx`
- [x] T037 [P] [US4] Add integration tests for `PATCH /api/games/:id` (title update, null reset) and `PATCH /api/games/:id/images/:imageType` (file upload, validation, resize) in `backend/tests/integration/routes/games.test.ts`

### Implementation for User Story 4

- [x] T038 [US4] Add `PATCH /api/games/:id` route for title edit (accept `customTitle` string or null, validate, update game document) in `backend/src/api/routes/games.ts`
- [x] T039 [US4] Add `PATCH /api/games/:id/images/:imageType` route for image upload (multipart form, validate file ≤10MB, validate image format via Sharp metadata, resize to target dimensions, store, update game document) in `backend/src/api/routes/games.ts`
- [x] T040 [US4] Update sync adapters to skip overwriting `customTitle` when it is set (check `customTitle !== null` before updating title) in `backend/src/services/adapters/steam.ts`, `backend/src/services/adapters/xbox.ts`, `backend/src/services/adapters/playstation.ts`
- [x] T041 [US4] Create GameEditModal component with: current image previews for all three types, title input (pre-filled with customTitle or title), file upload inputs per image type with client-side preview before save, save/cancel buttons, error display for invalid uploads in `frontend/components/GameEditModal.tsx`
- [x] T042 [US4] Add edit button/action to GameTile, GameListItem, and GameHeroCard components that opens GameEditModal for the selected game in `frontend/components/GameTile.tsx`, `frontend/components/GameListItem.tsx`, `frontend/components/GameHeroCard.tsx`
- [x] T043 [US4] Wire GameEditModal save actions to `PATCH /api/games/:id` and `PATCH /api/games/:id/images/:imageType` API calls, refresh game list after successful save in `frontend/components/GameEditModal.tsx`

**Checkpoint**: Users can edit title and images for any game from any view mode. Edits persist across syncs. Upload validation works (10MB, valid image format).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, coverage checks, and cross-story integration verification

- [x] T044 Run full backend test suite with coverage and verify ≥60% line coverage in `backend/`
- [x] T045 Run full frontend test suite with coverage and verify ≥60% line coverage in `frontend/`
- [x] T046 Run quickstart.md verification steps end-to-end: migration → sync → view modes → search → edit
- [x] T047 Verify all three platform pages (Steam, Xbox, PlayStation) display correctly in all three view modes with real synced data
- [x] T048 Verify image placeholders render correctly when icon/hero images are missing (first-letter icon placeholder, styled hero placeholder)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 — frontend view modes
- **User Story 2 (Phase 4)**: Depends on Phase 2 — validates backend image pipeline end-to-end
- **User Story 3 (Phase 5)**: Depends on Phase 2 — can proceed in parallel with US1
- **User Story 4 (Phase 6)**: Depends on Phase 2 — can proceed in parallel with US1/US3, but benefits from US1 being done (edit buttons in view components)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2. No dependencies on other stories. 🎯 MVP
- **User Story 2 (P1)**: Can start after Phase 2. Backend work overlaps with Phase 2; this phase validates and tests the end-to-end flow.
- **User Story 3 (P2)**: Can start after Phase 2. Independent of US1 and US2. Search works in any view mode.
- **User Story 4 (P3)**: Can start after Phase 2. Ideally after US1 (needs view components for edit buttons). Title persistence requires adapters from Phase 2.

### Parallel Opportunities

Within **Phase 1**: T001, T002, T003 are sequential (model depends on migration, imageStorage is independent but T004 validates all)
Within **Phase 2**: T006, T007, T008 can run in parallel (different adapter files)
Within **Phase 3**: T011, T012, T013 can run in parallel (test files); T014, T015, T016 can run in parallel (new components); T020, T021 can run in parallel (Xbox + PS pages)
Within **Phase 5**: T028, T029 can run in parallel (frontend/backend tests); T033, T034 can run in parallel (Xbox + PS pages)
Within **Phase 6**: T036, T037 can run in parallel (frontend/backend tests)

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1)**

This delivers: database migration, multi-type image downloading, and the three visualization modes on all platform pages. Users can immediately switch between Capsule, List, and Hero views. Search and editing can be added incrementally.

---
