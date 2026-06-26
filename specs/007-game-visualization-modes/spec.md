# Feature Specification: Game Visualization Modes & Image Management

**Feature Branch**: `007-game-visualization-modes`  
**Created**: 2026-03-30  
**Status**: Draft  
**Input**: User description: "Add game visualization modes (List, Hero, Capsule/Grid) with multi-source image downloads, game search, and user-editable game metadata"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch Between Game Visualization Modes (Priority: P1)

A user browsing their game library on any platform page (Steam, Xbox, PlayStation) wants to switch between three visualization modes to view their collection in different layouts:

- **Capsule (Grid)**: The current default view showing 600×900 portrait cover art in a responsive grid. This is the existing behavior.
- **List**: A compact list view showing 64×64 game icons alongside game title, completion percentage, and key stats. Ideal for quickly scanning a large library.
- **Hero**: A wide cinematic view showing 1920×620 hero/banner images with game title overlaid. Ideal for browsing visually rich artwork.

The user's selected visualization mode preference should persist across page reloads and sessions.

**Why this priority**: This is the core feature — without the view switching, none of the other image types or UI enhancements have purpose.

**Independent Test**: Can be fully tested by navigating to any platform page, switching between Capsule/List/Hero modes, and verifying the correct layout and image type renders for each. Delivers immediate visual variety and user choice.

**Acceptance Scenarios**:

1. **Given** a user is on a platform page in Capsule (Grid) mode, **When** they select "List" from the view mode selector, **Then** the layout switches to a vertical list with 64×64 icons, game title, and completion stats displayed per row.
2. **Given** a user is on a platform page in Capsule (Grid) mode, **When** they select "Hero" from the view mode selector, **Then** the layout switches to wide cards showing 1920×620 hero images with game title overlaid.
3. **Given** a user selects "Hero" mode on the Steam page, **When** they leave and return to the Steam page later, **Then** the view defaults to Hero mode (their last selection is remembered).
4. **Given** a user is in List mode, **When** a game has no icon image available, **Then** a placeholder icon is displayed with the first letter of the game title.
5. **Given** a user is in Hero mode, **When** a game has no hero image available, **Then** a fallback is displayed using the capsule image stretched/blurred as background or a styled placeholder card.

---

### User Story 2 - Multi-Type Image Downloading (Priority: P1)

When games are synced from any platform (Steam, Xbox, PlayStation), the system must download three image types per game: icon (64×64), hero (1920×620), and capsule/grid (600×900). Today only capsule/grid images are downloaded.

Image sourcing follows a tiered approach:
- **Platform CDNs** (publicly available): Primary source. Steam, Xbox, and PlayStation each expose official game artwork through their public CDN endpoints. These should always be attempted first regardless of configuration.
- **SteamGridDB**: Optional secondary source. Only used when the user has configured a SteamGridDB API key. Provides community-contributed artwork for all three platforms (matches by Steam App ID or game name).
- **Fallback sources** (PCGamingWiki, Wikipedia): Tertiary sources for capsule/grid images when primary and optional sources fail.

**Why this priority**: Without downloading additional image types, the List and Hero views would have no images to display. This is a prerequisite for Story 1 to function fully.

**Independent Test**: Can be tested by triggering a game sync and verifying that icon, hero, and capsule images are all stored. Even without the UI views, the images should be downloadable and served correctly.

**Acceptance Scenarios**:

1. **Given** a Steam game is synced, **When** the sync completes, **Then** the system stores three image files: an icon (64×64), a hero image (1920×620), and a capsule image (600×900).
2. **Given** an Xbox game is synced and SteamGridDB is not configured, **When** the sync completes, **Then** the system downloads images only from publicly available Xbox CDN endpoints and fallback sources.
3. **Given** SteamGridDB is configured with a valid API key, **When** a PlayStation game is synced and the platform CDN does not have a hero image, **Then** the system fetches the hero image from SteamGridDB by searching the game name.
4. **Given** no image source has an icon for a game, **When** the sync completes, **Then** the game record stores no icon path and the UI gracefully shows a placeholder.
5. **Given** a game already has all three image types stored locally, **When** a re-sync occurs, **Then** the system skips re-downloading existing images (cache check).

---

### User Story 3 - Search Games by Name (Priority: P2)

A user wants to quickly find a specific game in their library on any platform page by typing its name into a search box. Today, there is no text-based search — only sort and filter controls exist.

The search should filter the displayed game list in real-time as the user types, matching against game titles. It should work in combination with existing filters (completion, generation/device) and with any active visualization mode.

**Why this priority**: With potentially hundreds of games in a library, finding a specific game without search requires scrolling through pages. This significantly improves daily usability.

**Independent Test**: Can be tested by navigating to a platform page, typing a game name in the search box, and verifying the displayed games filter down to matching titles in real-time.

**Acceptance Scenarios**:

1. **Given** a user is on the Steam page with 200 games, **When** they type "Portal" in the search box, **Then** only games with "Portal" in their title are displayed.
2. **Given** a user has typed a search query, **When** they clear the search box, **Then** all games are displayed again (respecting any active filters).
3. **Given** a user has the "Only Completed" filter active, **When** they search for a game name, **Then** only completed games matching the search term are shown.
4. **Given** a user searches for a game that doesn't exist in their library, **When** no results match, **Then** a "No games found" message is displayed.
5. **Given** a user is in Hero view mode with a search active, **When** they switch to List mode, **Then** the same search filter remains applied in the new view.

---

### User Story 4 - Edit Game Image and Title (Priority: P3)

A user wants to manually update a game's icon, hero image, capsule image, or title. This is useful when automatic image downloading fetches incorrect artwork, when a game's title is displayed differently than the user prefers, or when no image was found during sync.

The user should be able to click on a game and access an edit interface where they can:
- Upload a custom image for any of the three image types (icon, hero, capsule)
- Edit the game's display title
- See a preview of the uploaded image before saving

**Why this priority**: This is a quality-of-life enhancement that gives users control over their library's appearance. The core viewing experience works without it, but it enables personalization and fixes for edge cases.

**Independent Test**: Can be tested by selecting a game, uploading a new image for any type, editing the title, and verifying the changes persist and display correctly across all view modes.

**Acceptance Scenarios**:

1. **Given** a user is viewing a game's details, **When** they click an edit/customize option, **Then** an edit interface shows the current icon, hero, capsule images and the game title with edit controls.
2. **Given** a user uploads a new hero image, **When** the image is saved, **Then** the system resizes/crops it to 1920×620, stores it, and the Hero view immediately reflects the new image.
3. **Given** a user edits a game's title from "DARK SOULS™ III" to "Dark Souls 3", **When** they save, **Then** the updated title is displayed across all views and persists across syncs.
4. **Given** a user uploads an image that is not a valid image file, **When** they attempt to save, **Then** the system rejects the upload with a clear error message.
5. **Given** a user uploads a 3000×3000 PNG as a capsule image, **When** the upload is processed, **Then** the system automatically resizes/crops it to 600×900 and stores the optimized version.

---

### Edge Cases

- What happens when a game sync is in progress and the user switches visualization modes? The view should switch immediately using whatever images are already available.
- How does the system handle extremely long game titles in List view? Titles should be truncated with an ellipsis after a reasonable character limit.
- What happens if network connectivity is lost during image downloading? The system should mark failed downloads and retry during the next sync cycle without blocking other game image downloads.
- How does the system handle games that exist on multiple platforms (e.g., same game on Steam and Xbox)? Each platform entry is independent — images are stored per platform per game as is the current behavior.
- What happens when SteamGridDB returns multiple image results? The system should select the highest-scored image matching the required dimensions.
- What if a user uploads an animated GIF or a non-standard image format? The system should convert it to a supported static format (JPEG/WebP) during processing.

## Requirements *(mandatory)*

### Functional Requirements

#### Visualization Modes

- **FR-001**: System MUST support three visualization modes on every platform page: Capsule (Grid), List, and Hero.
- **FR-002**: System MUST provide a view mode selector control visible on all platform pages that allows switching between the three modes.
- **FR-003**: System MUST persist the user's last-selected visualization mode preference per-platform (Steam, Xbox, PlayStation independently) and restore it when they return to that platform page.
- **FR-004**: Capsule (Grid) mode MUST display games as 600×900 portrait cards in a responsive grid layout (current behavior).
- **FR-005**: List mode MUST display games as rows with a 64×64 icon, game title, completion percentage, and key platform-specific stats (e.g., gamerscore for Xbox, trophy counts for PlayStation).
- **FR-006**: Hero mode MUST display games as wide cards showing a 1920×620 banner image with the game title overlaid.
- **FR-007**: Each visualization mode MUST work with all existing sort and filter controls (completion filter, device/generation filters, sort options, pagination).

#### Image Downloading & Storage

- **FR-008**: System MUST download and store three image types per game during sync: icon (64×64), hero (1920×620), and capsule/grid (600×900).
- **FR-009**: System MUST fetch images from publicly available platform CDN endpoints as the primary source, without requiring any configuration.
- **FR-010**: System MUST use SteamGridDB as a secondary image source only when a SteamGridDB API key has been configured by the user.
- **FR-011**: System MUST fall back to tertiary sources (PCGamingWiki, Wikipedia) for capsule/grid images when primary and secondary sources fail.
- **FR-012**: System MUST resize and normalize downloaded images to their target dimensions: icons to 64×64, hero images to 1920×620, capsule images to 600×900.
- **FR-013**: System MUST skip re-downloading images that already exist in local storage during re-sync operations.
- **FR-014**: System MUST store each image type in a distinguishable path or filename so icon, hero, and capsule images can be independently served and replaced.
- **FR-015**: System MUST handle missing images gracefully — a game with no hero image must still display correctly in Hero view with an appropriate placeholder.

#### Game Search

- **FR-016**: System MUST provide a text search input on each platform page that filters games by title.
- **FR-017**: Search MUST use server-side filtering via a `search` query parameter on the games API, with user input debounced (~300ms) before sending the request. This ensures the full library is searched regardless of pagination.
- **FR-018**: Search MUST work in combination with all existing filters and with any active visualization mode.
- **FR-019**: System MUST display a "No games found" message when search and filter combination yields no results.

#### Game Metadata Editing

- **FR-020**: Users MUST be able to edit a game's display title.
- **FR-021**: Users MUST be able to upload custom images for any of the three image types (icon, hero, capsule) for any game.
- **FR-022**: System MUST validate uploaded files are valid image formats and reject files exceeding 10MB before processing.
- **FR-023**: System MUST resize/crop uploaded images to the correct target dimensions for the selected image type.
- **FR-024**: System MUST show a preview of the uploaded image before the user confirms the save.
- **FR-025**: User edits to title and images MUST persist across game re-syncs (user overrides take precedence over synced data).
- **FR-026**: System MUST migrate existing games by mapping the current single `imagePath` to the new capsule image path field. Icon and hero image fields start empty and populate on the next sync.
- **FR-027**: During sync, the system MUST download all three image types (icon, hero, capsule) for a single game concurrently (in parallel), while processing games themselves sequentially, to meet sync performance targets.

### Key Entities

- **Game**: Existing entity representing a game in the user's library. Must be extended to support paths for three image types (icon, hero, capsule) instead of the current single `imagePath` field. Must also support a user-overridden title field that takes precedence over the synced title. During migration, existing `imagePath` maps to the capsule image path; icon and hero paths start empty and populate on next sync.
- **Image Asset**: Represents a stored game image file. Has a type (icon, hero, capsule), dimensions, file format, storage path, and source (platform CDN, SteamGridDB, user upload, fallback). Each game can have up to three image assets.
- **View Mode Preference**: The user's selected visualization mode. Stored client-side per-platform (e.g., separate local storage keys for Steam, Xbox, PlayStation).

## Clarifications

### Session 2026-03-30

- Q: How should game search work against the full library (client-side, server-side debounced, or hybrid)? → A: Server-side with debounce — add a `search` query parameter to the games API, debounce user input (~300ms), fetch filtered results from backend.
- Q: Should the view mode preference be stored per-platform or as a single global setting? → A: Per-platform — each platform page (Steam, Xbox, PlayStation) remembers its own view mode independently.
- Q: What should the maximum file size for image uploads be? → A: 10MB.
- Q: How should existing games be handled during migration from single imagePath to three image fields? → A: Map existing `imagePath` to capsule image path; icon and hero fields start empty and populate on next sync.
- Q: Should the three image types per game be downloaded in parallel or sequentially during sync? → A: Parallel per-game — download icon, hero, and capsule concurrently for each game, but process games sequentially.

## Assumptions

- Steam exposes official game artwork (capsule, hero, icon) through its public CDN at known URL patterns (e.g., `steamcdn-a.akamaihd.net`, `cdn.akamai.steamstatic.com`). These URLs are publicly accessible without authentication.
- Xbox title images from Microsoft Store CDN support dimension parameters that can be adjusted to fetch different image sizes (icon, hero, capsule).
- PlayStation game images from PSN CDN are publicly accessible for trophy title icons. Hero images may need to be sourced from SteamGridDB or fallback sources.
- SteamGridDB already supports hero image queries (confirmed by existing `getHeroImages` method in the codebase), and also supports icon image queries.
- The view mode preference is stored client-side (browser local storage) rather than server-side, keeping the feature simple and avoiding database changes for preferences.
- User-uploaded images are processed server-side to ensure correct sizing and format normalization.
- User edits to game title are flagged in the database so that subsequent syncs do not overwrite user customizations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between Capsule, List, and Hero visualization modes on any platform page in under 1 second with no page reload.
- **SC-002**: 100% of games display an appropriate image or placeholder in all three visualization modes after a full sync.
- **SC-003**: Game search returns filtered results within 500 milliseconds of the user pausing typing.
- **SC-004**: Users can upload a custom image and see it reflected in the game library within 5 seconds of confirming the upload.
- **SC-005**: Image downloading during sync completes for all three image types per game without increasing total sync time by more than 50% compared to the current single-image download.
- **SC-006**: The user's visualization mode preference persists correctly across browser sessions with 100% reliability.
- **SC-007**: Users can find and edit any game's title or images within 3 clicks from the platform page.
