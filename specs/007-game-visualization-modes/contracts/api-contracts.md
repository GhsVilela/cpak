# API Contracts: Game Visualization Modes & Image Management

**Feature**: `007-game-visualization-modes` | **Date**: 2026-03-30

## Modified Endpoints

### GET /api/games

**Change**: Add `search` query parameter for server-side title filtering.

#### Request

```
GET /api/games?platform=steam&profileId=abc&search=portal&limit=50&offset=0&sortBy=title&sortOrder=asc
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| platform | `string` | No | `steam \| xbox \| playstation` |
| profileId | `string` | No | MongoDB ObjectId |
| search | `string` | No | **NEW** — Case-insensitive substring match against game title |
| onlyCompleted | `string` | No | `'true'` for 100% completion only |
| excludeHidden | `string` | No | `'true'` to exclude played_history + fetch-failed |
| limit | `string` | No | Max results (default 50, max 500) |
| offset | `string` | No | Pagination offset |
| sortBy | `string` | No | `title \| completionPercent \| lastSyncedAt \| achievementsTotal \| currentGamerscore` |
| sortOrder | `string` | No | `asc \| desc` |
| device | `string` | No | Xbox: `Xbox360 \| XboxOne \| XboxSeries \| PC \| PlayAnywhere \| ConsoleOnly` |

#### Response (updated game object shape)

```json
{
  "data": [
    {
      "_id": "60f7c...",
      "platform": "steam",
      "profileId": "60f7a...",
      "gameId": "570",
      "title": "Dota 2",
      "customTitle": null,
      "achievementsTotal": 50,
      "achievementsUnlocked": 35,
      "completionPercent": 70,
      "capsuleImagePath": "steam/570/game_grid.jpg",
      "iconImagePath": "steam/570/game_icon.jpg",
      "heroImagePath": "steam/570/game_hero.jpg",
      "lastSyncedAt": "2026-03-30T10:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "totalAchievementsUnlocked": 1200
  }
}
```

**Changed Fields in Game Object**:
- `imagePath` → removed (replaced by `capsuleImagePath`)
- `capsuleImagePath` — NEW: path to 600×900 capsule image
- `iconImagePath` — NEW: path to 64×64 icon image
- `heroImagePath` — NEW: path to 1920×620 hero image
- `customTitle` — NEW: user-overridden title (null when not set)

---

### GET /api/games/:id

**Change**: Response includes new image path fields and customTitle.

#### Response

```json
{
  "_id": "60f7c...",
  "platform": "steam",
  "profileId": "60f7a...",
  "gameId": "570",
  "title": "Dota 2",
  "customTitle": "DOTA 2",
  "achievementsTotal": 50,
  "achievementsUnlocked": 35,
  "completionPercent": 70,
  "capsuleImagePath": "steam/570/game_grid.jpg",
  "iconImagePath": "steam/570/game_icon.jpg",
  "heroImagePath": "steam/570/game_hero.jpg",
  "lastSyncedAt": "2026-03-30T10:00:00Z"
}
```

---

## New Endpoints

### PATCH /api/games/:id

**Purpose**: Update game metadata (custom title).

#### Request

```
PATCH /api/games/60f7c...
Content-Type: application/json
```

```json
{
  "customTitle": "Dark Souls 3"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| customTitle | `string \| null` | Yes | New display title. Set to `null` to revert to synced title. |

#### Response

```json
{
  "_id": "60f7c...",
  "title": "DARK SOULS™ III",
  "customTitle": "Dark Souls 3",
  "capsuleImagePath": "steam/570/game_grid.jpg",
  "iconImagePath": "steam/570/game_icon.jpg",
  "heroImagePath": "steam/570/game_hero.jpg"
}
```

#### Errors

| Status | Condition |
|--------|-----------|
| 400 | Invalid request body (customTitle not string or null) |
| 404 | Game not found |

---

### PATCH /api/games/:id/images/:imageType

**Purpose**: Upload a custom image for a specific image type.

#### Request

```
PATCH /api/games/60f7c.../images/hero
Content-Type: multipart/form-data
```

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| id | path | `string` | Yes | Game MongoDB ObjectId |
| imageType | path | `string` | Yes | `icon \| hero \| capsule` |
| image | body (multipart) | `File` | Yes | Image file (JPEG, PNG, WebP, GIF). Max 10MB. |

#### Response

```json
{
  "_id": "60f7c...",
  "iconImagePath": "steam/570/game_icon.jpg",
  "heroImagePath": "steam/570/game_hero.jpg",
  "capsuleImagePath": "steam/570/game_grid.jpg"
}
```

#### Processing

1. Validate file is a valid image (Sharp metadata check)
2. Validate file size ≤ 10MB
3. Resize to target dimensions:
   - `icon`: 64×64, fit cover, JPEG quality 90
   - `hero`: 1920×620, fit cover, JPEG quality 90
   - `capsule`: 600×900, fit cover, JPEG quality 90
4. Store at `{platform}/{gameId}/game_{imageType}.jpg`
5. Update game document with new image path

#### Errors

| Status | Condition |
|--------|-----------|
| 400 | No file provided |
| 400 | File is not a valid image |
| 400 | File exceeds 10MB |
| 400 | Invalid imageType (not icon/hero/capsule) |
| 404 | Game not found |

---

## Existing Endpoints (unchanged)

### GET /api/icons/:platform/:gameId/:filename

No changes needed. The existing icons route serves any file from the images directory by path. New image files (`game_icon.jpg`, `game_hero.jpg`) will be served automatically using the same route.

**Example URLs**:
- Icon: `GET /api/icons/steam/570/game_icon.jpg`
- Hero: `GET /api/icons/steam/570/game_hero.jpg`
- Capsule: `GET /api/icons/steam/570/game_grid.jpg` (existing)

---

## Frontend API Client Changes

### Image URL Construction

```typescript
// Current (single image)
const imageUrl = `/api/icons/${game.imagePath}`;

// New (per image type)
const capsuleUrl = game.capsuleImagePath ? `/api/icons/${game.capsuleImagePath}` : null;
const iconUrl = game.iconImagePath ? `/api/icons/${game.iconImagePath}` : null;
const heroUrl = game.heroImagePath ? `/api/icons/${game.heroImagePath}` : null;
```

### Search API Call (Frontend)

```typescript
// Debounced search (300ms)
const params = new URLSearchParams({
  platform,
  profileId,
  limit: String(limit),
  offset: String(offset),
  ...(searchQuery && { search: searchQuery }),
});
const response = await apiClient.get<GamesResponse>(`/games?${params.toString()}`);
```

### Game Edit API Calls (Frontend)

```typescript
// Update title
await apiClient.patch(`/games/${gameId}`, { customTitle: newTitle });

// Upload image
const formData = new FormData();
formData.append('image', file);
await apiClient.patch(`/games/${gameId}/images/${imageType}`, formData);
```
