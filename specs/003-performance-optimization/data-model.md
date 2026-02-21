# Data Model: System Performance Optimization

**Feature**: 003-performance-optimization  
**Date**: 2026-02-19  
**Phase**: Phase 1 - Design

## Overview

This document defines the data model for performance optimization features. It includes new tracking entities for operation progress and modifications to existing entities for performance improvements (indexes, fields). All entities are stored in MongoDB and accessed via Mongoose models.

## New Entities

### 1. SyncOperation

Represents a synchronization job for a profile. Tracks overall progress across all games being synced.

**Collection**: `sync_operations`

**Schema**:
```typescript
interface ISyncOperation {
  _id: ObjectId;
  profileId: ObjectId;              // Reference to Profile
  platform: 'steam' | 'xbox' | 'playstation';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  totalGames: number;               // Total games to sync
  gamesCompleted: number;           // Games fully synced
  gamesFailed: number;              // Games that encountered errors
  totalAchievements: number;        // Expected total achievements
  achievementsSynced: number;       // Achievements successfully synced
  iconDownloadsPending: number;     // Icon downloads queued
  iconDownloadsCompleted: number;   // Icon downloads finished
  iconDownloadsFailed: number;      // Icon downloads that failed
  errors: Array<{
    gameId: string;
    message: string;
    timestamp: Date;
  }>;
  adaptiveParams: {                 // Current adaptive algorithm state
    batchSize: number;
    concurrency: number;
    delay: number;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:
- `{ profileId: 1, createdAt: -1 }` - Query recent syncs for a profile
- `{ status: 1, startedAt: 1 }` - Find running/stuck operations

**Relationships**:
- BelongsTo: Profile (profileId)
- HasMany: GameSyncStatus (syncOperationId)

**Operations**:
- Create when sync starts
- Update progress fields as sync proceeds
- Mark completed/failed when finished
- Query for progress status polling

---

### 2. GameSyncStatus

Tracks sync status for an individual game within a sync operation. Provides granular progress for UI display.

**Collection**: `game_sync_statuses`

**Schema**:
```typescript
interface IGameSyncStatus {
  _id: ObjectId;
  syncOperationId: ObjectId;        // Reference to SyncOperation
  profileId: ObjectId;              // Reference to Profile
  gameId: string;                   // Platform-specific game identifier
  gameName: string;                 // Display name
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  totalAchievements: number;        // Total achievements for this game
  achievementsSynced: number;       // Achievements processed
  iconsDownloaded: number;          // Icon downloads completed
  iconsFailed: number;              // Icon downloads that failed
  startedAt?: Date;
  completedAt?: Date;
  error?: string;                   // Error message if failed
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:
- `{ syncOperationId: 1, status: 1 }` - Query games by sync operation
- `{ profileId: 1, gameId: 1 }` - Find game status for specific profile

**Relationships**:
- BelongsTo: SyncOperation (syncOperationId)
- BelongsTo: Profile (profileId)

**Operations**:
- Create batch records when sync starts
- Update as achievements and icons are processed
- Query for real-time UI updates

---

### 3. BackupJob

Represents a backup creation operation. Tracks preparation, compression, and download readiness.

**Collection**: `backup_jobs`

**Schema**:
```typescript
interface IBackupJob {
  _id: ObjectId;
  status: 'preparing' | 'compressing' | 'ready' | 'failed' | 'expired';
  initiatedBy?: string;             // User identifier (optional)
  totalCollections: number;         // Collections to backup
  collectionsProcessed: number;     // Collections backed up
  totalRecords: number;             // Total records across all collections
  recordsProcessed: number;         // Records written to backup
  fileSize: number;                 // Backup file size in bytes
  filePath: string;                 // Backup file location
  collections: string[];            // List of collection names included
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;                  // Auto-cleanup timestamp
  error?: string;
}
```

**Indexes**:
- `{ status: 1, createdAt: -1 }` - Find recent backups
- `{ expiresAt: 1 }` - TTL index for automatic cleanup

**Relationships**:
- None (standalone operation)

**Operations**:
- Create when backup initiated
- Update progress during collection export
- Mark ready when file is prepared
- Auto-expire after 24 hours

---

### 4. RestoreJob

Represents a backup restore operation. Tracks upload, extraction, and database restoration progress.

**Collection**: `restore_jobs`

**Schema**:
```typescript
interface IRestoreJob {
  _id: ObjectId;
  status: 'uploading' | 'extracting' | 'validating' | 'restoring' | 'completed' | 'failed';
  initiatedBy?: string;             // User identifier (optional)
  uploadedFileSize: number;         // Size of uploaded backup file
  totalCollections: number;         // Collections in backup
  collectionsRestored: number;      // Collections imported
  totalRecords: number;             // Total records in backup
  recordsRestored: number;          // Records inserted to database
  imagesRestored: number;           // Image files copied
  mode: 'merge' | 'replace';        // Restore strategy
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  warnings: Array<{
    message: string;
    timestamp: Date;
  }>;
}
```

**Indexes**:
- `{ status: 1, createdAt: -1 }` - Find recent restores
- `{ createdAt: 1 }` - Cleanup old restore records

**Relationships**:
- None (standalone operation)

**Operations**:
- Create when restore initiated
- Update during file processing phases
- Track warnings (e.g., duplicate records skipped)
- Mark completed/failed when finished

---

### 5. ProgressUpdate (Transient)

Generic entity for real-time progress updates. Not persisted to database - exists only cached in-memory for polling.

**Storage**: In-memory (progressService)

**Structure**:
```typescript
interface IProgressUpdate {
  operationId: string;              // SyncOperation._id | BackupJob._id | RestoreJob._id
  operationType: 'sync' | 'backup' | 'restore';
  status: string;                   // Current operation status
  progress: {
    current: number;                // Items processed
    total: number;                  // Total items
    percentage: number;             // Calculated percentage (0-100)
  };
  currentStep: string;              // Human-readable current activity
  estimatedTimeRemaining?: number;  // Seconds (calculated from rate)
  message?: string;                 // Additional context
  timestamp: Date;
}
```

**Operations**:
- Created in-memory during operations
- Retrieved via status endpoints when polled
- Not persisted (ephemeral)

---

## Modified Entities

### Achievement (Existing)

**Changes**: Add compound index for query optimization

**Current Schema** (no changes):
```typescript
interface IAchievement {
  _id: ObjectId;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: ObjectId;
  gameId: string;
  achievementId: string;
  name: string;
  description: string;
  iconPath: string;
  iconGrayPath?: string;
  unlockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**New Indexes**:
```typescript
// Primary compound index (eliminates COLLSCAN)
{ profileId: 1, gameId: 1, achievementId: 1 }
  name: 'idx_achievements_profile_game_achievement'

// Secondary index for game queries
{ profileId: 1, gameId: 1 }
  name: 'idx_achievements_profile_game'
```

**Rationale**: Addresses slow query in logs showing COLLSCAN across 26,790 documents. Compound index enables sub-10ms lookups for findAndModify operations on `{gameId, achievementId}` with profile context.

---

### Game (Existing)

**Changes**: Add index for sync operations

**Current Schema** (no changes):
```typescript
interface IGame {
  _id: ObjectId;
  platform: 'steam' | 'xbox' | 'playstation';
  profileId: ObjectId;
  gameId: string;
  name: string;
  imagePath?: string;
  achievementsTotal: number;
  achievementsUnlocked: number;
  completionPercentage: number;
  lastPlayedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

**New Indexes**:
```typescript
// Index for sync queries
{ profileId: 1, platform: 1 }
  name: 'idx_games_profile_platform'
```

**Rationale**: Sync operations query games by profile and platform. Index improves query performance when loading game lists for batch processing.

---

### Setting (Existing)

**Changes**: Ensure unique index on key field

**Current Schema** (no changes):
```typescript
interface ISetting {
  _id: ObjectId;
  key: string;
  value: string;                    // Encrypted for secrets
  encrypted: boolean;
  category: string;
  updatedAt: Date;
}
```

**Verified Index**:
```typescript
{ key: 1 }
  name: 'idx_settings_key'
  unique: true
```

**Rationale**: Settings are queried frequently by key. Unique index ensures fast lookups and prevents duplicate keys.

---

## Entity Relationships Diagram

```
┌─────────────┐
│   Profile   │
└──────┬──────┘
       │ 1
       │
       │ *
┌──────┴───────────┐
│  SyncOperation   │ 1      * ┌─────────────────┐
│                  ├─────────→│ GameSyncStatus  │
│ - status         │          │                 │
│ - totalGames     │          │ - gameId        │
│ - gamesComplete  │          │ - status        │
│ - adaptiveParams │          │ - achievements  │
└──────────────────┘          └─────────────────┘
       │
       │ References
       ↓
┌──────────────┐     Uses
│  Achievement ├────────────┐
│              │            │
│ - gameId     │    ┌───────┴────────┐
│ - profileId  │    │ Indexes:       │
│ [INDEXED]    │    │ (profileId,    │
└──────────────┘    │  gameId,       │
                    │  achievementId)│
                    └────────────────┘

┌─────────────┐
│  BackupJob  │       Standalone
│             │       (No relationships)
│ - status    │
│ - progress  │
└─────────────┘

┌─────────────┐
│ RestoreJob  │       Standalone
│             │       (No relationships)
│ - status    │
│ - progress  │
└─────────────┘
```

## Data Flow

### Sync Operation Flow:
1. User triggers sync → Create `SyncOperation` record
2. For each game → Create `GameSyncStatus` record (status: 'pending')
3. Process games in adaptive batches:
   - Update `GameSyncStatus` (status: 'syncing', achievementsSynced++)
   - Find/update `Achievement` records (uses new compound index)
   - Update `SyncOperation` aggregate counts
   - Update progress state in progressService for polling
4. Complete → Update `SyncOperation` (status: 'completed')

### Backup Operation Flow:
1. User initiates backup → Create `BackupJob` (status: 'preparing')
2. Export collections → Update `BackupJob` (collectionsProcessed++, recordsProcessed++)
3. Compress file → Update `BackupJob` (status: 'compressing', fileSize)
4. Ready → Update `BackupJob` (status: 'ready')
5. User downloads file
6. Auto-expire after 24 hours (TTL index)

### Restore Operation Flow:
1. User uploads file → Create `RestoreJob` (status: 'uploading')
2. Extract and validate → Update `RestoreJob` (status: 'extracting', 'validating')
3. Import to database → Update `RestoreJob` (status: 'restoring', recordsRestored++)
4. Complete → Update `RestoreJob` (status: 'completed')

## Migration Scripts

### 1. Create Indexes on Achievements
```typescript
// backend/src/migrations/add-achievement-indexes.ts
import { Achievement } from '../models/achievement.js';
import { logger } from '../utils/logger.js';

export async function createAchievementIndexes() {
  logger.info('Creating compound indexes on achievements collection');
  
  try {
    // Primary compound index
    await Achievement.collection.createIndex(
      { profileId: 1, gameId: 1, achievementId: 1 },
      { 
        background: true,
        name: 'idx_achievements_profile_game_achievement' 
      }
    );
    
    // Secondary index for game queries
    await Achievement.collection.createIndex(
      { profileId: 1, gameId: 1 },
      { 
        background: true,
        name: 'idx_achievements_profile_game' 
      }
    );
    
    logger.info('Achievement indexes created successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to create achievement indexes');
    throw error;
  }
}
```

### 2. Create Indexes on Games
```typescript
// backend/src/migrations/add-game-indexes.ts
import { Game } from '../models/game.js';
import { logger } from '../utils/logger.js';

export async function createGameIndexes() {
  logger.info('Creating index on games collection');
  
  try {
    await Game.collection.createIndex(
      { profileId: 1, platform: 1 },
      {
        background: true,
        name: 'idx_games_profile_platform'
      }
    );
    
    logger.info('Game indexes created successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to create game indexes');
    throw error;
  }
}
```

## Performance Considerations

### Storage Impact:
- **SyncOperation**: ~500 bytes per record, retention: 30 days, estimated: 50MB/year
- **GameSyncStatus**: ~300 bytes per record, retention: 30 days, estimated: 200MB/year
- **BackupJob**: ~200 bytes per record, auto-expire: 24 hours, minimal storage
- **RestoreJob**: ~200 bytes per record, retention: 30 days, minimal storage
- **Achievement Indexes**: ~2-5MB for 50,000 records (one-time cost)
- **Game Indexes**: ~500KB for 100,000 records (one-time cost)

**Total Additional Storage**: <300MB/year + 5MB indexes = Negligible impact

### Query Performance:
- Achievement queries: 498ms → <10ms (50x improvement)
- Game list queries: 100ms → <5ms (20x improvement)
- Sync operation tracking: New capability (real-time progress)
- Backup/restore queries: New capability (progress tracking)

### Write Performance:
- Minimal impact: SyncOperation/GameSyncStatus updated once per batch
- Indexes add <1ms overhead per achievement write (one-time per achievement)
- BackupJob/RestoreJob updated every 2 seconds (low frequency)

## Cleanup and Maintenance

### Auto-Cleanup Policies:
- **SyncOperation**: Delete records older than 30 days
- **GameSyncStatus**: Delete when parent SyncOperation is deleted (cascade)
- **BackupJob**: Auto-expire via TTL index (expiresAt field, 24 hours)
- **RestoreJob**: Delete records older than 30 days

### Implementation:
```typescript
// Scheduled cleanup job (runs daily)
async function cleanupOldOperations() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  // Clean sync operations
  const deletedSyncs = await SyncOperation.deleteMany({
    createdAt: { $lt: thirtyDaysAgo }
  });
  
  // Clean game sync statuses (cascade)
  await GameSyncStatus.deleteMany({
    syncOperationId: { $in: deletedSyncs.deletedIds }
  });
  
  // Clean restore jobs
  await RestoreJob.deleteMany({
    createdAt: { $lt: thirtyDaysAgo }
  });
  
  // BackupJob auto-expires via TTL index
}
```

## Validation Rules

### SyncOperation:
- `totalGames >= gamesCompleted + gamesFailed`
- `achievementsSynced <= totalAchievements`
- `iconDownloadsCompleted + iconDownloadsFailed <= iconDownloadsPending`
- `completedAt > startedAt` when status is 'completed'

### BackupJob:
- `recordsProcessed <= totalRecords`
- `collectionsProcessed <= totalCollections`
- `expiresAt > createdAt` (must be in future)

### RestoreJob:
- `recordsRestored <= totalRecords`
- `collectionsRestored <= totalCollections`
- `mode` must be 'merge' or 'replace'

## Conclusion

The data model provides:
1. **Comprehensive Progress Tracking**: SyncOperation, BackupJob, RestoreJob entities
2. **Granular Visibility**: GameSyncStatus for per-game progress
3. **Performance Optimization**: Compound indexes eliminate COLLSCAN
4. **Backwards Compatibility**: No breaking changes to existing entities
5. **Observability**: Structured data for metrics and monitoring
6. **Efficient Storage**: Automatic cleanup prevents unbounded growth

All entities are designed for MongoDB/Mongoose and integrate seamlessly with existing models. Ready for contract definition (API schemas) in next phase.
