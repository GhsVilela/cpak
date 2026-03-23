# Tasks: Xbox Integration

**Input**: Design documents from `/specs/005-xbox-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/xbox-auth-api.md, contracts/xbox-sync-api.md, quickstart.md

**Tests**: Tests are REQUIRED per Constitution Principle VI for every new frontend page and new backend route/service. Test tasks included for all new routes, adapters, and pages.

**Organization**: Tasks are grouped by user story (6 stories: 2Ã—P1, 3Ã—P2, 1Ã—P3) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1â€“US6)
- Exact file paths included in all descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/tests/`
- **Frontend**: `frontend/app/`, `frontend/tests/`, `frontend/components/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependency and apply the one schema addition needed across multiple stories

- [X] T001 Install `@xboxreplay/xboxlive-auth` dependency in backend/package.json
- [X] T002 [P] Add optional `devices: string[]` field and compound index to Game model interface and schema in backend/src/models/game.ts
- [X] T003 [P] Add Xbox API MSW mock handlers (auth URL, callback, sync, games, achievements, settings) in frontend/tests/mocks/handlers.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core adapter and route registration that ALL user stories depend on

**âš ï¸ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create Xbox adapter with auth core methods (getAuthorizeUrl, exchangeCodeForTokens, refreshXboxTokens, getXboxProfile) in backend/src/services/adapters/xbox.ts
- [X] T005 [P] Register `/auth` route plugin in Fastify server in backend/src/api/routes/index.ts
- [X] T006 [P] Extend Zod validation schema for Xbox OAuth credential fields (refreshToken, tokenType, expiresAt, scopes) in backend/src/api/routes/profiles.ts

**Checkpoint**: Foundation ready â€” Xbox adapter auth core available, route plugin registered, profile validation accepts Xbox credentials

---

## Phase 3: User Story 1 â€” Xbox Account Authentication (Priority: P1) ðŸŽ¯ MVP

**Goal**: Users can select Xbox on the add-profile page, complete Microsoft OAuth login, and have an Xbox profile created with their gamertag and encrypted credentials.

**Independent Test**: Navigate to setup page â†’ select Xbox â†’ complete OAuth â†’ verify Xbox profile appears in profiles list with correct gamertag and avatar.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [X] T007 [P] [US1] Write integration tests for GET /api/auth/xbox/url and GET /api/auth/xbox/callback routes (success flow, error flow, missing settings, duplicate XUID upsert) in backend/tests/integration/routes/auth.test.ts
- [X] T008 [P] [US1] Write tests for setup page platform card selector (render 3 platforms, Xbox selection shows "Sign in with Xbox" button, Steam selection shows API key form) in frontend/tests/pages/setup.test.tsx

### Implementation for User Story 1

- [X] T009 [US1] Implement GET /api/auth/xbox/url (generate OAuth URL from settings) and GET /api/auth/xbox/callback (exchange code, create/upsert profile, redirect) in backend/src/api/routes/auth.ts
- [X] T010 [P] [US1] Add Xbox OAuth settings fields (Client ID, Client Secret, Redirect URI) to the settings page with encrypted storage for secret in frontend/app/settings/page.tsx
- [X] T011 [US1] Refactor setup page: replace platform checkboxes with card-based selector (Steam blue, Xbox green, PlayStation blue), wire Xbox card to call GET /api/auth/xbox/url and redirect in frontend/app/setup/page.tsx

**Checkpoint**: User Story 1 fully functional â€” Xbox profile creation via OAuth works end-to-end

---

## Phase 4: User Story 2 â€” Xbox Game & Achievement Sync (Priority: P1)

**Goal**: Users with an Xbox profile can trigger a sync that fetches all games with achievements, downloads achievement details, tracks progress in real-time, and supports cancellation.

**Independent Test**: Create Xbox profile â†’ trigger sync â†’ verify games appear with correct achievement counts, completion percentages, unlock timestamps. Verify progress tracking and cancellation work.

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US2] Write unit tests for Xbox adapter data methods (getTitleHistory with pagination, getAchievements with pagination, error handling for privacy blocks, rate limit retry) in backend/tests/unit/services/adapters/xbox.test.ts

### Implementation for User Story 2

- [X] T013 [US2] Add getTitleHistory() (paginated via continuationToken, filters games with 0 achievements, extracts devices[]) and getAchievements() (paginated per titleId) to Xbox adapter in backend/src/services/adapters/xbox.ts
- [X] T014 [US2] Implement syncXbox() method in backend/src/services/syncService.ts â€” Phase 1: token refresh + profile update; Phase 2: game discovery with adaptive batching; Phase 3: achievement sync with cancellation checks; progress tracking via SyncOperation updates

**Checkpoint**: User Story 2 fully functional â€” game and achievement data syncs correctly from Xbox API

---

## Phase 5: User Story 3 â€” Xbox Image Fetching with SteamGridDB Fallback (Priority: P2)

**Goal**: During sync, game cover art is downloaded from Xbox CDN first, falling back to SteamGridDB name search. Achievement icons are downloaded from Xbox. All images stored in `images/xbox/` directory.

**Independent Test**: Sync Xbox profile â†’ verify game tiles have cover art, achievement icons display, images stored under `images/xbox/{titleId}/`, SteamGridDB only queried when Xbox source fails.

### Implementation for User Story 3

- [X] T015 [P] [US3] Add searchGameByName(name) method (GET /search/autocomplete/{term}, returns first verified match ID) and downloadGameImageByName(gameName, platform, gameId) method to SteamGridDB adapter in backend/src/services/adapters/steamgriddb.ts
- [X] T016 [US3] Add image download phases to syncXbox() in backend/src/services/syncService.ts â€” Phase 4: game image downloads (Xbox CDN â†’ SteamGridDB fallback, concurrent via p-limit); Phase 5: achievement icon downloads (store same path in both iconPath and iconGrayPath)

**Checkpoint**: User Story 3 fully functional â€” images download with fallback chain, stored in xbox/ directory

---

## Phase 6: User Story 4 â€” Platform Selection on Add-Profile Page (Priority: P2)

**Goal**: The add-profile page's platform selector works for ALL platforms: Steam shows API Key + Steam ID fields (existing behavior), Xbox shows OAuth flow (from US1), PlayStation shows "coming soon" placeholder.

**Independent Test**: Navigate to setup page â†’ select each platform â†’ verify Steam form has correct fields, Xbox shows sign-in button, PlayStation shows "coming soon", switching platforms preserves state.

### Tests for User Story 4

> **Write these tests FIRST, ensure they FAIL before implementation**

- [X] T017 [P] [US4] Add tests for Steam form field rendering and PlayStation "coming soon" display through platform selector in frontend/tests/pages/setup.test.tsx

### Implementation for User Story 4

- [X] T018 [US4] Ensure Steam API Key + Steam ID form renders correctly through platform card selector (preserve existing Steam profile creation flow) in frontend/app/setup/page.tsx
- [X] T019 [US4] Add PlayStation card with "coming soon" badge and disabled state to platform selector in frontend/app/setup/page.tsx

**Checkpoint**: User Story 4 fully functional â€” all three platform paths work correctly from a single entry point

---

## Phase 7: User Story 5 â€” Xbox Game Library Browsing (Priority: P2)

**Goal**: Users browse their Xbox game library on the Xbox page with cover art, completion percentages, generation filter (Xbox 360/One/Series/PC), sorting, and click into game detail pages with achievement lists.

**Independent Test**: Sync Xbox games â†’ navigate to /xbox â†’ verify game grid displays, generation filter works, completion filter works, sorting works, game detail page shows achievements with icons (grayscale for locked).

### Tests for User Story 5

> **Write these tests FIRST, ensure they FAIL before implementation**

- [X] T020 [P] [US5] Write tests for Xbox page (ProfileSelector, sync controls, GameGrid rendering, generation filter, empty state with add-profile link) in frontend/tests/pages/xbox.test.tsx
- [X] T021 [P] [US5] Write tests for Xbox game detail page (achievement list, progress bar, locked achievements with grayscale icon, secret achievement handling) in frontend/tests/pages/xboxGame.test.tsx

### Implementation for User Story 5

- [X] T022 [US5] Implement full Xbox page with ProfileSelector, ProfileSyncControls, GameGrid, completion filter, console generation filter dropdown (Xbox 360/Xbox One/Xbox Series X|S/PC), sorting, and empty state prompt in frontend/app/xbox/page.tsx
- [X] T023 [US5] Create Xbox game detail page with game title, achievement progress bar, unlocked/locked achievement list with icons (CSS grayscale filter on iconGrayPath for locked achievements) in frontend/app/xbox/game/[id]/page.tsx

**Checkpoint**: User Story 5 fully functional â€” Xbox game library browsable with all filtering, sorting, and detail views

---

## Phase 8: User Story 6 â€” Xbox Token Refresh & Session Management (Priority: P3)

**Goal**: Expired Xbox tokens are refreshed transparently during sync. When re-authentication is required (refresh token revoked), a persistent banner on the Xbox page and a status badge on the profile card notify the user with a re-auth link.

**Independent Test**: Simulate expired access token â†’ trigger sync â†’ verify auto-refresh succeeds. Simulate revoked refresh token â†’ verify banner appears on Xbox page and badge appears on profile card in settings.

### Implementation for User Story 6

- [X] T024 [US6] Implement POST /api/auth/xbox/refresh route (manual token refresh, returns 401 with authUrl when re-auth needed) in backend/src/api/routes/auth.ts
- [X] T025 [US6] Add persistent "re-authentication required" banner with re-auth link to Xbox page (shown when profile has expired/revoked refresh token) in frontend/app/xbox/page.tsx
- [X] T026 [US6] Add "needs re-auth" status badge to Xbox profile card in settings page (visual indicator + re-authenticate link) in frontend/app/settings/page.tsx

**Checkpoint**: User Story 6 fully functional â€” token lifecycle managed transparently, users notified only when manual re-auth needed

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validation, cleanup, and cross-cutting improvements

- [X] T027 [P] Run quickstart.md end-to-end validation (Azure app setup â†’ add Xbox profile â†’ sync â†’ browse games â†’ verify images)
- [X] T028 [P] Verify Xbox profiles are included in scheduled auto-sync by reviewing scheduler behavior in backend/src/services/scheduler.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies â€” can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 â€” BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 â€” No dependencies on other stories
- **US2 (Phase 4)**: Depends on Phase 2 â€” Shares xbox.ts adapter with US1 (different methods)
- **US3 (Phase 5)**: Depends on US2 â€” Adds image phases to syncXbox()
- **US4 (Phase 6)**: Depends on US1 â€” Builds on setup page refactor from T011
- **US5 (Phase 7)**: Depends on Phase 2 â€” Pages can be built independently; data comes from US2
- **US6 (Phase 8)**: Depends on US1 (auth routes) + US5 (Xbox page for banner)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Independence

```
Phase 1 (Setup) â†’ Phase 2 (Foundational)
                      â”‚
                      â”œâ”€â”€â†’ US1 (Auth) â”€â”€â†’ US4 (Platform Selection)
                      â”‚         â”‚
                      â”‚         â””â”€â”€â†’ US6 (Token Refresh) â†â”€â”€ US5
                      â”‚
                      â”œâ”€â”€â†’ US2 (Sync) â”€â”€â†’ US3 (Images)
                      â”‚
                      â””â”€â”€â†’ US5 (Browsing)
```

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Adapter/model methods before service integration
3. Backend before frontend (data must exist to display)
4. Core implementation before polish

### Parallel Opportunities

**Phase 1**: T002 and T003 can run in parallel after T001
**Phase 2**: T005 and T006 can run in parallel with T004
**Phase 3 (US1)**: T007 and T008 run in parallel (tests); T010 runs in parallel with T009
**Phase 4 (US2)**: T012 runs while waiting for Phase 2
**Phase 5 (US3)**: T015 (SteamGridDB) is independent of T014 and can start early
**Phase 7 (US5)**: T020 + T021 run in parallel (tests); T022 + T023 partially parallel (different files)

---

## Parallel Example: User Story 1

```bash
# Launch tests in parallel (different files):
Task T007: "Integration tests for Xbox OAuth routes in backend/tests/integration/routes/auth.test.ts"
Task T008: "Tests for setup page platform selector in frontend/tests/pages/setup.test.tsx"

# Then launch backend + frontend in parallel (different directories):
Task T009: "Implement Xbox OAuth routes in backend/src/api/routes/auth.ts"
Task T010: "Add Xbox settings fields in frontend/app/settings/page.tsx"

# Then complete the setup page (depends on T009 for auth URL endpoint):
Task T011: "Refactor setup page with platform selector in frontend/app/setup/page.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001â€“T003)
2. Complete Phase 2: Foundational (T004â€“T006)
3. Complete Phase 3: User Story 1 (T007â€“T011)
4. **STOP and VALIDATE**: Test Xbox OAuth flow end-to-end
5. Deploy/demo if ready â€” users can connect Xbox accounts

### Incremental Delivery

1. Setup + Foundational â†’ Foundation ready
2. Add US1 (Auth) â†’ Test â†’ **MVP: Xbox accounts connectable**
3. Add US2 (Sync) â†’ Test â†’ **Games and achievements sync**
4. Add US3 (Images) â†’ Test â†’ **Cover art and icons display**
5. Add US4 (Platform Selection) â†’ Test â†’ **All platforms selectable**
6. Add US5 (Browsing) â†’ Test â†’ **Full Xbox library browsable with generation filter**
7. Add US6 (Token Refresh) â†’ Test â†’ **Long-term reliability**
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Auth) â†’ US4 (Platform Selection) â†’ US6 (Token Refresh)
   - Developer B: US2 (Sync) â†’ US3 (Images)
   - Developer C: US5 (Browsing)
3. Stories integrate independently via platform-agnostic architecture

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Xbox adapter (xbox.ts) is shared by US1 (auth) and US2 (data) â€” auth methods in Phase 2, data methods in US2
- syncXbox() is built incrementally: US2 adds phases 1-3 (token + data), US3 adds phases 4-5 (images)
- Frontend components (GameGrid, GameTile, ProfileSelector, ProfileSyncControls) are platform-generic â€” no changes needed
- Scheduler already auto-syncs all profiles â€” Xbox profiles are automatically included
- Single achievement icon stored in both iconPath and iconGrayPath; CSS grayscale applied for locked state


