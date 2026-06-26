# Data Model: PlayStation Integration

**Feature**: 006-playstation-integration
**Date**: 2026-03-26
**Purpose**: Define schema changes and entity relationships for PlayStation trophy integration.

---

## Schema Changes Overview

No new collections are created. All PlayStation data fits into existing collections with targeted field additions.

---

## 1. Achievement Model — Field Extensions

**File**: `backend/src/models/achievement.ts`

### New Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `trophyGrade` | `String` enum | No | `null` | Trophy grade: `'bronze'`, `'silver'`, `'gold'`, `'platinum'`. `null` for non-PlayStation platforms. |
| `isHidden` | `Boolean` | No | `false` | Whether the trophy is a hidden/secret trophy. Used for display logic. |

### Schema Addition

```typescript
// Added to existing achievement schema
trophyGrade: {
  type: String,
  enum: ['bronze', 'silver', 'gold', 'platinum', null],
  default: null,
},
isHidden: {
  type: Boolean,
  default: false,
},
```

### Impact on Existing Data
- **Steam/Xbox achievements**: Both new fields default to `null`/`false` — no migration needed, no behavioral change.
- **Indexes**: No new indexes required. Existing `(platform, profileId, gameId, achievementId)` unique index covers PlayStation.
- **API responses**: New fields included in achievement query responses; frontend ignores them for non-PlayStation platforms.

---

## 2. Game Model — Field Extensions

**File**: `backend/src/models/game.ts`

### New Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `trophyBronze` | `Number` | No | `null` | Count of earned bronze trophies for this game. PlayStation only. |
| `trophySilver` | `Number` | No | `null` | Count of earned silver trophies for this game. PlayStation only. |
| `trophyGold` | `Number` | No | `null` | Count of earned gold trophies for this game. PlayStation only. |
| `trophyPlatinum` | `Number` | No | `null` | Count of earned platinum trophies for this game (0 or 1). PlayStation only. |

### Schema Addition

```typescript
// Added to existing game schema
trophyBronze: { type: Number, default: null },
trophySilver: { type: Number, default: null },
trophyGold: { type: Number, default: null },
trophyPlatinum: { type: Number, default: null },
```

### Existing Fields Reused for PlayStation

| Field | Existing Usage | PlayStation Usage |
|-------|---------------|-------------------|
| `platform` | `'steam' \| 'xbox' \| 'playstation'` | `'playstation'` |
| `profileId` | Reference to Profile | Reference to PlayStation Profile |
| `gameId` | Platform-specific ID | `npCommunicationId` from PSN API |
| `title` | Game name | `trophyTitleName` from PSN API |
| `achievementsTotal` | Total achievements | Total trophies (sum of all grades) |
| `achievementsUnlocked` | Earned count | Earned trophies (sum of earned grades) |
| `completionPercent` | 0-100 | `progress` field from PSN API |
| `imagePath` | Local image path | PlayStation CDN image, stored locally |
| `devices` | `['Xbox360', 'XboxOne', ...]` | `['PS3', 'PS4', 'PS5', 'PSVita']` |
| `lastPlayed` | Last interaction date | `lastUpdatedDateTime` (last trophy earned) |
| `playTimeMinutes` | Play time | `null` (not available from PSN trophy API) |

### Impact on Existing Data
- **Steam/Xbox games**: All new trophy fields default to `null` — no migration needed.
- **Indexes**: No new indexes required. Existing `(platform, profileId, gameId)` unique index covers PlayStation.

---

## 3. Profile Model — No Schema Changes

**File**: `backend/src/models/profile.ts`

The existing Profile model already supports PlayStation:

| Field | Usage for PlayStation |
|-------|---------------------|
| `platform` | `'playstation'` |
| `profileId` | PSN Account ID |
| `displayName` | PSN Online ID |
| `credentials.accessToken` | PSN OAuth access token (encrypted) |
| `credentials.refreshToken` | PSN OAuth refresh token (encrypted) |
| `credentials.expiresAt` | Access token expiry timestamp |
| `credentials.tokenType` | `'Bearer'` |

No new fields needed. The NPSSO token is NOT stored — it's exchanged for OAuth tokens during profile creation, then discarded.

---

## 4. SyncOperation Model — No Schema Changes

**File**: `backend/src/models/syncOperation.ts`

The existing SyncOperation model is fully platform-generic. All fields work for PlayStation:

| Field | PlayStation Usage |
|-------|------------------|
| `platform` | `'playstation'` |
| `totalGames` | Number of games with ≥1 earned trophy |
| `gamesProcessed` | Games fully processed |
| `totalAchievements` | Total trophies across all games |
| `achievementsSynced` | Trophies synced to DB |
| `iconDownloadsPending/Completed/Failed` | Trophy icon download tracking |

---

## 5. Entity Relationships

```
Profile (platform='playstation')
  │
  ├──< Game (platform='playstation', profileId=profile._id)
  │     │  - gameId = npCommunicationId
  │     │  - trophyBronze, trophySilver, trophyGold, trophyPlatinum
  │     │  - devices = ['PS4'] or ['PS5'] etc.
  │     │
  │     └──< Achievement (platform='playstation', gameId=game._id)
  │           - achievementId = trophyId (string)
  │           - trophyGrade = 'bronze' | 'silver' | 'gold' | 'platinum'
  │           - isHidden = true/false
  │           - iconPath = local path to trophy icon
  │
  ├──< SyncOperation (platform='playstation', profileId=profile._id)
  │     - tracks sync progress
  │
  └──< SyncRun (platform='playstation', profileId=profile._id)
        - completion audit log
```

---

## 6. Trophy Summary Aggregation Query

The PlayStation page trophy summary is computed via a MongoDB aggregation on the `games` collection:

```typescript
// Aggregation pipeline for profile trophy summary
const result = await Game.aggregate([
  { $match: { profileId: profileObjectId, platform: 'playstation' } },
  { $group: {
    _id: null,
    totalBronze: { $sum: '$trophyBronze' },
    totalSilver: { $sum: '$trophySilver' },
    totalGold: { $sum: '$trophyGold' },
    totalPlatinum: { $sum: '$trophyPlatinum' },
    totalGames: { $sum: 1 },
  }},
]);
```

This runs on indexed data and returns in <10ms for typical libraries.

---

## 7. Validation Rules

### Profile Creation
- `platform` must be `'playstation'`
- `profileId` must be a valid PSN Account ID (numeric string)
- NPSSO token validated by attempting OAuth exchange — if exchange fails, profile is not created

### Game Upsert
- `gameId` = `npCommunicationId` (string, max ~36 chars)
- `trophyBronze/Silver/Gold/Platinum` must be non-negative integers or null
- `achievementsTotal` = sum of all defined trophies (bronze + silver + gold + platinum)
- `achievementsUnlocked` = sum of all earned trophies
- `completionPercent` = `progress` from API (0-100, integer)

### Achievement (Trophy) Upsert
- `achievementId` = `trophyId` (numeric, stored as string for consistency)
- `trophyGrade` must be one of `['bronze', 'silver', 'gold', 'platinum']`
- `isHidden` defaults to `false`
- `unlockedAt` = `earnedDateTime` from PSN API (ISO 8601 → Date)

---

## 8. State Transitions

### Profile Credential Lifecycle
```
[No Profile] → NPSSO provided → OAuth exchange → [Active Profile]
                                    ↓ (failure)
                              [Error: Invalid NPSSO]

[Active Profile] → Access token expires → Auto-refresh via refresh token → [Active Profile]
                                              ↓ (refresh token expired)
                                         [Needs Re-auth] → User provides new NPSSO → [Active Profile]
```

### Sync Operation Lifecycle
```
[No Sync] → User triggers sync → [Pending] → [Running] → [Completed]
                                                ↓ (error)     ↓ (cancel)
                                             [Failed]      [Cancelled]
```
Same as existing Steam/Xbox sync lifecycle. No PlayStation-specific states.
