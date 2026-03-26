# API Contracts: PlayStation Integration

**Feature**: 006-playstation-integration
**Date**: 2026-03-26
**Purpose**: Define REST API endpoints and response shapes for PlayStation integration.

---

## Existing Endpoints — PlayStation-Specific Behavior

These endpoints already exist and support `platform=playstation`. The contracts below document PlayStation-specific fields and behaviors only.

---

### POST /api/profiles

**PlayStation-specific request body**:

```json
{
  "platform": "playstation",
  "profileId": "<psn-account-id>",
  "npssoToken": "<npsso-token-from-sony>"
}
```

**Behavior**:
1. Backend receives NPSSO token
2. Exchanges NPSSO for OAuth access + refresh tokens via `psn-api`
3. Fetches PSN profile (Online ID, avatar) using access token
4. Stores encrypted OAuth tokens in `credentials` field (NPSSO is NOT stored)
5. Returns created profile

**Response** (201 Created):

```json
{
  "_id": "mongo-object-id",
  "platform": "playstation",
  "profileId": "1234567890",
  "displayName": "PSN_OnlineId",
  "credentials": {
    "configured": true,
    "tokenType": "Bearer",
    "expiresAt": "2026-03-26T02:00:00.000Z"
  },
  "createdAt": "2026-03-26T01:00:00.000Z",
  "updatedAt": "2026-03-26T01:00:00.000Z"
}
```

**Error responses**:
- `400` — Invalid or expired NPSSO token: `{ "error": "Invalid NPSSO token. Please obtain a new token from https://ca.account.sony.com/api/v1/ssocookie" }`
- `409` — Profile already exists for this PSN account: `{ "error": "Profile already exists for this PlayStation account" }`

---

### POST /api/sync/playstation?profileId={id}

**Behavior**: Triggers a PlayStation trophy sync for the specified profile. Follows the same pattern as `/api/sync/xbox` and `/api/sync/steam`.

**Sync phases**:
1. Token refresh (if access token expired)
2. Fetch trophy titles (games with ≥1 earned trophy)
3. Download game cover art (PlayStation CDN → SteamGridDB → PCGamingWiki → Wikipedia)
4. Fetch trophy definitions + earn status per game
5. Download trophy icons
6. Upsert games and achievements with trophy grade metadata

**Response** (202 Accepted):

```json
{
  "message": "Sync started for PlayStation profile",
  "operationId": "sync-operation-id"
}
```

---

### GET /api/games?platform=playstation&profileId={id}

**PlayStation-specific query params**:

| Param | Type | Description |
|-------|------|-------------|
| `platform` | `string` | `"playstation"` |
| `profileId` | `string` | Profile MongoDB ID |
| `device` | `string` | Optional. Filter by generation: `"PS3"`, `"PS4"`, `"PS5"`, `"PSVita"` |
| `onlyCompleted` | `boolean` | Filter to 100% completion only |
| `sortBy` | `string` | `"title"`, `"completionPercent"`, `"achievementsTotal"`, `"lastSyncedAt"` |
| `sortOrder` | `string` | `"asc"` or `"desc"` |
| `limit` | `number` | Pagination limit |
| `offset` | `number` | Pagination offset |

**PlayStation-specific response fields** (in addition to standard game fields):

```json
{
  "data": [
    {
      "_id": "game-mongo-id",
      "platform": "playstation",
      "profileId": "profile-mongo-id",
      "gameId": "NPWR12345_00",
      "title": "God of War Ragnarök",
      "achievementsTotal": 36,
      "achievementsUnlocked": 36,
      "completionPercent": 100,
      "imagePath": "playstation/NPWR12345_00/game_grid.jpg",
      "devices": ["PS5"],
      "lastPlayed": "2026-01-15T18:30:00.000Z",
      "playTimeMinutes": null,
      "trophyBronze": 20,
      "trophySilver": 10,
      "trophyGold": 5,
      "trophyPlatinum": 1,
      "lastSyncedAt": "2026-03-26T01:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  },
  "trophySummary": {
    "totalBronze": 500,
    "totalSilver": 200,
    "totalGold": 80,
    "totalPlatinum": 15
  }
}
```

**Note**: The `trophySummary` object is included when `platform=playstation`. It aggregates trophy counts across ALL games for the selected profile (not just the current page). This is computed server-side via MongoDB aggregation.

---

### GET /api/games/{id}

**PlayStation-specific response** (single game):

```json
{
  "_id": "game-mongo-id",
  "platform": "playstation",
  "gameId": "NPWR12345_00",
  "title": "God of War Ragnarök",
  "achievementsTotal": 36,
  "achievementsUnlocked": 36,
  "completionPercent": 100,
  "imagePath": "playstation/NPWR12345_00/game_grid.jpg",
  "devices": ["PS5"],
  "lastPlayed": "2026-01-15T18:30:00.000Z",
  "playTimeMinutes": null,
  "trophyBronze": 20,
  "trophySilver": 10,
  "trophyGold": 5,
  "trophyPlatinum": 1
}
```

---

### GET /api/achievements?gameId={id}&profileId={id}

**PlayStation-specific response fields**:

```json
[
  {
    "_id": "achievement-mongo-id",
    "platform": "playstation",
    "profileId": "profile-mongo-id",
    "gameId": "game-mongo-id",
    "achievementId": "0",
    "name": "Bearer of the Flames",
    "description": "Complete the Game",
    "unlockedAt": "2026-01-15T18:30:00.000Z",
    "iconPath": "playstation/NPWR12345_00/0_icon.png",
    "iconGrayPath": "playstation/NPWR12345_00/0_icon.png",
    "trophyGrade": "platinum",
    "isHidden": false,
    "gamerscore": null
  },
  {
    "_id": "achievement-mongo-id-2",
    "platform": "playstation",
    "achievementId": "15",
    "name": "Hidden Trophy",
    "description": "Hidden trophy description not available",
    "unlockedAt": null,
    "iconPath": null,
    "iconGrayPath": null,
    "trophyGrade": "gold",
    "isHidden": true,
    "gamerscore": null
  }
]
```

**Notes**:
- `trophyGrade` is always populated for PlayStation achievements
- `isHidden` indicates secret trophies (may have resolved names from definition endpoint, or "Hidden Trophy" fallback)
- `gamerscore` is always `null` for PlayStation (Xbox-specific field)
- `iconGrayPath` same as `iconPath` — frontend applies CSS grayscale for locked trophies (no separate locked icon from PSN)
- Sorting: unlocked trophies first (sorted by `unlockedAt` desc), then locked trophies (sorted by `name` asc)

---

### GET /api/sync/status?platform=playstation&profileId={id}

**Response** (same shape as Xbox/Steam, no PlayStation-specific changes):

```json
{
  "current": {
    "_id": "sync-op-id",
    "status": "running",
    "progress": 45,
    "totalGames": 150,
    "gamesProcessed": 67,
    "totalAchievements": 5000,
    "achievementsSynced": 2250,
    "iconDownloadsPending": 5000,
    "iconDownloadsCompleted": 2000,
    "iconDownloadsFailed": 5
  },
  "lastCompleted": {
    "completedAt": "2026-03-25T01:00:00.000Z",
    "status": "completed"
  }
}
```

---

### DELETE /api/profiles/{id}

**PlayStation cascade behavior** (same pattern as Xbox/Steam):
1. Delete all `Game` documents where `profileId` matches and `platform='playstation'`
2. Delete all `Achievement` documents where `profileId` matches and `platform='playstation'`
3. Delete all `SyncOperation` documents where `profileId` matches
4. Delete all `SyncRun` documents where `profileId` matches
5. Delete image files under `images/playstation/{gameId}/` for all associated games
6. Delete the `Profile` document

---

## New Endpoint

### POST /api/auth/playstation/validate

**Purpose**: Validate an NPSSO token without creating a profile. Used by the settings UI to verify the token before submission.

**Request**:

```json
{
  "npssoToken": "<npsso-token>"
}
```

**Response** (200 OK):

```json
{
  "valid": true,
  "accountId": "1234567890",
  "onlineId": "PSN_OnlineId"
}
```

**Error response** (400):

```json
{
  "valid": false,
  "error": "NPSSO token is invalid or expired. Obtain a new one from https://ca.account.sony.com/api/v1/ssocookie"
}
```

---

## Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/playstation` | `page.tsx` (MODIFY) | Game library with trophy summary, generation filter, sync controls |
| `/playstation/game/[id]` | `page.tsx` (NEW) | Game detail with trophy list, grade badges, play time |
