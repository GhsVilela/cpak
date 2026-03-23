# Data Model: Xbox Integration

**Feature**: 005-xbox-integration  
**Date**: 2026-02-27

## Entity Relationship Overview

```
Profile (platform='xbox')
  │
  ├── 1:N ──→ Game (platform='xbox')
  │              │
  │              └── 1:N ──→ Achievement (platform='xbox')
  │
  ├── 1:N ──→ SyncRun
  │
  └── 1:1 ──→ SyncOperation (active sync tracking)
```

## Entities

### Profile (Existing — No Schema Change)

Uses the existing `profiles` collection. Xbox-specific usage of existing fields:

| Field | Type | Xbox Usage | Validation |
|---|---|---|---|
| `platform` | enum | `'xbox'` | Required |
| `profileId` | string | XUID (Xbox User ID, numeric string, e.g., `"2584878536129841"`) | Required, unique per platform |
| `displayName` | string | Xbox Gamertag (e.g., `"AvocadoGamer42"`) | Required |
| `credentials.refreshToken` | string | Microsoft OAuth refresh token | Encrypted at rest |
| `credentials.expiresAt` | Date | XSTS token expiry (last known) | Optional |
| `credentials.tokenType` | string | `'xbox'` | Optional |
| `credentials.scopes` | string[] | `['XboxLive.signin', 'XboxLive.offline_access']` | Optional |
| `createdAt` | Date | Auto-generated | Mongoose timestamps |
| `updatedAt` | Date | Auto-generated | Mongoose timestamps |

**Index**: `{ platform: 1, profileId: 1 }` unique (existing)

**Notes**:
- `credentials.accessToken` is NOT stored — XSTS tokens are short-lived and regenerated from refresh token per sync
- Refresh token is encrypted via the existing pre-save hook (AES-256-GCM when `ENCRYPTION_KEY` is set)
- `toJSON()` already strips all credential values from API responses

### Game (Existing — One Field Addition)

Uses the existing `games` collection. **Schema addition**: `devices` field (optional `string[]`) for Xbox console generation filtering. This field is only populated for Xbox games; Steam games leave it undefined.

| Field | Type | Xbox Mapping | Notes |
|---|---|---|---|
| `platform` | enum | `'xbox'` | |
| `profileId` | ObjectId | Reference to Xbox Profile | |
| `gameId` | string | Xbox Title ID (numeric string from `titleId` field) | Platform-specific |
| `title` | string | Game name from title history | |
| `achievementsTotal` | number | `achievement.totalAchievements` from title history | |
| `achievementsUnlocked` | number | `achievement.currentAchievements` from title history | |
| `completionPercent` | number | `achievement.progressPercentage` (or computed) | 0-100 |
| `imagePath` | string | Relative path: `xbox/{titleId}/game_grid.jpg` | Nullable |
| `devices` | string[] | Xbox platform generation(s): `['XboxOne']`, `['XboxSeries']`, `['Xbox360']`, `['PC']`, or combinations | Optional, from title history `devices` field |
| `lastSyncedAt` | Date | Timestamp of last sync | |

**Index**: `{ platform: 1, profileId: 1, gameId: 1 }` unique (existing)

### Achievement (Existing — No Schema Change)

Uses the existing `achievements` collection. Xbox stores the same icon path in both `iconPath` and `iconGrayPath` (single icon, CSS grayscale for locked state). Xbox-specific field mapping:

| Field | Type | Xbox Mapping | Notes |
|---|---|---|---|
| `platform` | enum | `'xbox'` | |
| `profileId` | ObjectId | Reference to Xbox Profile | |
| `gameId` | ObjectId | Reference to Game._id (not titleId) | MongoDB ObjectId |
| `achievementId` | string | Xbox achievement `id` field (string) | Per-game unique |
| `name` | string | `achievement.name` | |
| `description` | string | `achievement.description` | May be `null` for secret achievements |
| `unlockedAt` | Date | `progression.timeUnlocked` (if `progressState === 'Achieved'`) | Nullable |
| `iconPath` | string | Relative path: `xbox/{titleId}/{achievementId}_icon.png` | Nullable |
| `iconGrayPath` | string | Same value as `iconPath` — Xbox provides a single icon per achievement. Frontend applies CSS grayscale filter when rendering locked achievements. | Nullable |

**Index**: `{ platform: 1, profileId: 1, gameId: 1, achievementId: 1 }` unique (existing)

**Notes**:
- Xbox achievements have a single icon URL regardless of lock state (unlike Steam which has separate icon/iconGray)
- Both `iconPath` and `iconGrayPath` store the same file path for Xbox achievements; the frontend applies a CSS grayscale filter when rendering `iconGrayPath` for locked achievements
- This avoids `null` `iconGrayPath` values, keeping the data model consistent with Steam's structure

### SyncOperation (Existing — No Schema Change)

Uses the existing `syncoperations` collection. All fields are platform-agnostic and work for Xbox without modification:

| Field | Xbox Usage |
|---|---|
| `profileId` | Reference to Xbox Profile |
| `platform` | `'xbox'` |
| `status` | `pending → running → completed/failed/cancelled` |
| `totalGames` | Total Xbox games with achievements |
| `gamesCompleted` | Games processed so far |
| `gamesFailed` | Games that failed to sync |
| `totalAchievements` | Total achievements across all games |
| `achievementsSynced` | Achievements processed so far |
| `iconDownloadsPending/Completed/Failed` | Image download tracking |
| `syncErrors[]` | Error messages from Xbox API calls |

### Settings (Existing Collection — New Keys)

Three new settings keys for Xbox OAuth configuration, stored in the existing `settings` collection:

| Key | Encrypted | Default | Description |
|---|---|---|---|
| `xbox_client_id` | No | _(none)_ | Azure AD Application (client) ID |
| `xbox_client_secret` | Yes | _(none)_ | Azure AD Client Secret |
| `xbox_redirect_uri` | No | Auto-detect from request | OAuth callback URL override |

## State Transitions

### Xbox Profile Lifecycle

```
[No Profile] → (OAuth login success) → [Profile Created]
[Profile Created] → (Sync triggered) → [Syncing]
[Syncing] → (Complete) → [Synced]
[Synced] → (Re-sync) → [Syncing]
[Profile Created/Synced] → (Token refresh fails) → [Re-auth Required]
[Re-auth Required] → (User re-authenticates) → [Profile Updated]
[Profile Created/Synced] → (Delete) → [Deleted] (cascade: games, achievements, sync runs, images)
```

### Xbox Token Lifecycle

```
[No Tokens] → (OAuth code exchange) → [Fresh Tokens]
[Fresh Tokens] → (XSTS expires, ~4-16h) → [XSTS Expired]
[XSTS Expired] → (Refresh token valid) → [Tokens Refreshed]
[XSTS Expired] → (Refresh token expired/revoked) → [Re-auth Required]
```

## Data Volume Estimates

| Entity | Typical Volume Per Profile | Storage Impact |
|---|---|---|
| Games | 50-500 titles with achievements | ~50KB |
| Achievements | 10-50 per game → 500-25,000 total | ~2.5MB |
| Game images | 1 per game → 50-500 images (50-200KB each) | 10-100MB disk |
| Achievement icons | 1 per achievement → 500-25,000 icons (5-50KB each) | 10-500MB disk |

## Validation Rules

- `profileId` (XUID): Must be numeric string, 16 digits
- `gameId` (Title ID): Must be numeric string
- `achievementId`: Must be non-empty string
- `completionPercent`: 0-100, computed as `(achievementsUnlocked / achievementsTotal) * 100`
- `credentials.refreshToken`: Must not be empty after successful auth
- `unlockedAt`: Must be valid ISO 8601 date when present
