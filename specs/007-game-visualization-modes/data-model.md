# Data Model: Game Visualization Modes & Image Management

**Feature**: `007-game-visualization-modes` | **Date**: 2026-03-30

## Entity Changes

### Game (Modified)

**Collection**: `games`

#### Current Fields (unchanged)
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| platform | `'steam' \| 'xbox' \| 'playstation'` | Yes | Gaming platform |
| profileId | `ObjectId` | Yes | Reference to profiles collection |
| gameId | `string` | Yes | Platform-specific game identifier |
| title | `string` | Yes | Game title (synced from platform) |
| achievementsTotal | `number` | Yes | Total achievements count |
| achievementsUnlocked | `number` | Yes | Unlocked achievements count |
| completionPercent | `number` | Yes | Completion percentage (0-100) |
| devices | `string[]` | No | Xbox: device types |
| currentGamerscore | `number` | No | Xbox: current gamerscore |
| maxGamerscore | `number` | No | Xbox: max possible gamerscore |
| lastPlayed | `Date` | No | Xbox: last played timestamp |
| playTimeMinutes | `number` | No | Xbox: play time |
| ownershipSource | `'owned' \| 'played_history'` | No | Ownership type |
| achievementsFetchFailed | `boolean` | No | Achievement fetch failure flag |
| trophyBronze | `number \| null` | No | PlayStation: bronze trophy count |
| trophySilver | `number \| null` | No | PlayStation: silver trophy count |
| trophyGold | `number \| null` | No | PlayStation: gold trophy count |
| trophyPlatinum | `number \| null` | No | PlayStation: platinum trophy count |
| lastSyncedAt | `Date` | Yes | Last sync timestamp |

#### New Fields
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| capsuleImagePath | `string` | No | `undefined` | Path to 600×900 capsule/grid image (replaces `imagePath`) |
| iconImagePath | `string` | No | `undefined` | Path to 64×64 icon image |
| heroImagePath | `string` | No | `undefined` | Path to 1920×620 hero banner image |
| customTitle | `string` | No | `undefined` | User-overridden display title. When set, takes precedence over `title` in UI. |

#### Removed Fields
| Field | Migration |
|-------|-----------|
| imagePath | Renamed to `capsuleImagePath` via `$rename` operation |

#### Indexes (unchanged)
| Fields | Type | Name |
|--------|------|------|
| `platform + profileId + gameId` | Unique compound | (default) |
| `completionPercent` | Single | (default) |
| `profileId + platform` | Compound | `idx_games_profile_platform` |

No new indexes required. The `search` query uses `$regex` on `title` which is acceptable for the expected dataset size (hundreds per user).

### ImageType (Extended)

The `ImageType` union in `imageStorage.ts` gains `'hero'` as a recognized game image type:

**Current**: `'icon' | 'iconGray' | 'grid' | 'header' | 'capsule'`  
**New**: `'icon' | 'iconGray' | 'grid' | 'header' | 'capsule' | 'hero'`

Note: `'hero'` is added for game hero images. `'icon'` already exists but was only used for achievement icons — it now also applies to game-level icons.

### Resize Dimensions by ImageType

| ImageType | Target Dimensions | Format | Quality | Fit Mode |
|-----------|-------------------|--------|---------|----------|
| `grid` | 600×900 | JPEG | 90 | cover, centre |
| `hero` | 1920×620 | JPEG | 90 | cover, centre |
| `icon` (game) | 64×64 | JPEG | 90 | cover, centre |
| `icon` (Xbox achievement) | 512×512 | WebP | 85 | cover, centre |
| `iconGray` | (no resize) | as-is | — | — |

## Migration Plan

### Migration 007: game-image-fields

**Operation**: Rename field + schema update

```javascript
// Step 1: Rename imagePath → capsuleImagePath for all documents
db.games.updateMany(
  { imagePath: { $exists: true } },
  { $rename: { imagePath: 'capsuleImagePath' } }
);

// Step 2: Verify migration
const remaining = db.games.countDocuments({ imagePath: { $exists: true } });
assert(remaining === 0, 'Migration incomplete: imagePath still exists');
```

**Rollback**:
```javascript
db.games.updateMany(
  { capsuleImagePath: { $exists: true } },
  { $rename: { capsuleImagePath: 'imagePath' } }
);
```

**Risk**: Low — `$rename` is atomic per document. No data loss.

## File Storage Structure

```
/app/data/images/
├── steam/
│   └── {appId}/
│       ├── game_grid.jpg          # 600×900 capsule (existing)
│       ├── game_icon.jpg          # 64×64 icon (new)
│       ├── game_hero.jpg          # 1920×620 hero (new)
│       ├── {achievementId}_icon.{ext}    # Achievement icons (unchanged)
│       └── {achievementId}_iconGray.{ext} # Achievement gray icons (unchanged)
├── xbox/
│   └── {titleId}/
│       ├── game_grid.jpg          # 600×900 capsule (existing)
│       ├── game_icon.jpg          # 64×64 icon (new)
│       ├── game_hero.jpg          # 1920×620 hero (new)
│       └── {achievementId}_icon.webp     # Achievement icons (unchanged)
└── playstation/
    └── {npCommunicationId}/
        ├── game_grid.jpg          # 600×900 capsule (existing)
        ├── game_icon.jpg          # 64×64 icon (new)
        ├── game_hero.jpg          # 1920×620 hero (new)
        └── {trophyId}_icon.{ext}         # Trophy icons (unchanged)
```

## State Transitions

### Image Download State per Game

```
[No Images] → [Capsule Only] → [Capsule + Icon] → [All Three]
                    ↑                                    ↑
              (existing games)                    (after full sync)
```

Each image type is independent — failure to download one does not affect others. The UI uses placeholders for any missing image type.

### Custom Title Override

```
[Synced Title] → User edits → [Custom Title Set]
[Custom Title Set] → Re-sync → [Custom Title Preserved] (customTitle field not overwritten)
[Custom Title Set] → User clears → [Synced Title Restored] (customTitle set to null)
```
