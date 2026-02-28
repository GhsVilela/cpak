# API Contracts: Xbox Sync & Data

**Feature**: 005-xbox-integration  
**Domain**: Backend REST API — Xbox sync and existing endpoints with Xbox support

## Existing Routes (No Change Required)

These existing routes already support Xbox via the platform-agnostic design:

| Route | Xbox Support | Notes |
|---|---|---|
| `GET /api/games?platform=xbox&profileId=...` | Works as-is | Filters by `platform='xbox'` |
| `GET /api/games/:id` | Works as-is | Game documents have `platform` field |
| `GET /api/achievements?gameId=...&profileId=...` | Works as-is | Achievement documents have `platform` field |
| `GET /api/icons/xbox/:gameId/:filename` | Works as-is | Serves files from `images/xbox/` |
| `GET /api/sync/status?profileId=...` | Works as-is | SyncOperation is platform-agnostic |
| `DELETE /api/sync/cancel/:operationId` | Works as-is | Cancellation is platform-agnostic |
| `GET /api/sync/runs?profileId=...` | Works as-is | SyncRun documents have `platform` field |
| `GET /api/profiles` | Works as-is | Returns all profiles (Xbox included) |
| `GET /api/profiles/:id` | Works as-is | Profile documents have `platform` field |
| `PATCH /api/profiles/:id` | Works as-is | Can update Xbox profile display name |
| `DELETE /api/profiles/:id` | Works as-is | Cascade deletes all Xbox data |
| `GET/PUT/DELETE /api/settings/:key` | Works as-is | For `xbox_client_id`, `xbox_client_secret` |
| `POST /api/backup` | Works as-is | Includes Xbox profiles, games, achievements |
| `POST /api/backup/restore` | Works as-is | Restores Xbox data intact |

## Xbox Sync Internal Flow

When `POST /api/sync/xbox?profileId={id}` is called, the `syncService.syncXbox()` method executes:

### Phase 1: Token Refresh & Profile Update (0-5%)

1. Load profile, decrypt refresh token
2. Refresh Microsoft OAuth token: `live.refreshAccessToken(refreshToken)`
3. Exchange for XSTS token: User Token → XSTS Token
4. Fetch Xbox profile: gamertag, gamerscore, avatar
5. Update profile display name if changed
6. If refresh fails → mark sync as failed with "re-authentication required" error

### Phase 2: Game Discovery (5-33%)

1. Fetch title history: `GET /users/xuid({xuid})/history/titles` with pagination
2. Filter: only titles with `achievement.currentAchievements > 0`
3. Extract: titleId, name, achievement counts, game images, `devices[]` (console generation: Xbox360, XboxOne, XboxSeries, PC)
4. Update SyncOperation progress

### Phase 3: Achievement Sync (33-50%)

1. For each game (adaptive batching):
   - Fetch achievements: `GET /users/xuid({xuid})/achievements?titleId={titleId}` with pagination
   - Map to Achievement model fields
   - Check for cancellation between batches
2. Update SyncOperation progress per batch

### Phase 4: Game Image Downloads (50-66%)

1. For each game (concurrent with p-limit):
   - Check local file first
   - Download from Xbox image URL (from title history response)
   - Fallback: SteamGridDB name search → download grid image
   - Store at `images/xbox/{titleId}/game_grid.{ext}`
2. Upsert Game documents with `imagePath`

### Phase 5: Achievement Icon Downloads (66-100%)

1. For each achievement with icon URL (concurrent with p-limit):
   - Check local file first
   - Download from Xbox icon URL (from achievement `mediaAssets`)
   - Store at `images/xbox/{titleId}/{achievementId}_icon.{ext}`
2. Set both `iconPath` and `iconGrayPath` to the same file path (Xbox provides single icon; frontend applies CSS grayscale for locked state)
3. Upsert Achievement documents in batches of 500 via `bulkWrite`
4. Create SyncRun record

## SteamGridDB Name Search Contract

### New Method: `searchGameByName(name: string): Promise<number | null>`

**Endpoint**: `GET https://www.steamgriddb.com/api/v2/search/autocomplete/{term}`

**Request**:
```
GET /search/autocomplete/Halo%20Infinite
Authorization: Bearer {steamgrid_api_key}
```

**Response**:
```json
{
  "success": true,
  "data": [
    { "id": 154823, "name": "Halo Infinite", "types": ["game"], "verified": true },
    { "id": 198245, "name": "Halo Infinite (Campaign)", "types": ["dlc"], "verified": false }
  ]
}
```

**Logic**: Returns the `id` of the first verified match (or first result if no verified match). Returns `null` if no results.

### New Method: `downloadGameImageByName(gameName: string, platform: string, gameId: string): Promise<string | null>`

1. Call `searchGameByName(gameName)` → SteamGridDB game ID
2. Call existing `getGridImages(sgdbGameId)` → image URLs
3. Call existing `imageStorage.downloadAndStore(url, platform, gameId, null, 'grid')` → stored path
4. Returns relative image path or `null`
