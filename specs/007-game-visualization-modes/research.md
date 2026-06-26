# Research: Game Visualization Modes & Image Management

**Feature**: `007-game-visualization-modes` | **Date**: 2026-03-30

## R1: Steam CDN Image URLs for Icon and Hero

**Context**: The codebase currently downloads only grid images (600×900) from `cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg`. We need to determine if Steam exposes icon and hero images through public CDN endpoints.

**Decision**: Use Steam's well-documented public CDN URL patterns for all three image types.

**Rationale**: Steam exposes multiple image types through predictable CDN URLs derived from the app ID. These are publicly accessible without authentication.

**URL Patterns**:
- **Capsule (Grid)**: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg` (already implemented)
- **Hero**: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_hero.jpg` (1920×620 library hero banner)
- **Icon**: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/clienticon.ico` — However, Steam's game icons are `.ico` format and often low-res. A better source is the **header image** cropped down: `https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/header.jpg` (460×215) which can be center-cropped to 64×64. Alternatively, use the Steam Store API `getGameDetails` response which includes `header_image`. For consistent 64×64 icons, resize from the header image.
- **Fallback Hero**: Steam Store API `library_assets.library_hero` field or `header_image` stretched.

**Alternatives Considered**:
- Using `clienticon.ico` files: Rejected because `.ico` format has poor quality and inconsistent sizes.
- Using SteamGridDB for all icon sources: Rejected as SteamGridDB doesn't offer icon endpoints.

---

## R2: Xbox CDN Image URLs for Icon and Hero

**Context**: Xbox game images currently come from the `displayImage` or `largeBoxArt` fields in the Xbox Live API response. We need icon and hero image sources.

**Decision**: Use the Emerald Xbox Services API and Microsoft Store API to source hero and icon images, in addition to existing Xbox CDN sources.

**Rationale**: The Emerald API (`emerald.xboxservices.com`) already exists in the codebase and returns structured image data including `superHeroArt` (hero), `poster` (cover), and `boxArt` fields.

**Image Sources**:
- **Capsule (Grid)**: Existing — `displayImage` / `largeBoxArt` from title history API (already implemented)
- **Hero**: Emerald API `productSummaries[0].images.superHeroArt.url` — wide promotional art suitable for hero view
- **Icon**: Resize from `displayImage` (existing title image) cropped to 64×64 square, or use the smallest available image from Microsoft Store search results
- **Fallback**: Microsoft Store Search API (`apps.microsoft.com/api/products/search`) returns images with `width` and `height` metadata — select appropriately sized images

**Alternatives Considered**:
- Using `image.xboxlive.com` public CDN: Only works for Xbox 360 achievement icons, not game title images.
- Using Xbox product page scraping: Too fragile and violates terms.

---

## R3: PlayStation CDN Image URLs for Icon and Hero

**Context**: PlayStation game images currently come from `trophyTitleIconUrl` in the PSN API response. This is typically a small-to-medium icon. We need hero and high-quality icon images.

**Decision**: Use `trophyTitleIconUrl` as the icon source (resize to 64×64) and rely on SteamGridDB (when configured) + fallback sources for hero images. PlayStation does not expose hero-sized game art through its public trophy API.

**Rationale**: The PSN trophy API only returns trophy title icons (small square images). PlayStation does not provide publicly accessible CDN endpoints for library hero art or wide promotional banners. SteamGridDB is the best source for PlayStation hero images via game name search.

**Image Sources**:
- **Capsule (Grid)**: SteamGridDB by name → PCGamingWiki → Wikipedia (existing behavior)
- **Hero**: SteamGridDB `getHeroImages()` by name search (optional, only when configured) → no fallback hero source available
- **Icon**: `trophyTitleIconUrl` from PSN API resized to 64×64 (direct CDN URL, publicly accessible)

**Alternatives Considered**:
- PlayStation Store web scraping: Too fragile, no stable API.
- Using capsule image as hero fallback: Possible as a UI fallback (blurred/stretched), but not as a download source.

---

## R4: SteamGridDB Icon Support

**Context**: The spec assumes SteamGridDB supports icon queries. The existing adapter has `getGridImages()` and `getHeroImages()` but no icon method.

**Decision**: SteamGridDB API v2 supports `/icons/game/{id}` endpoint. Add a `getIconImages()` method to the SteamGridDB adapter.

**Rationale**: The SteamGridDB API documentation at `https://www.steamgriddb.com/api/v2` lists icons as a supported resource type alongside grids, heroes, and logos. The endpoint follows the same pattern: `GET /icons/game/{id}`. Icons are typically 64×64 or similar small square images.

**Implementation**: Add method following same pattern as `getHeroImages()`:
```typescript
async getIconImages(gameId: number): Promise<SteamGridDBImage[]>
// GET /icons/game/{gameId}
```

**Alternatives Considered**:
- Using grid images resized to 64×64: Poor quality when drastically downsized from 600×900.
- Not using SteamGridDB for icons: Acceptable since platform CDNs provide sufficient icon sources, but having it as a fallback improves coverage.

---

## R5: Image Storage Path Strategy for Multiple Image Types

**Context**: Current storage uses `{platform}/{gameId}/game_grid.{ext}` for game images. Need to store three types without conflicts.

**Decision**: Use the existing `achievementId` parameter field to differentiate image types. The game-level images already use `game` as the achievementId, combined with the imageType parameter (`grid`, `icon`, `header`). Extend to support `hero` as a new imageType value.

**File Naming**:
- **Icon**: `{platform}/{gameId}/game_icon.jpg` (64×64)
- **Hero**: `{platform}/{gameId}/game_hero.jpg` (1920×620)
- **Capsule**: `{platform}/{gameId}/game_grid.jpg` (600×900, existing)

**Rationale**: Follows the existing naming convention (`game_grid`, `game_header`, etc.) already used in the imageStorage class. The `checkLocalFile()` method already searches for files by this pattern.

**Alternatives Considered**:
- Subdirectories per image type: Unnecessary complexity, current flat structure works.
- Separate storage directories: Would break existing icons route serving.

---

## R6: Game Model Field Naming for Image Paths

**Context**: Current model has single `imagePath?: string`. Need three separate paths plus user-override support.

**Decision**: Add fields `iconImagePath`, `heroImagePath`, rename effective usage of `imagePath` to `capsuleImagePath` via migration.

**Field Design**:
```typescript
// Existing (to be migrated)
imagePath?: string;              // → capsuleImagePath

// New fields
iconImagePath?: string;          // Path to 64×64 icon image
heroImagePath?: string;          // Path to 1920×620 hero image  
capsuleImagePath?: string;       // Path to 600×900 capsule image (migrated from imagePath)
customTitle?: string;            // User-overridden display title (takes precedence over title)
```

**Migration Strategy**: 
- Add new fields alongside existing `imagePath`
- Database migration renames `imagePath` to `capsuleImagePath` using `$rename` operator
- Frontend/backend code updated to use `capsuleImagePath`
- `customTitle` is `null`/`undefined` by default; when set, UI displays it instead of `title`

**Rationale**: Descriptive field names make the codebase self-documenting. Keeping `imagePath` temporarily during migration avoids breaking changes. The `customTitle` field is simpler than a separate override table.

**Alternatives Considered**:
- Single `images` subdocument: `{ icon?: string, hero?: string, capsule?: string }` — More structured but requires changing every query that references `imagePath` to `images.capsule`, and is harder to index/query.
- Separate `gameCustomizations` collection: Over-engineered for just title and image overrides.

---

## R7: Server-Side Search Implementation

**Context**: Spec requires server-side search via `search` query parameter on games API with case-insensitive title matching.

**Decision**: Add `search` query parameter to `GET /games` route using MongoDB `$regex` with case-insensitive flag.

**Implementation**:
```typescript
if (query.search) {
  // Escape regex special chars for safety
  const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  filter.title = { $regex: escaped, $options: 'i' };
}
```

**Index Consideration**: The current indexes don't include `title`. For search across hundreds of games, a regex query without an index is acceptable — the dataset per-user is small enough (hundreds, not millions). Adding a text index could be considered later if performance is an issue.

**Frontend Debounce**: 300ms debounce on input before sending API request. Use `useRef` + `setTimeout` pattern (no new dependencies needed).

**Alternatives Considered**:
- MongoDB `$text` search: Requires a text index, provides stemming/scoring but is overkill for simple substring matching. Also doesn't support partial word matching well.
- Atlas Search: Not available in self-hosted MongoDB.

---

## R8: View Mode Persistence Strategy

**Context**: View mode preference should be stored per-platform in browser local storage.

**Decision**: Use `localStorage` with keys like `cpak-view-mode-steam`, `cpak-view-mode-xbox`, `cpak-view-mode-playstation`. Default to `capsule` (current behavior).

**Implementation**: Simple helper function:
```typescript
function getViewMode(platform: string): 'capsule' | 'list' | 'hero' {
  return (localStorage.getItem(`cpak-view-mode-${platform}`) as any) || 'capsule';
}
function setViewMode(platform: string, mode: 'capsule' | 'list' | 'hero') {
  localStorage.setItem(`cpak-view-mode-${platform}`, mode);
}
```

**Rationale**: Local storage is the simplest persistence mechanism for client-side preferences. No server-side storage needed per constitution principles (avoid unnecessary database changes for non-essential data).

**Alternatives Considered**:
- Cookies: Sent with every request, unnecessary overhead.
- Database setting: Over-engineered, would require auth/session tracking which doesn't exist in the app.

---

## R9: Image Upload Processing Pipeline

**Context**: Users can upload custom images for any of the three types. Need validation, resize, and storage.

**Decision**: Add a new `PATCH /games/:id/images/:imageType` endpoint that accepts multipart form upload. Process with Sharp on the backend.

**Pipeline**:
1. Validate file size (≤10MB) via Fastify body size limit
2. Validate image format using Sharp metadata (reject non-image files)
3. Resize/crop to target dimensions based on `imageType`:
   - `icon`: 64×64, fit cover, JPEG quality 90
   - `hero`: 1920×620, fit cover, JPEG quality 90
   - `capsule`: 600×900, fit cover, JPEG quality 90
4. Store in existing image directory: `{platform}/{gameId}/game_{imageType}.jpg`
5. Update game document with new image path
6. Mark as user-uploaded (to prevent re-sync overwrite)

**Title Edit**: `PATCH /games/:id` with `{ customTitle: "..." }` body.

**Rationale**: Reuses existing Sharp image processing and storage infrastructure. Multipart upload is standard Fastify pattern. The PATCH endpoint follows REST conventions.

**Alternatives Considered**:
- Base64 upload in JSON body: Works for small files but wastes bandwidth for larger images.
- Separate upload service: Over-engineered for a single-user self-hosted app.

---

## R10: Parallel Image Download Strategy

**Context**: Need to download 3 image types per game concurrently during sync while keeping games sequential.

**Decision**: Use `Promise.all()` to download all three image types for a single game concurrently. Wrap each download in a try/catch so one failure doesn't block the others.

**Implementation Pattern**:
```typescript
await Promise.all([
  downloadIcon(game).catch(err => log.warn({ err }, 'Icon download failed')),
  downloadHero(game).catch(err => log.warn({ err }, 'Hero download failed')),
  downloadCapsule(game).catch(err => log.warn({ err }, 'Capsule download failed')),
]);
```

**Rationale**: Simple, uses existing Promise patterns already in the codebase. No new dependencies needed. The three downloads target different URLs/CDNs so there's no rate-limit conflict within a single game.

**Alternatives Considered**:
- `p-limit` for cross-game parallelism: Would require more complex rate-limit management across different CDN domains. The sequential per-game approach is sufficient for the <50% sync time increase target.
