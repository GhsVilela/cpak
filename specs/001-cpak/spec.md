# Feature Specification: Trophy Hunter Achievements Tracker

**Feature Branch**: `001-cpak`  
**Created**: 2026-01-24  
**Status**: Draft  
**Input**: User description: "I am building a trophy hunter page... (Steam, Xbox, PlayStation achievements; self-hosted; initial setup for keys; categories per platform with default 100% filter; backend fetches, stores locally; image integration via SteamGridDB or better; multiple profiles per platform; settings with daily scheduler; personal archive)"

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

### User Story 1 - First-Time Setup & Initial Sync (Priority: P1)

User launches the self-hosted app and completes a setup wizard to configure platform credentials (Steam API key and ID; Xbox and PlayStation auth), then triggers an initial sync to fetch achievements. The app shows three platform categories; each defaults to listing only games with 100% achievements.

**Why this priority**: Without initial setup and first data import, the application has no value and cannot display achievements.

**Independent Test**: Configure a single platform (e.g., Steam only) and run sync. Verify that the Steam page loads and lists only 100% completed games, with counts matching platform data.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the user completes setup with valid platform credentials and runs initial sync, **Then** the app displays Steam/Xbox/PlayStation category pages with 100% completed games listed by default.
2. **Given** a fresh install, **When** the user provides invalid credentials, **Then** the app shows clear error messages and prevents sync until corrected.

---

### User Story 2 - Multi-Profile Management & Scheduling (Priority: P2)

User adds multiple accounts per platform and manages profiles (add/edit/remove). User configures a daily scheduler to update achievements automatically; manual sync is available per platform/profile.

**Why this priority**: Multi-profile support and regular updates are core to the "personal archive" objective and ongoing value.

**Independent Test**: Add a second Steam profile. Schedule daily sync. Verify that both profiles update and that manual sync triggers work independently.

**Acceptance Scenarios**:

1. **Given** an existing setup, **When** the user adds a second profile for Steam and saves, **Then** the profile appears and is selectable for sync and filtering.
2. **Given** scheduler enabled at 03:00 local, **When** the scheduled time arrives, **Then** the system runs sync for all configured profiles and records a sync run log.

---

### User Story 3 - Game Images & Themed Views (Priority: P3)

User sees visually rich game tiles using an image provider (SteamGridDB or better). Each platform page uses platform-consistent colors/accents and displays cached images with fallback when unavailable.

**Why this priority**: Improves usability and aesthetics, making browsing achievements more engaging.

**Independent Test**: Configure a SteamGridDB API key. Load platform pages with games; verify images appear and fallback works when image not found.

**Acceptance Scenarios**:

1. **Given** valid image provider credentials, **When** the user opens the Steam page, **Then** game tiles show images from cache and provider, themed with Steam colors.
2. **Given** missing images for certain games, **When** the user opens the Xbox page, **Then** fallback images or platform-provided art is displayed.

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

- Platform API rate limits reached during sync; subsequent requests are deferred and logged.
- Private or restricted profiles: achievements not accessible; user prompted to adjust privacy or provide appropriate tokens.
- Network outages or provider downtime during sync or image fetch; retries and graceful degradation.
- Duplicate titles across profiles/platforms; ensure correct scoping and avoid conflation.
- Scheduler timezone differences; default to host local time with clear display.
- Large libraries: pagination and incremental loading to keep UI responsive.

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: The app MUST provide a first-time setup flow to capture platform credentials and image provider keys.
- **FR-002**: The app MUST support self-hosting without managed services and store data locally in a database (per constitution).
- **FR-003**: The app MUST present three platform pages (Steam, Xbox, PlayStation) with default filter to only 100% completed games; users MUST be able to toggle to show any achievements.
- **FR-004**: The backend MUST fetch achievements for configured profiles and persist them locally; it MUST expose REST endpoints for profiles, games, achievements, images, and sync control.
- **FR-005**: The system MUST allow multiple profiles per platform; users MUST be able to add/edit/remove profiles in settings.
- **FR-006**: The system MUST provide manual sync per platform/profile and a daily scheduler configurable via settings.
- **FR-007**: The system MUST rate-limit sync operations and handle platform rate-limit responses gracefully.
- **FR-008**: The frontend MUST load platform pages using cached local data; network calls SHOULD be minimal during normal browsing.
- **FR-009**: The system MUST integrate with an image provider to fetch game images and cache metadata locally, with fallback images when unavailable.
- **FR-010**: The system MUST provide a secure method for Xbox and PlayStation authentication [NEEDS CLARIFICATION: user OAuth redirect vs manual token entry vs API key-based access].
- **FR-011**: The UI MUST clearly scope data by profile; when multiple profiles exist, behavior for aggregation vs per-profile view MUST be defined [NEEDS CLARIFICATION: aggregate across profiles or require profile selection per view].
- **FR-012**: The app SHOULD use SteamGridDB for images unless a better provider is preferred [NEEDS CLARIFICATION: preferred image provider and licensing constraints].
- **FR-013**: The system MUST support export/import of profiles, games, and achievements as JSON for personal archival.
- **FR-014**: The system MUST protect sensitive credentials (do not log secrets; encrypt at rest; require explicit user actions to reveal).
- **FR-015**: The system MUST provide clear error messages and audit logs for sync runs.

### Key Entities *(include if feature involves data)*

- **Profile**: Platform (`steam|xbox|playstation`), profileId, displayName, credential metadata (token scopes, expiration), createdAt, updatedAt.
- **Game**: platform, profileId, gameId, title, achievementsTotal, achievementsUnlocked, completionPercent, imageRefs, lastSyncedAt.
- **Achievement**: platform, profileId, gameId, achievementId, name, description, unlockedAt.
- **SyncRun**: timestamp, platform, profileId, status (`success|partial|error`), counts (games, achievements), errors.
- **ImageAsset**: gameId, platform, URLs, provider, cachedAt, status.

### Assumptions & Dependencies

- Users possess valid credentials/API access for Steam, Xbox, and PlayStation needed to read achievements.
- The app runs in a self-hosted environment with outbound internet access to platform APIs and image provider.
- Platform terms of service and privacy settings permit reading achievements for configured profiles.
- Image provider (e.g., SteamGridDB) is reachable and allows usage within personal archival context.
- Local storage is sufficient for caching metadata and optional images.

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: Users can complete first-time setup for at least one platform in under 5 minutes.
- **SC-002**: Platform pages (with 100% filter) load from local data in under 2 seconds for libraries up to 500 games.
- **SC-003**: Daily scheduler completes sync within 15 minutes for typical libraries; 95% of scheduled runs succeed over 30 consecutive days.
- **SC-004**: Image coverage: ≥ 90% of listed games display an image (provider or fallback).
- **SC-005**: Users can add multiple profiles per platform and switch views; 90% of users successfully perform multi-profile tasks without assistance.
