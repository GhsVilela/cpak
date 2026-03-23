# Feature Specification: Xbox Integration

**Feature Branch**: `005-xbox-integration`  
**Created**: 2026-02-27  
**Status**: Draft  
**Input**: User description: "Develop Xbox integration working the same way as Steam, with proper Xbox authentication, game/achievement sync, image fetching from Xbox sources with SteamGridDB fallback, and a platform-selection add-profile page."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Xbox Account Authentication (Priority: P1)

A user wants to connect their Xbox account to cpak so their gaming data can be synced. The user navigates to the add-profile page, selects "Xbox" as their platform, and is guided through the Microsoft/Xbox authentication process. After successful login, the system stores the user's Xbox credentials securely and creates a profile linked to their Xbox gamertag.

**Why this priority**: Without authentication, no Xbox data can be retrieved. This is the foundational step that all other Xbox features depend on.

**Independent Test**: Can be fully tested by navigating to the add-profile page, selecting Xbox, completing the login flow, and verifying that an Xbox profile appears in the profiles list with the correct gamertag and avatar.

**Acceptance Scenarios**:

1. **Given** a user with no Xbox profile configured, **When** they navigate to the add-profile page and select "Xbox", **Then** the system presents the Xbox authentication flow (Microsoft OAuth login).
2. **Given** a user is on the Xbox authentication screen, **When** they complete the Microsoft login successfully, **Then** the system creates an Xbox profile with their gamertag as display name and stores encrypted credentials.
3. **Given** a user is on the Xbox authentication screen, **When** the Microsoft login fails or is cancelled, **Then** the system shows a clear error message and allows the user to retry.
4. **Given** a user already has an Xbox profile, **When** they try to add another profile with the same Xbox account, **Then** the system updates the existing profile rather than creating a duplicate.
5. **Given** an Xbox profile exists, **When** the user views the profile in settings, **Then** credentials are not exposed — only a "configured" status is shown.

---

### User Story 2 - Xbox Game & Achievement Sync (Priority: P1)

A user with a connected Xbox account wants to sync their games and achievements. After authenticating, the user triggers a sync (manually or via scheduled sync). The system fetches all Xbox games the user owns that have achievements, downloads achievement details, and stores everything in the database — mirroring the existing Steam sync behavior.

**Why this priority**: Game and achievement sync is the core value proposition of cpak. Without it, the Xbox integration serves no purpose.

**Independent Test**: Can be tested by creating an Xbox profile, triggering a sync, and verifying that games with achievements appear in the games list with correct completion percentages, achievement counts, and unlock dates.

**Acceptance Scenarios**:

1. **Given** a user with a valid Xbox profile, **When** they trigger a sync, **Then** the system fetches all Xbox games where the user has unlocked at least one achievement.
2. **Given** a sync is in progress, **When** the system processes each game, **Then** it retrieves the game title, total achievements, unlocked achievements, unlock timestamps, and completion percentage.
3. **Given** a sync is in progress, **When** progress updates occur, **Then** the user sees real-time feedback showing games completed, achievements synced, and any errors encountered.
4. **Given** a sync has previously run, **When** a new sync is triggered, **Then** existing game and achievement records are updated (upserted) rather than duplicated.
5. **Given** a sync is running, **When** the user cancels it, **Then** the sync stops gracefully and all data synced so far is preserved.
6. **Given** the Xbox authentication token has expired, **When** a sync is triggered, **Then** the system automatically refreshes the token and proceeds with the sync without user intervention.

---

### User Story 3 - Xbox Image Fetching with SteamGridDB Fallback (Priority: P2)

When games and achievements are synced, the system downloads cover art and achievement icons. Xbox-sourced images are fetched first (game art from Xbox/Microsoft CDN, achievement icons from Xbox). If Xbox images are unavailable, the system falls back to SteamGridDB by searching for the game by name. All Xbox images are stored in a dedicated `xbox` subfolder within the images directory.

**Why this priority**: Images significantly improve the user experience but the sync is functional without them. The fallback strategy ensures maximum coverage.

**Independent Test**: Can be tested by syncing an Xbox profile and verifying that game tiles display images, achievement icons render correctly, images are stored under the `xbox/` directory, and SteamGridDB is only queried when Xbox sources fail.

**Acceptance Scenarios**:

1. **Given** a game is being synced, **When** the system fetches game art, **Then** it first attempts to download from the Xbox/Microsoft image CDN.
2. **Given** the Xbox image source returns no image or an error, **When** the system needs game art, **Then** it falls back to SteamGridDB searching by game title.
3. **Given** neither Xbox nor SteamGridDB return an image, **When** the game is displayed, **Then** a placeholder or no-image state is shown gracefully.
4. **Given** achievement icons are available from Xbox, **When** achievements are synced, **Then** the single icon is downloaded and stored; both `iconPath` and `iconGrayPath` reference the same file, with CSS grayscale applied on the frontend for locked achievements.
5. **Given** images are downloaded, **When** stored to disk, **Then** they are placed under `images/xbox/{gameId}/` following the existing platform-namespaced directory structure.
6. **Given** a SteamGridDB API key is not configured, **When** Xbox images are unavailable, **Then** the system skips the SteamGridDB fallback gracefully without errors.

---

### User Story 4 - Platform Selection on Add-Profile Page (Priority: P2)

The add-profile page presents a unified entry point where users select which platform they want to connect. After selecting a platform (Steam, Xbox, or PlayStation), the page dynamically shows the configuration form specific to that platform. Steam continues to show API key + Steam ID fields, Xbox shows the Microsoft OAuth login flow, and PlayStation remains as a "coming soon" placeholder.

**Why this priority**: This improves the user experience for all platforms and is necessary for the Xbox flow to be discoverable. However, the current setup page already partially supports this.

**Independent Test**: Can be tested by navigating to the add-profile page, selecting each platform option, and verifying that the correct configuration form appears for each platform.

**Acceptance Scenarios**:

1. **Given** a user navigates to the add-profile page, **When** the page loads, **Then** they see platform options (Steam, Xbox, PlayStation) to choose from.
2. **Given** a user selects "Steam", **When** the platform form loads, **Then** they see the existing Steam API Key and Steam ID input fields.
3. **Given** a user selects "Xbox", **When** the platform form loads, **Then** they see the Xbox/Microsoft login button to begin OAuth authentication.
4. **Given** a user selects "PlayStation", **When** the platform form loads, **Then** they see a "coming soon" message indicating PlayStation support is not yet available.
5. **Given** a user has selected a platform, **When** they want to switch to a different platform, **Then** they can go back to the platform selection without losing any previously entered data for other platforms.

---

### User Story 5 - Xbox Game Library Browsing (Priority: P2)

After syncing, a user navigates to the Xbox page to browse their game library. They can see all synced games displayed in a grid with cover art, filter by completion status, sort by various criteria, and click into a game to see individual achievements with icons.

**Why this priority**: Browsing is the primary way users interact with their synced data. The existing platform pages and components are already designed to be platform-generic.

**Independent Test**: Can be tested by syncing Xbox games and navigating to the Xbox page to verify games display correctly with images, filtering works, sorting works, and game detail pages show achievements.

**Acceptance Scenarios**:

1. **Given** a user has synced Xbox games, **When** they navigate to the Xbox page, **Then** they see their Xbox game library displayed in a grid with cover art and completion percentages.
2. **Given** the Xbox page is displayed, **When** the user applies the "completed only" filter, **Then** only games with 100% achievement completion are shown.
2a. **Given** the Xbox page is displayed, **When** the user applies a console generation filter (e.g., "Xbox 360"), **Then** only games from that generation are shown.
3. **Given** the Xbox page is displayed, **When** the user sorts by completion percentage, **Then** games are reordered accordingly.
4. **Given** the user clicks on an Xbox game, **When** the game detail page loads, **Then** they see the game title, achievement progress bar, and a list of unlocked and locked achievements with icons.
5. **Given** no Xbox profiles are configured, **When** the user visits the Xbox page, **Then** they see a message prompting them to add an Xbox profile with a link to the add-profile page.

---

### User Story 6 - Xbox Token Refresh & Session Management (Priority: P3)

Xbox authentication uses OAuth tokens that expire. The system must handle token expiration transparently — refreshing tokens automatically before or during sync operations, and notifying the user only when re-authentication is required (e.g., refresh token revoked).

**Why this priority**: Important for long-term reliability but not needed for initial proof-of-concept. Users can re-authenticate manually in early iterations.

**Independent Test**: Can be tested by simulating an expired access token, triggering a sync, and verifying the system refreshes the token automatically without user intervention.

**Acceptance Scenarios**:

1. **Given** an Xbox profile with an expired access token but valid refresh token, **When** a sync is triggered, **Then** the system silently refreshes the access token and proceeds with sync.
2. **Given** an Xbox profile whose refresh token has been revoked or expired, **When** a sync is triggered, **Then** the system notifies the user that re-authentication is required and provides a link to re-authenticate.
3. **Given** a token refresh succeeds, **When** new tokens are received, **Then** the system encrypts and stores the updated tokens in the profile.
4. **Given** the scheduled sync runs, **When** it encounters an Xbox profile, **Then** it attempts token refresh before syncing and skips the profile with a logged warning if re-authentication is needed.

---

### Edge Cases

- What happens when the Xbox API rate-limits requests during sync? The system should implement retry with exponential backoff, similar to the Steam adapter's rate limiter.
- What happens when a game exists on both Steam and Xbox for the same user? Games are stored with platform-specific identifiers, so they are treated as separate entries per platform — no cross-platform deduplication.
- What happens when Xbox returns games with zero achievements? Those games are excluded from sync, consistent with the Steam behavior of only including games where the user has unlocked at least one achievement.
- What happens when the user's Xbox privacy settings block achievement data? The system should detect the "privacy" error response and inform the user they need to adjust their Xbox privacy settings to allow achievement data access.
- What happens when image downloads fail mid-sync? The sync continues for remaining items; failed image downloads are logged but do not block game/achievement data from being saved.
- What happens when a user deletes their Xbox profile? All associated games, achievements, sync runs, and downloaded images in the `xbox/` folder for that profile are cascade-deleted.
- What happens when the SteamGridDB search by game name returns multiple results? The system selects the best match (highest relevance/score) from the results.

### Out of Scope

- **Cross-platform achievement deduplication**: Games owned on both Steam and Xbox are tracked as separate entries per platform. No merging, linking, or unified cross-platform view is included in this feature.
- **PlayStation integration**: PlayStation remains a "coming soon" placeholder. Only the platform selector UI acknowledges it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to authenticate with their Xbox account using Microsoft OAuth to create an Xbox profile.
- **FR-002**: System MUST securely store Xbox OAuth credentials (access token, refresh token, expiry) using the same encryption mechanism already in place for Steam API keys.
- **FR-003**: System MUST fetch the user's Xbox gamertag and avatar during profile creation and display them as the profile's display name and identifier.
- **FR-004**: System MUST sync all Xbox games across all generations (Xbox 360, Xbox One, Xbox Series X|S, PC) where the user has unlocked at least one achievement, retrieving game title, total achievements, unlocked achievements, unlock timestamps, completion percentage, and platform generation metadata.
- **FR-005**: System MUST download game cover art from Xbox/Microsoft image sources as the primary source.
- **FR-006**: System MUST fall back to SteamGridDB (searching by game title) when Xbox image sources are unavailable, only if a SteamGridDB API key is configured.
- **FR-007**: System MUST download a single achievement icon per achievement from Xbox sources and store the same image path in both `iconPath` and `iconGrayPath` fields. The frontend MUST apply a CSS grayscale filter when rendering `iconGrayPath` for locked achievements (Xbox does not provide separate locked icon variants).
- **FR-008**: System MUST store all Xbox images in a dedicated `xbox/` subfolder within the images directory, following the pattern `images/xbox/{gameId}/{filename}`.
- **FR-009**: System MUST support real-time sync progress tracking for Xbox syncs, showing games completed, achievements synced, and errors — identical to Steam sync progress.
- **FR-010**: System MUST support sync cancellation for Xbox syncs, preserving all data synced up to the cancellation point.
- **FR-011**: System MUST automatically refresh expired Xbox access tokens using the stored refresh token before or during sync operations.
- **FR-012**: System MUST notify the user when re-authentication is required (refresh token expired or revoked) via a persistent banner on the Xbox page and a "needs re-auth" status badge on the profile card in settings. The banner MUST include a direct link to re-authenticate.
- **FR-013**: System MUST include Xbox profiles in the scheduled auto-sync, handling token refresh automatically.
- **FR-014**: The add-profile page MUST present a platform selection step where users choose Steam, Xbox, or PlayStation before seeing the platform-specific configuration form.
- **FR-015**: System MUST cascade-delete all games, achievements, sync runs, and images when an Xbox profile is deleted.
- **FR-016**: The Xbox page MUST display the user's synced game library with cover art, completion percentages, filtering (completed only, and by console generation: Xbox 360 / Xbox One / Xbox Series X|S / PC), sorting, and pagination — matching the Steam page functionality.
- **FR-017**: The Xbox game detail page MUST show game title, achievement progress bar, and individual achievements with icons — matching the Steam game detail page.
- **FR-018**: System MUST handle Xbox API rate limiting with retry logic and exponential backoff.
- **FR-019**: System MUST detect when a user's Xbox privacy settings prevent achievement data access and inform the user with actionable guidance.
- **FR-020**: System MUST implement adaptive batch processing for Xbox game/achievement sync, similar to the Steam sync batching strategy.

### Key Entities

- **Xbox Profile**: An authenticated Xbox user account, identified by their Xbox User ID (XUID) and gamertag. Linked to OAuth credentials (access token, refresh token, token expiry). One profile per Xbox account.
- **Xbox Game**: A game owned by the user on Xbox, identified by a platform-specific title ID. Contains title, achievement totals, completion percentage, and a reference to downloaded cover art. Only games with at least one unlocked achievement are tracked.
- **Xbox Achievement**: An individual achievement within a game, identified by a platform-specific achievement ID. Contains name, description, unlock status, unlock timestamp, and references to icon images (unlocked and locked variants).
- **Xbox Image**: Cover art or achievement icon stored locally under the `xbox/` image directory. Sourced primarily from Xbox/Microsoft CDN, with SteamGridDB as fallback for game art.

## Clarifications

### Session 2026-02-27

- Q: Xbox provides only a single achievement icon (no locked variant like Steam). How should locked achievements display? → A: Download single icon, store same path in both `iconPath` and `iconGrayPath`; frontend applies CSS grayscale filter for locked state.
- Q: Should Xbox sync include all console generations (360, One, Series X|S, PC) or be limited? → A: Sync all generations; add a console generation filter on the Xbox page so users can view games from a specific generation.
- Q: Should cpak ship with a default Azure AD app or require users to register their own? → A: User registers their own Azure AD app (client ID + secret stored in cpak settings). Consistent with self-hosted philosophy.
- Q: How should the user be notified when Xbox re-authentication is required? → A: Persistent banner on Xbox page + "needs re-auth" status badge on the profile card. Non-intrusive, visible when relevant.
- Q: Should cross-platform achievement deduplication be in scope? → A: Explicitly out of scope. Each platform's games/achievements remain independent, no merging.

## Assumptions

- Xbox uses Microsoft's identity platform for authentication, which follows standard OAuth 2.0 with authorization code flow. This requires registering an application in Microsoft Azure (or using an existing Xbox API access method) to obtain client credentials.
- Xbox achievements data is accessible through Microsoft/Xbox APIs once the user grants appropriate permissions during OAuth consent.
- The Xbox API provides image URLs for game art (title images) and achievement icons as part of game and achievement data responses.
- The existing profile model's OAuth credential fields (`accessToken`, `refreshToken`, `expiresAt`, `scopes`, `tokenType`) are sufficient for Xbox credentials without schema changes.
- The existing platform enum (`'steam' | 'xbox' | 'playstation'`) in all models already supports Xbox.
- SteamGridDB supports searching by game name (not just Steam app ID), making it a viable fallback for Xbox game art.
- The existing frontend components (`ProfileSelector`, `GameGrid`, `GameTile`, `ProfileSyncControls`) are platform-generic and can render Xbox data without structural changes.
- Xbox API access does not require a paid subscription beyond what the user already has (Xbox Live account).
- The Microsoft OAuth redirect flow can work within the cpak self-hosted environment (the user will need to configure a redirect URI matching their cpak instance).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full Xbox profile setup (platform selection → authentication → profile creation) in under 3 minutes.
- **SC-002**: A full Xbox game library sync (up to 500 games) completes within 15 minutes, including image downloads.
- **SC-003**: At least 90% of Xbox games display cover art (from Xbox sources or SteamGridDB fallback combined).
- **SC-004**: Achievement data accuracy is 100% — all unlocked achievements with correct unlock timestamps are synced from Xbox.
- **SC-005**: Token refresh succeeds transparently in 95%+ of cases without requiring user re-authentication.
- **SC-006**: The Xbox browsing experience (game grid, filtering, sorting, game detail) performs identically to the Steam page with no degradation.
- **SC-007**: All Xbox images are stored exclusively in the `xbox/` subfolder with zero cross-platform image contamination.
- **SC-008**: Users with both Steam and Xbox profiles can view and manage each platform independently from a single cpak instance.
- **SC-009**: The add-profile page platform selector is functional and correctly routes users to the appropriate setup flow for each platform.
- **SC-010**: Sync errors (rate limits, privacy blocks, network issues) are handled gracefully with clear user-facing messages and no data corruption.
