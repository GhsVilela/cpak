# Feature Specification: PlayStation Integration

**Feature Branch**: `006-playstation-integration`  
**Created**: 2026-03-26  
**Status**: Draft  
**Input**: User description: "This new feature is to add the playstation integration, the page will work similar to all the other pages but with the particularities for playstation, the image sources should be the same as used for xbox and steam but the CDN will be different, it should try to fetch the real images from playstation before trying the other approaches like steamgrid, gaming wiki, wikipedia and so on. We need to understand the better way to fetch user games that the user has unlocked at least one achievement, the idea is that the user will always provide their own keys to fetch the data since this is a self hosted app, the flow will be the same as other pages, it will fetch all games that the user has at least one achievement unlocked and these are the ones that will be added to the page, just like xbox show some gamerscore and xbox 360 gamerscore info, playstation should show the total amount of trophies and the amount of bronze, silver, gold and platinum trophies. On the game achievement page, we should also have a badge to know what if the achievement is a bronze one, silver, gold or a platinum, If playstation returns data regarding play time, last played and so on, this should also be added to the achievement page."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - PlayStation Account Authentication (Priority: P1)

A user wants to connect their PlayStation Network (PSN) account to cpak. Being a self-hosted application, the user provides their own PSN authentication credentials (NPSSO token). The user navigates to the settings page, creates a new PlayStation profile, enters their NPSSO token, and the system validates the connection by fetching the user's PSN profile information (Online ID, avatar).

**Why this priority**: Authentication is the foundational requirement — no PlayStation data can be fetched without valid credentials. All other features depend on this.

**Independent Test**: Can be fully tested by navigating to settings, adding a PlayStation profile with a valid NPSSO token, and verifying that the profile appears with the correct PSN Online ID and avatar.

**Acceptance Scenarios**:

1. **Given** a user with no PlayStation profile configured, **When** they navigate to settings and select "Add Profile" for PlayStation, **Then** the system presents a form to enter a PSN NPSSO token.
2. **Given** a user enters a valid NPSSO token, **When** they submit the form, **Then** the system validates the token by fetching the user's PSN profile, creates a profile with their Online ID as display name, and stores the encrypted token.
3. **Given** a user enters an invalid or expired NPSSO token, **When** they submit the form, **Then** the system shows a clear error message explaining the token is invalid and provides guidance on how to obtain a new NPSSO token from the PlayStation website.
4. **Given** a user already has a PlayStation profile, **When** they view their profile in settings, **Then** credentials are not exposed — only a "configured" status is shown.
5. **Given** a user's NPSSO token has expired, **When** the system detects the expiration during sync, **Then** the user is notified that re-authentication is required with instructions on how to obtain a new token.

---

### User Story 2 - PlayStation Game & Trophy Sync (Priority: P1)

A user with a connected PlayStation account wants to sync their games and trophies. The system fetches all PlayStation games where the user has earned at least one trophy, downloads trophy details (including trophy grade: bronze, silver, gold, platinum), and stores everything in the database. The sync follows the same pattern as Steam and Xbox syncs with real-time progress tracking.

**Why this priority**: Trophy sync is the core value proposition. Without it, the PlayStation integration has no purpose.

**Independent Test**: Can be tested by creating a PlayStation profile, triggering a sync, and verifying that games with trophies appear in the games list with correct trophy counts, completion percentages, and individual trophy details including grades.

**Acceptance Scenarios**:

1. **Given** a user with a valid PlayStation profile, **When** they trigger a sync, **Then** the system fetches all PlayStation games where the user has earned at least one trophy.
2. **Given** a sync is in progress, **When** the system processes each game, **Then** it retrieves the game title, total trophies, earned trophies, trophy breakdown by grade (bronze, silver, gold, platinum), unlock timestamps, completion percentage, and platform generation (PS3, PS4, PS5, PS Vita).
3. **Given** a sync is in progress, **When** progress updates occur, **Then** the user sees real-time feedback showing games completed, trophies synced, and any errors encountered.
4. **Given** a sync has previously run, **When** a new sync is triggered, **Then** existing game and trophy records are updated (upserted) rather than duplicated.
5. **Given** a sync is running, **When** the user cancels it, **Then** the sync stops gracefully and all data synced so far is preserved.
6. **Given** the PlayStation API returns play time or last-played data for a game, **When** the game is stored, **Then** those fields are populated on the game record.

---

### User Story 3 - PlayStation Image Fetching with Fallback Chain (Priority: P2)

When games and trophies are synced, the system downloads cover art and trophy icons. PlayStation CDN images are fetched first (game art and trophy icons from PlayStation's image servers). If PlayStation images are unavailable, the system falls back through SteamGridDB, PCGamingWiki, and Wikipedia — matching the existing image fallback chain used for other platforms. All PlayStation images are stored in a dedicated `playstation` subfolder within the images directory.

**Why this priority**: Images significantly improve the user experience but the sync is functional without them. The fallback strategy ensures maximum coverage.

**Independent Test**: Can be tested by syncing a PlayStation profile and verifying that game tiles display images, trophy icons render correctly, images are stored under the `playstation/` directory, and fallback sources are only queried when PlayStation sources fail.

**Acceptance Scenarios**:

1. **Given** a game is being synced, **When** the system fetches game art, **Then** it first attempts to download from the PlayStation image CDN.
2. **Given** the PlayStation image source returns no image or an error, **When** the system needs game art, **Then** it falls back to SteamGridDB (searching by game title), then PCGamingWiki, then Wikipedia.
3. **Given** neither the PlayStation CDN nor any fallback source returns an image, **When** the game is displayed, **Then** a placeholder or no-image state is shown gracefully.
4. **Given** trophy icons are available from PlayStation, **When** trophies are synced, **Then** the icon is downloaded and stored; locked trophies use the locked icon if provided by PlayStation, or a CSS grayscale filter is applied on the frontend.
5. **Given** images are downloaded, **When** stored to disk, **Then** they are placed under `images/playstation/{gameId}/` following the existing platform-namespaced directory structure.
6. **Given** a SteamGridDB API key is not configured, **When** PlayStation images are unavailable, **Then** the system skips the SteamGridDB fallback gracefully without errors.

---

### User Story 4 - PlayStation Game Library Browsing with Trophy Summary (Priority: P2)

After syncing, a user navigates to the PlayStation page to browse their game library. The page header displays total trophy statistics: total trophies earned, and breakdown by grade (bronze, silver, gold, platinum). Games are displayed in a grid with cover art, and each game tile shows the completion percentage. Users can filter by completion status, sort by various criteria, and paginate through results.

**Why this priority**: Browsing with trophy summaries is the primary way users interact with their synced PlayStation data. The existing PlayStation page already has a basic structure that needs to be enhanced.

**Independent Test**: Can be tested by syncing PlayStation games and navigating to the PlayStation page to verify that trophy summary stats display correctly, games appear in the grid with images, and filtering/sorting works.

**Acceptance Scenarios**:

1. **Given** a user has synced PlayStation games, **When** they navigate to the PlayStation page and select a profile, **Then** they see a summary showing total trophies earned with a breakdown by grade (bronze, silver, gold, platinum) scoped to the selected profile.
2. **Given** the PlayStation page is displayed, **When** the user views the game grid, **Then** each game tile shows cover art, title, and completion percentage.
3. **Given** the PlayStation page is displayed, **When** the user applies the "100% only" filter, **Then** only games with 100% trophy completion are shown.
3a. **Given** the PlayStation page is displayed, **When** the user applies a console generation filter (e.g., "PS5"), **Then** only games from that generation are shown.
4. **Given** the PlayStation page is displayed, **When** the user sorts by completion percentage, **Then** games are reordered accordingly.
5. **Given** no PlayStation profiles are configured, **When** the user visits the PlayStation page, **Then** they see a message prompting them to add a PlayStation profile with a link to the settings page.

---

### User Story 5 - PlayStation Game Detail & Trophy Page with Grade Badges (Priority: P2)

A user clicks on a PlayStation game from the library to view detailed trophy information. The game detail page shows the game title, trophy progress bar, play time (if available), last played date (if available), and a list of all trophies. Each trophy displays its name, description, icon, unlock status, unlock date, and a visual badge indicating its grade (bronze, silver, gold, or platinum).

**Why this priority**: The trophy detail page with grade badges is a key differentiator of the PlayStation experience and is essential for users tracking their trophy progress.

**Independent Test**: Can be tested by navigating to a game detail page and verifying that trophies display with correct grade badges, unlock status, and that play time/last played appear when available.

**Acceptance Scenarios**:

1. **Given** a user clicks on a PlayStation game, **When** the game detail page loads, **Then** they see the game title, trophy progress bar (earned/total), and a list of all trophies.
2. **Given** trophies are displayed, **When** viewing each trophy, **Then** a visual badge indicates the trophy grade (bronze, silver, gold, or platinum) using distinct colors or icons.
3. **Given** a trophy has been earned, **When** displayed in the list, **Then** it shows the unlock date and the full-color trophy icon.
4. **Given** a trophy has not been earned, **When** displayed in the list, **Then** it shows the locked/grayscale icon and no unlock date.
5. **Given** the PlayStation API returned play time data for a game, **When** the game detail page loads, **Then** the play time is displayed prominently.
6. **Given** the PlayStation API returned last-played data for a game, **When** the game detail page loads, **Then** the last-played date is displayed.
7. **Given** the PlayStation API did not return play time or last-played data, **When** the game detail page loads, **Then** those sections are omitted rather than showing empty placeholders.

---

### User Story 6 - PlayStation Scheduled Auto-Sync (Priority: P3)

PlayStation profiles are included in the existing scheduled auto-sync mechanism. When the scheduler runs, it automatically syncs all PlayStation profiles alongside Steam and Xbox profiles, handling credential expiration and error recovery.

**Why this priority**: Important for long-term usability but not required for initial launch. Users can sync manually until auto-sync is configured.

**Independent Test**: Can be tested by configuring a sync schedule, waiting for it to trigger, and verifying that PlayStation profiles are included in the sync run.

**Acceptance Scenarios**:

1. **Given** the sync scheduler is enabled, **When** a scheduled sync triggers, **Then** all PlayStation profiles are included in the sync alongside Steam and Xbox profiles.
2. **Given** a PlayStation profile's credentials have expired, **When** a scheduled sync runs, **Then** the system skips the profile with a warning and continues with other profiles.
3. **Given** a scheduled sync completes, **When** the user views sync history, **Then** they see the PlayStation sync results (games synced, trophies updated, any errors).

---

### Edge Cases

- What happens when the PlayStation API rate-limits requests during sync? The system implements retry with exponential backoff, consistent with the Steam and Xbox adapter behavior.
- What happens when a game exists on both PlayStation and another platform for the same user? Games are stored with platform-specific identifiers, so they are treated as separate entries per platform — no cross-platform deduplication.
- What happens when PlayStation returns games with zero trophies? Those games are excluded from sync, consistent with the existing behavior of only including games where the user has unlocked at least one trophy.
- What happens when the user's PSN privacy settings block trophy data? The system detects the privacy restriction and informs the user that they need to adjust their PSN privacy settings to allow trophy data access.
- What happens when image downloads fail mid-sync? The sync continues for remaining items; failed image downloads are logged but do not block game/trophy data from being saved.
- What happens when a user deletes their PlayStation profile? All associated games, trophies, sync runs, and downloaded images in the `playstation/` folder for that profile are cascade-deleted.
- What happens when a trophy has no grade information? The system defaults to displaying it as a bronze trophy with a logged warning.
- What happens when the PSN API returns hidden/secret trophies the user hasn't earned? The system attempts to resolve the real trophy name and description from a third-party trophy database. If the lookup fails, the trophy is displayed as "Hidden Trophy" with a generic locked icon.
- What happens when the NPSSO token expires? The user is notified via a banner on the PlayStation page and a "needs re-auth" status badge on the profile card, with instructions on how to obtain a new token.

### Out of Scope

- **Cross-platform trophy/achievement deduplication**: Games owned on multiple platforms are tracked as separate entries. No merging, linking, or unified cross-platform view is included.
- **PlayStation Store purchases or game library without trophies**: Only games where the user has earned at least one trophy are synced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create a PlayStation profile by providing a PSN NPSSO token, which the system exchanges for OAuth access + refresh tokens, validates by fetching the user's PSN Online ID and avatar, and stores the resulting token pair (not the raw NPSSO).
- **FR-002**: System MUST securely store PlayStation OAuth credentials (access token, refresh token, expiry) using the same encryption mechanism already in place for Steam API keys and Xbox tokens. The system MUST auto-refresh expired access tokens using the stored refresh token (~60-day lifespan) before requiring user re-authentication.
- **FR-003**: System MUST sync all PlayStation games where the user has earned at least one trophy, retrieving game title, total trophies, earned trophies, trophy grade breakdown (bronze, silver, gold, platinum), unlock timestamps, completion percentage, and platform generation (PS3, PS4, PS5, PS Vita) using the `devices` field.
- **FR-004**: System MUST store trophy grade information (bronze, silver, gold, platinum) for each trophy, enabling grade-based display and filtering.
- **FR-005**: System MUST display trophy grade badges on the game detail page using visually distinct indicators (colors or icons) for each grade: bronze, silver, gold, and platinum.
- **FR-006**: System MUST display a trophy summary on the PlayStation library page showing total trophies earned and breakdown by grade (bronze, silver, gold, platinum) for the currently selected profile. The summary is scoped to the active profile selection, matching how Xbox shows gamerscore per-profile.
- **FR-007**: System MUST download game cover art from PlayStation CDN as the primary image source.
- **FR-008**: System MUST fall back to SteamGridDB (searching by game title), then PCGamingWiki, then Wikipedia when PlayStation images are unavailable — following the existing image fallback chain.
- **FR-009**: System MUST download trophy icons from PlayStation CDN and store them in the images directory. If PlayStation provides separate locked/unlocked icon variants, both are stored; otherwise, the frontend applies a CSS grayscale filter for locked trophies.
- **FR-010**: System MUST store all PlayStation images in a dedicated `playstation/` subfolder within the images directory, following the pattern `images/playstation/{gameId}/{filename}`.
- **FR-011**: System MUST support real-time sync progress tracking for PlayStation syncs, showing games completed, trophies synced, and errors — matching the existing sync progress UI.
- **FR-012**: System MUST support sync cancellation for PlayStation syncs, preserving all data synced up to the cancellation point.
- **FR-013**: System MUST persist play time and last-played data for PlayStation games when available from the API.
- **FR-014**: The PlayStation game detail page MUST display play time and last-played date when available, omitting these sections when the data is not provided by the API.
- **FR-015**: System MUST include PlayStation profiles in the scheduled auto-sync, handling credential expiration gracefully by skipping affected profiles with a logged warning.
- **FR-016**: System MUST notify the user when PSN re-authentication is required via a persistent banner on the PlayStation page and a "needs re-auth" status badge on the profile card in settings. The banner MUST include instructions on how to obtain a new NPSSO token.
- **FR-017**: System MUST cascade-delete all games, trophies, sync runs, and images when a PlayStation profile is deleted.
- **FR-018**: The PlayStation page MUST display the user's synced game library with cover art, completion percentages, filtering (100% only, and by console generation: PS3 / PS4 / PS5 / PS Vita), sorting, and pagination — matching the existing platform page functionality.
- **FR-019**: The PlayStation game detail page MUST show game title, trophy progress bar, and individual trophies with icons and grade badges — with a dedicated `playstation/game/[id]/` route.
- **FR-020**: System MUST handle PlayStation API rate limiting with retry logic and exponential backoff.
- **FR-021**: System MUST detect when a user's PSN privacy settings prevent trophy data access and inform the user with actionable guidance.
- **FR-022**: System MUST attempt to resolve hidden/secret trophy details (name, description, icon) from a third-party trophy database for unearned hidden trophies. If the lookup fails, the system MUST display the trophy as "Hidden Trophy" with a generic locked icon.

### Key Entities

- **PlayStation Profile**: An authenticated PSN user account, identified by their PSN Account ID and Online ID. Linked to authentication credentials (NPSSO token). One profile per PSN account.
- **PlayStation Game**: A game owned by the user on PlayStation, identified by a platform-specific title ID (npCommunicationId). Contains title, trophy totals (overall and per-grade via dedicated fields: `trophyBronze`, `trophySilver`, `trophyGold`, `trophyPlatinum`), completion percentage, play time, last played date, platform generation (PS3/PS4/PS5/PS Vita via `devices` field), and a reference to downloaded cover art. Trophy grade counts are precomputed during sync. Only games with at least one earned trophy are tracked.
- **PlayStation Trophy**: An individual trophy within a game, identified by a platform-specific trophy ID. Contains name, description, unlock status, unlock timestamp, trophy grade (bronze/silver/gold/platinum), hidden flag, and references to icon images (earned and locked variants). For unearned hidden trophies, the system attempts to resolve real details from a third-party database before falling back to a generic "Hidden Trophy" placeholder.
- **PlayStation Image**: Cover art or trophy icon stored locally under the `playstation/` image directory. Sourced primarily from PlayStation CDN, with SteamGridDB, PCGamingWiki, and Wikipedia as fallbacks for game art.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can add a PlayStation profile and complete first sync within 5 minutes of entering their credentials.
- **SC-002**: Trophy sync captures 100% of earned trophies across all PlayStation games where the user has at least one trophy, with correct grade classification.
- **SC-003**: Users can browse their PlayStation game library with trophy summary statistics visible on page load in under 2 seconds.
- **SC-004**: Trophy grade badges (bronze, silver, gold, platinum) are visually distinguishable and correctly assigned to 100% of synced trophies.
- **SC-005**: Game cover art is successfully fetched for at least 80% of synced games across the image fallback chain (PlayStation CDN → SteamGridDB → PCGamingWiki → Wikipedia).
- **SC-006**: Play time and last-played information display correctly for all games where the PlayStation API provides that data.
- **SC-007**: Sync progress is visible in real-time with updates appearing within 1 second of each game being processed.
- **SC-008**: Scheduled auto-sync includes PlayStation profiles without manual intervention.
- **SC-009**: Users can identify trophy grades at a glance when viewing the game detail page, with 95% of users correctly identifying grade types on first view.

## Clarifications

### Session 2026-03-26

- Q: How should the system handle the NPSSO token after initial profile creation? → A: Exchange NPSSO for OAuth access + refresh tokens; store tokens; auto-refresh until refresh token expires (~60 days). Matches Xbox credential pattern.
- Q: Where should per-game trophy grade counts be stored? → A: Add dedicated fields (`trophyBronze`, `trophySilver`, `trophyGold`, `trophyPlatinum`) to the Game model, precomputed during sync. Matches Xbox gamerscore pattern.
- Q: How should the system handle hidden (secret) trophies that the user has NOT yet earned? → A: Attempt to fetch hidden trophy details from a third-party database and display the real name/description. Fall back to "Hidden Trophy" with a generic icon if the third-party lookup fails.
- Q: Should the trophy summary on the PlayStation page reflect the selected profile or all profiles? → A: Selected profile only. Matches Xbox gamerscore per-profile pattern; profile selector controls all data on the page.
- Q: Should the system store PlayStation generation/platform data (PS3, PS4, PS5, Vita) per game during sync? → A: Yes, store generation data AND build filtering UI. The `devices` field (already used by Xbox) will store PlayStation platform identifiers, and a generation filter will be added to the PlayStation page.

## Assumptions

- PlayStation trophies are accessible through unofficial PSN APIs (such as the PlayStation Network API accessed via NPSSO token authentication). There is no official public PlayStation API, so the integration relies on reverse-engineered endpoints commonly used by community tools.
- The NPSSO token can be obtained by the user from the PlayStation website by logging into their Sony account. This token is exchanged for OAuth access + refresh tokens upon profile creation. The refresh token lasts ~60 days; users only need to re-provide an NPSSO token when the refresh token expires.
- The PlayStation API provides trophy icons as direct URLs that can be downloaded and stored locally.
- The PlayStation API returns trophy grade information (bronze, silver, gold, platinum) as part of the trophy data response.
- The existing Achievement model can accommodate trophy grades by extending the model with a `trophyGrade` field (or equivalent), since trophies are functionally equivalent to achievements.
- The existing Game model's optional fields (`lastPlayed`, `playTimeMinutes`) are sufficient for PlayStation time-related metadata. The Game model will be extended with four new optional fields (`trophyBronze`, `trophySilver`, `trophyGold`, `trophyPlatinum`) for PlayStation trophy grade counts, analogous to how Xbox uses `currentGamerscore` and `maxGamerscore`. The existing `devices` field (used by Xbox for console generation) will be reused for PlayStation generation data (PS3, PS4, PS5, PS Vita).
- The existing platform enum (`'steam' | 'xbox' | 'playstation'`) in all models already supports PlayStation.
- SteamGridDB supports searching by game name, making it a viable fallback for PlayStation game art.
- The existing frontend components (`ProfileSelector`, `GameGrid`, `GameTile`, `ProfileSyncControls`) are platform-generic and can render PlayStation data with minimal modifications (primarily adding trophy-specific display logic).
- PlayStation CDN images use different URL structures than Xbox or Steam, requiring platform-specific image URL handling in the adapter.
- PlayStation privacy settings may restrict trophy visibility; the system must handle this gracefully.
