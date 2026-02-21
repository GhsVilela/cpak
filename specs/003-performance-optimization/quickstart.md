# Quickstart: System Performance Optimization

**Feature**: 003-performance-optimization  
**Branch**: `003-performance-optimization`  
**Target Audience**: Developers implementing this feature

## Overview

This guide provides step-by-step instructions for implementing performance optimizations across achievement sync, backup/restore, and real-time progress tracking. Implementation is designed to be incremental with backwards compatibility at each step.

---

## Prerequisites

Before starting implementation:

1. **Environment Setup**:
   ```bash
   # Ensure you're on the feature branch
   git checkout 003-performance-optimization
   
   # Install dependencies (if not already)
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Local MongoDB**: Ensure MongoDB is running locally or via Docker:
   ```bash
   docker run -d -p 27017:27017 --name cpak-mongo mongo:8
   ```

---

## Implementation Phases

### Phase 1: Database Indexes (30 minutes)

**Goal**: Eliminate COLLSCAN queries causing 500ms+ response times.

#### Step 1.1: Create Index Migration Scripts

Create `backend/src/migrations/add-achievement-indexes.ts`:
```typescript
import { Achievement } from '../models/achievement.js';
import { Game } from '../models/game.js';
import { logger } from '../utils/logger.js';

export async function migrateAchievementIndexes() {
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
    // Index may already exist - log but don't fail
    if (error.code === 85 || error.code === 86) {
      logger.info('Achievement indexes already exist, skipping');
    } else {
      logger.error({ error }, 'Failed to create achievement indexes');
      throw error;
    }
  }
  
  // Game indexes
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
    if (error.code === 85 || error.code === 86) {
      logger.info('Game indexes already exist, skipping');
    } else {
      logger.error({ error }, 'Failed to create game indexes');
      throw error;
    }
  }
}
```

#### Step 1.2: Run Migration on Startup

Modify `backend/src/api/server.ts`:
```typescript
import { migrateAchievementIndexes } from '../migrations/add-achievement-indexes.js';

// After MongoDB connection established
await migrateAchievementIndexes();
logger.info('Database migrations completed');
```

#### Step 1.3: Verify Index Usage

```typescript
// Add to test file or run in MongoDB shell
const explainResult = await Achievement.collection
  .find({ profileId: 'some-id', gameId: 'game-123', achievementId: 'ach-456' })
  .explain('executionStats');

console.log('Query plan:', explainResult.queryPlanner.winningPlan);
// Should show: { stage: 'IXSCAN', indexName: 'idx_achievements_profile_game_achievement' }
// NOT: { stage: 'COLLSCAN' }
```

**Expected Outcome**: Achievement queries drop from 498ms to <10ms.

---

### Phase 2: Adaptive Batching & Throttling (2-3 hours)

**Goal**: Maintain API responsiveness during large sync operations while respecting user settings.

#### Step 2.1: Create Performance Monitor Service

Create `backend/src/services/performanceMonitor.ts`:
```typescript
import { logger } from '../utils/logger.js';

export class PerformanceMonitor {
  private readonly thresholds = {
    dbQuery: 500,      // ms
    apiResponse: 2000, // ms
    batchOperation: 5000 // ms
  };
  
  async measureDbQuery<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      if (duration > this.thresholds.dbQuery) {
        logger.warn({
          type: 'slow_query',
          operation,
          duration,
          threshold: this.thresholds.dbQuery
        });
      }
      
      return result;
    } catch (error) {
      logger.error({ type: 'query_error', operation, error });
      throw error;
    }
  }
  
  async measureApiCall<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      if (duration > this.thresholds.apiResponse) {
        logger.warn({
          type: 'slow_api_call',
          operation,
          duration,
          threshold: this.thresholds.apiResponse
        });
      }
      
      return result;
    } catch (error) {
      logger.error({ type: 'api_error', operation, error });
      throw error;
    }
  }
}
```

#### Step 2.2: Create Adaptive Batch Controller

Create `backend/src/services/adaptiveBatchController.ts`:
```typescript
export class AdaptiveBatchController {
  private currentBatchSize: number;
  private readonly minBatchSize = 5;
  private readonly maxBatchSize: number;
  private readonly targetResponseTime = 500; // ms
  private recentResponseTimes: number[] = [];
  
  constructor(userConfiguredMax: number) {
    this.maxBatchSize = userConfiguredMax;
    this.currentBatchSize = userConfiguredMax;
  }
  
  adjustBatchSize(responseTime: number): void {
    this.recentResponseTimes.push(responseTime);
    if (this.recentResponseTimes.length > 5) {
      this.recentResponseTimes.shift();
    }
    
    const avgResponseTime = this.recentResponseTimes.reduce((a, b) => a + b, 0) / this.recentResponseTimes.length;
    
    if (avgResponseTime > this.targetResponseTime * 1.5) {
      const oldSize = this.currentBatchSize;
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize * 0.8)
      );
      if (oldSize !== this.currentBatchSize) {
        logger.info({ 
          type: 'adaptive_batch_reduced', 
          from: oldSize, 
          to: this.currentBatchSize,
          avgResponseTime 
        });
      }
    } else if (avgResponseTime < this.targetResponseTime * 0.5 && this.currentBatchSize < this.maxBatchSize) {
      const oldSize = this.currentBatchSize;
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.1)
      );
      if (oldSize !== this.currentBatchSize) {
        logger.info({ 
          type: 'adaptive_batch_increased', 
          from: oldSize, 
          to: this.currentBatchSize,
          avgResponseTime 
        });
      }
    }
  }
  
  getBatchSize(): number {
    return this.currentBatchSize;
  }
}
```

#### Step 2.3: Create Adaptive Throttler

Create `backend/src/services/adaptiveThrottler.ts`:
```typescript
import { logger } from '../utils/logger.js';

export class AdaptiveThrottler {
  private currentDelay: number = 250; // Start at 250ms
  private readonly minDelay = 250;
  private readonly maxDelay = 2000;
  private readonly targetResponseTime = 500;
  
  async throttle(lastBatchResponseTime: number): Promise<void> {
    const oldDelay = this.currentDelay;
    
    if (lastBatchResponseTime > this.targetResponseTime * 2) {
      this.currentDelay = Math.min(
        this.maxDelay,
        Math.floor(this.currentDelay * 1.5)
      );
    } else if (lastBatchResponseTime < this.targetResponseTime * 0.5) {
      this.currentDelay = Math.max(
        this.minDelay,
        this.currentDelay - 50
      );
    }
    
    if (oldDelay !== this.currentDelay) {
      logger.info({ 
        type: 'adaptive_delay_adjusted', 
        from: oldDelay, 
        to: this.currentDelay,
        lastBatchTime: lastBatchResponseTime 
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, this.currentDelay));
  }
  
  getCurrentDelay(): number {
    return this.currentDelay;
  }
}
```

#### Step 2.4: Integrate into Sync Service

Modify `backend/src/services/adapters/steam.ts`:
```typescript
import { AdaptiveBatchController } from '../adaptiveBatchController.js';
import { AdaptiveThrottler } from '../adaptiveThrottler.js';
import { PerformanceMonitor } from '../performanceMonitor.js';
import { configService } from '../configService.js';

export class SteamAdapter {
  private performanceMonitor = new PerformanceMonitor();
  
  async syncProfile(profileId: string): Promise<void> {
    // Get user-configured batch size
    const userBatchSize = parseInt(await configService.getSetting('sync_batch_size') || '10', 10);
    
    // Initialize adaptive controllers with user's setting as maximum
    const batchController = new AdaptiveBatchController(userBatchSize);
    const throttler = new AdaptiveThrottler();
    
    const games = await this.fetchGames(profileId);
    
    let i = 0;
    while (i < games.length) {
      const currentBatchSize = batchController.getBatchSize();
      const batch = games.slice(i, i + currentBatchSize);
      
      // Measure batch processing time
      const batchStart = Date.now();
      await this.processBatch(batch, profileId);
      const batchDuration = Date.now() - batchStart;
      
      // Adjust batch size based on performance
      batchController.adjustBatchSize(batchDuration);
      
      i+= currentBatchSize;
      
      // Adaptive delay before next batch (unless last batch)
      if (i < games.length) {
        await throttler.throttle(batchDuration);
      }
    }
  }
  
  private async processBatch(games: Game[], profileId: string): Promise<void> {
    for (const game of games) {
      await this.performanceMonitor.measureDbQuery(
        'syncGameAchievements',
        () => this.syncGameAchievements(game, profileId)
      );
    }
  }
}
```

**Expected Outcome**: System automatically reduces batch size/increases delay when response times degrade, maintains <2s API response.

---

### Phase 3: Adaptive Concurrency Control (1-2 hours)

**Goal**: Prevent icon download overload while respecting user settings.

#### Step 3.1: Create Adaptive Concurrency Controller

Create `backend/src/services/adaptiveConcurrencyController.ts`:
```typescript
import pLimit from 'p-limit';
import { logger } from '../utils/logger.js';

export class AdaptiveConcurrencyController {
  private userConfiguredLimit: number;
  private currentLimit: number;
  private limiter: any;
  private readonly minLimit = 2;
  private apiResponseTimes: number[] = [];
  
  constructor(userLimit: number) {
    this.userConfiguredLimit = userLimit;
    this.currentLimit = userLimit;
    this.limiter = pLimit(userLimit);
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await this.limiter(fn);
    const duration = Date.now() - start;
    
    this.apiResponseTimes.push(duration);
    if (this.apiResponseTimes.length > 10) {
      this.apiResponseTimes.shift();
    }
    
    this.adjustConcurrency();
    return result;
  }
  
  private adjustConcurrency(): void {
    if (this.apiResponseTimes.length < 5) return;
    
    const avgResponseTime = this.apiResponseTimes.reduce((a, b) => a + b, 0) / this.apiResponseTimes.length;
    
    if (avgResponseTime > 2000 && this.currentLimit > this.minLimit) {
      const oldLimit = this.currentLimit;
      this.currentLimit = Math.max(this.minLimit, this.currentLimit - 1);
      this.limiter = pLimit(this.currentLimit);
      logger.info({ 
        type: 'adaptive_concurrency_reduced', 
        from: oldLimit, 
        to: this.currentLimit,
        avgResponseTime 
      });
    } else if (avgResponseTime < 500 && this.currentLimit < this.userConfiguredLimit) {
      const oldLimit = this.currentLimit;
      this.currentLimit = Math.min(this.userConfiguredLimit, this.currentLimit + 1);
      this.limiter = pLimit(this.currentLimit);
      logger.info({ 
        type: 'adaptive_concurrency_increased', 
        from: oldLimit, 
        to: this.currentLimit,
        avgResponseTime 
      });
    }
  }
  
  getCurrentLimit(): number {
    return this.currentLimit;
  }
}
```

#### Step 3.2: Integrate into Icon Download Logic

Modify icon download function in `backend/src/services/adapters/steam.ts`:
```typescript
import { AdaptiveConcurrencyController } from '../adaptiveConcurrencyController.js';

// In sync method
const userConcurrency = parseInt(await configService.getSetting('sync_image_concurrency') || '5', 10);
const concurrencyController = new AdaptiveConcurrencyController(userConcurrency);

// Download icons with adaptive concurrency
const iconDownloadPromises = icons.map(icon => 
  concurrencyController.execute(() => this.downloadIcon(icon))
);

await Promise.all(iconDownloadPromises);
```

**Expected Outcome**: Icon downloads automatically throttle when external APIs slow down.

---

### Phase 4: Polling-Based Progress Tracking (2-3 hours)

**Goal**: Real-time progress updates for sync/backup/restore operations via polling.

#### Step 4.1: Create Progress Service

Create `backend/src/services/progressService.ts`:
```typescript
interface SyncProgress {
  syncing: boolean;
  operationId?: string;
  progress?: {
    totalGames: number;
    completedGames: number;
    currentGame: string;
    achievements: number;
    icons: number;
    errors: number;
  };
  startedAt?: string;
  estimatedCompletion?: string;
  lastSync?: string;
}

export class ProgressService {
  private syncStatus: Map<string, SyncProgress> = new Map();
  private backupStatus: Map<string, any> = new Map();
  private restoreStatus: Map<string, any> = new Map();
  
  // Sync progress management
  setSyncStatus(profileId: string, status: SyncProgress): void {
    this.syncStatus.set(profileId, status);
  }
  
  getSyncStatus(profileId: string): SyncProgress | undefined {
    return this.syncStatus.get(profileId);
  }
  
  clearSyncStatus(profileId: string): void {
    this.syncStatus.delete(profileId);
  }
  
  // Backup progress management
  setBackupStatus(jobId: string, status: any): void {
    this.backupStatus.set(jobId, status);
  }
  
  getBackupStatus(jobId: string): any {
    return this.backupStatus.get(jobId);
  }
  
  // Restore progress management
  setRestoreStatus(jobId: string, status: any): void {
    this.restoreStatus.set(jobId, status);
  }
  
  getRestoreStatus(jobId: string): any {
    return this.restoreStatus.get(jobId);
  }
}

export const progressService = new ProgressService();
```

#### Step 4.2: Add Status Endpoints

Modify `backend/src/api/routes/sync.ts` to add status endpoint:
```typescript
import { progressService } from '../../services/progressService.js';

// Add this route
fastify.get(
  '/sync/:profileId/status',
  async (request: FastifyRequest<{ Params: { profileId: string } }>, reply: FastifyReply) => {
    const { profileId } = request.params;
    
    const status = progressService.getSyncStatus(profileId);
    
    if (!status || !status.syncing) {
      // Return last sync time if available
      const lastSync = await SyncRun.findOne({ profileId })
        .sort({ completedAt: -1 })
        .lean();
      
      return reply.send({
        syncing: false,
        lastSync: lastSync?.completedAt
      });
    }
    
    return reply.send(status);
  }
);
```

Add similar endpoints in `backend/src/api/routes/backup.ts`:
```typescript
fastify.get('/backup/status', async (request, reply) => {
  const jobs = await BackupJob.find({ status: 'running' })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();
  
  const currentJob = jobs[0];
  const status = currentJob ? progressService.getBackupStatus(currentJob._id.toString()) : null;
  
  return reply.send({
    current: status,
    recent: await BackupJob.find({ status: 'completed' })
      .sort({ completedAt: -1 })
      .limit(5)
      .lean()
  });
});
```

#### Step 4.3: Update Progress from Sync Service

Modify sync service to update progress state:
```typescript
// In syncProfile method
progressService.setSyncStatus(profileId, {
  syncing: true,
  operationId: syncOperation._id.toString(),
  progress: {
    totalGames,
    completedGames: gamesCompleted,
    currentGame: game.name,
    achievements: achievementsSynced,
    icons: iconsDownloaded,
    errors: errorCount
  },
  startedAt: syncOperation.startedAt.toISOString(),
  estimatedCompletion: calculateETA(gamesCompleted, totalGames, syncOperation.startedAt)
});

// When sync completes
progressService.clearSyncStatus(profileId);
```

#### Step 4.4: Create Frontend Polling Client

Create or modify `frontend/services/apiClient.ts`:
```typescript
export async function pollSyncStatus(profileId: string): Promise<SyncStatus> {
  const response = await fetch(`/api/sync/${profileId}/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch sync status');
  }
  return response.json();
}

export async function pollBackupStatus(): Promise<BackupStatus> {
  const response = await fetch('/api/backup/status');
  if (!response.ok) {
    throw new Error('Failed to fetch backup status');
  }
  return response.json();
}

export async function pollRestoreStatus(): Promise<RestoreStatus> {
  const response = await fetch('/api/restore/status');
  if (!response.ok) {
    throw new Error('Failed to fetch restore status');
  }
  return response.json();
}
```

#### Step 4.5: Update UI Components with Polling

Modify `frontend/components/SyncStatus.tsx`:
```typescript
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { pollSyncStatus } from '../services/apiClient';

export function SyncStatus({ profileId }: { profileId: string }) {
  const [status, setStatus] = useState<any>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout>();
  
  const startPolling = useCallback(async () => {
    const poll = async () => {
      try {
        const data = await pollSyncStatus(profileId);
        setStatus(data);
        
        // Stop polling when sync completes
        if (!data.syncing && pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = undefined;
        }
      } catch (error) {
        console.error('Failed to poll sync status:', error);
      }
    };
    
    // Initial poll
    await poll();
    
    // Poll every 1 second
    pollIntervalRef.current = setInterval(poll, 1000);
  }, [profileId]);
  
  useEffect(() => {
    startPolling();
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [startPolling]);
  
  if (!status?.syncing) {
    return <div>Last sync: {status?.lastSync || 'Never'}</div>;
  }
  
  const percentage = Math.round((status.progress.completedGames / status.progress.totalGames) * 100);
  
  return (
    <div>
      <div className="progress-bar">
        <div style={{ width: `${percentage}%` }} />
      </div>
      <p>Syncing: {status.progress.currentGame}</p>
      <p>{percentage}% complete ({status.progress.completedGames}/{status.progress.totalGames} games)</p>
      <p>Achievements: {status.progress.achievements} | Icons: {status.progress.icons}</p>
    </div>
  );
}
```

**Expected Outcome**: UI shows real-time progress during sync operations.

---

## Verification

### 1. Database Index Verification:
```bash
# MongoDB shell
use cpak
db.achievements.getIndexes()
# Should see: idx_achievements_profile_game_achievement
```

### 2. Performance Verification:
```bash
# Trigger sync for profile with 600+ games
# Monitor logs for adaptive adjustments
tail -f backend/logs/app.log | grep adaptive
```

### 3. Progress Polling Verification:
```bash
# Trigger sync, then poll status endpoint
curl http://localhost:3001/api/sync/{profileId}/status

# Should return JSON with syncing status and progress
# {"syncing": true, "progress": {...}, "operationId": "..."}
```

---

## Rollback Plan

If issues arise:

1. **Database indexes**: Cannot rollback (low risk, read-only impact)
2. **Adaptive algorithms**: Revert to fixed batch size from settings
3. **Progress Tracking**: Frontend gracefully degrades (no progress indicator)

---

## Performance Targets

After implementation, verify:
- ✅ API response < 2s during sync (for 1,000 game library)
- ✅ DB query times < 500ms (p95)
- ✅ No COLLSCAN in slow query logs
- ✅ Progress updates every 2 seconds
- ✅ Adaptive parameters logged and adjusting

---

## Next Steps

After completing implementation:
1. Verify performance targets are met
2. Deploy to staging environment
3. Monitor metrics for 24-48 hours
4. Gradually roll out to production users

---

## Troubleshooting

### Issue: Indexes not being used
```bash
# Verify index exists
db.achievements.getIndexes()

# Check query plan
db.achievements.find({profileId: ObjectId("..."), gameId: "123"}).explain("executionStats")
```

### Issue: Progress not updating
- Check polling interval is active (1-2 seconds)
- Verify status endpoints returning current state
- Check progressService is updating state correctly

### Issue: Adaptive params not adjusting
- Verify performance monitor logging
- Check response time thresholds in code
- Ensure sufficient sample size (5+ operations)

---

## Additional Resources

- [data-model.md](./data-model.md): Complete entity schemas
- [contracts/progress-api.md](./contracts/progress-api.md): Progress tracking API specification
- [research.md](./research.md): Polling vs SSE decision rationale
- [MongoDB Indexes Documentation](https://docs.mongodb.com/manual/indexes/)
