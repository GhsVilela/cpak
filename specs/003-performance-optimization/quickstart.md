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

2. **Development Dependencies** (add if needed):
   ```bash
   # Backend
   cd backend
   npm install --save-dev mongodb-memory-server vitest @vitest/ui
   
   # Frontend  
   cd frontend
   npm install --save-dev @playwright/test
   ```

3. **Local MongoDB**: Ensure MongoDB is running locally or via Docker:
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

### Phase 4: SSE Progress Tracking (3-4 hours)

**Goal**: Real-time progress updates for sync/backup/restore operations.

#### Step 4.1: Create Progress Service

Create `backend/src/services/progressService.ts`:
```typescript
type ProgressCallback = (event: any) => void;

export class ProgressService {
  private connections: Map<string, Set<ProgressCallback>> = new Map();
  
  registerConnection(operationId: string, callback: ProgressCallback): void {
    if (!this.connections.has(operationId)) {
      this.connections.set(operationId, new Set());
    }
    this.connections.get(operationId)!.add(callback);
    logger.info({ operationId, totalConnections: this.connections.get(operationId)!.size }, 'SSE connection registered');
  }
  
  unregisterConnection(operationId: string, callback: ProgressCallback): void {
    const operationConnections = this.connections.get(operationId);
    if (operationConnections) {
      operationConnections.delete(callback);
      if (operationConnections.size === 0) {
        this.connections.delete(operationId);
      }
    }
    logger.info({ operationId }, 'SSE connection unregistered');
  }
  
  broadcastProgress(event: any): void {
    const { operationId } = event;
    const callbacks = this.connections.get(operationId);
    
    if (callbacks && callbacks.size > 0) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          logger.error({ error, operationId }, 'Error broadcasting progress');
        }
      });
    }
  }
}

export const progressService = new ProgressService();
```

#### Step 4.2: Create SSE Endpoint

Create `backend/src/api/routes/progress.ts`:
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { progressService } from '../../services/progressService.js';

export async function progressRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/progress/sync/:operationId',
    async (request: FastifyRequest<{ Params: { operationId: string } }>, reply: FastifyReply) => {
      const { operationId } = request.params;
      
      // SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      
      const sendEvent = (event: any) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        reply.raw.write(message);
      };
      
      progressService.registerConnection(operationId, sendEvent);
      
      // Heartbeat
      const heartbeatInterval = setInterval(() => {
        sendEvent({
          type: 'heartbeat',
          operationId,
          timestamp: new Date().toISOString(),
          payload: null
        });
      }, 30000);
      
      // Cleanup
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        progressService.unregisterConnection(operationId, sendEvent);
      });
    }
  );
}
```

Register route in `backend/src/api/routes/index.ts`:
```typescript
import { progressRoutes } from './progress.js';

export async function registerRoutes(fastify: FastifyInstance) {
  // ... existing routes
  await fastify.register(progressRoutes, { prefix: '/api' });
}
```

#### Step 4.3: Broadcast Progress from Sync Service

Modify sync service to emit progress:
```typescript
// In syncProfile method
await progressService.broadcastProgress({
  type: 'progress',
  operationId: syncOperation._id.toString(),
  timestamp: new Date().toISOString(),
  payload: {
    status: 'syncing',
    progress: {
      current: gamesCompleted,
      total: totalGames,
      percentage: (gamesCompleted / totalGames) * 100
    },
    currentStep: `Syncing game: ${game.name}`,
    estimatedTimeRemaining: calculateETA(gamesCompleted, totalGames, startTime),
    details: {
      gamesCompleted,
      achievementsSynced,
      iconsDownloaded,
      adaptiveBatchSize: batchController.getBatchSize(),
      adaptiveConcurrency: concurrencyController.getCurrentLimit()
    }
  }
});
```

#### Step 4.4: Create Frontend SSE Client

Create `frontend/services/sseClient.ts`:
```typescript
export function subscribeToProgress(
  operationType: 'sync' | 'backup' | 'restore',
  operationId: string,
  callbacks: {
    onProgress: (payload: any) => void;
    onComplete: (payload: any) => void;
    onError: (payload: any) => void;
  }
): EventSource {
  const url = `/api/progress/${operationType}/${operationId}`;
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case 'progress':
        callbacks.onProgress(data.payload);
        break;
      case 'complete':
        callbacks.onComplete(data.payload);
        eventSource.close();
        break;
      case 'error':
        callbacks.onError(data.payload);
        eventSource.close();
        break;
    }
  };
  
  eventSource.onerror = () => {
    console.error('SSE connection error');
    eventSource.close();
  };
  
  return eventSource;
}
```

#### Step 4.5: Update UI Components

Modify `frontend/components/SyncStatus.tsx`:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { subscribeToProgress } from '../services/sseClient';

export function SyncStatus({ syncOperationId }: { syncOperationId: string }) {
  const [progress, setProgress] = useState({ percentage: 0, currentStep: '' });
  
  useEffect(() => {
    const eventSource = subscribeToProgress(
      'sync',
      syncOperationId,
      {
        onProgress: (payload) => {
          setProgress({
            percentage: payload.progress.percentage,
            currentStep: payload.currentStep
          });
        },
        onComplete: (payload) => {
          console.log('Sync complete:', payload.summary);
        },
        onError: (payload) => {
          console.error('Sync failed:', payload.error);
        }
      }
    );
    
    return () => eventSource.close();
  }, [syncOperationId]);
  
  return (
    <div>
      <div className="progress-bar">
        <div style={{ width: `${progress.percentage}%` }} />
      </div>
      <p>{progress.currentStep}</p>
      <p>{Math.round(progress.percentage)}% complete</p>
    </div>
  );
}
```

**Expected Outcome**: UI shows real-time progress during sync operations.

---

## Testing Checklist

### Unit Tests (Vitest):
```bash
cd backend
npx vitest tests/unit/adaptiveBatchController.test.ts
npx vitest tests/unit/adaptiveThrottler.test.ts
npx vitest tests/unit/adaptiveConcurrencyController.test .ts
```

### Integration Tests:
```bash
npx vitest tests/integration/syncPerformance.test.ts
```

### E2E Tests (Playwright):
```bash
cd frontend
npx playwright test tests/e2e/sync-progress.spec.ts
```

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

### 3. SSE Verification:
```bash
# Open browser DevTools > Network > EventStream
# Trigger sync, verify SSE connection established
# Verify messages arriving every 2 seconds
```

---

## Rollback Plan

If issues arise:

1. **Database indexes**: Cannot rol back (low risk, read-only impact)
2. **Adaptive algorithms**: Revert to fixed batch size from settings
3. **SSE**: Frontend gracefully degrades (no progress indicator)

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
1. Run full test suite
2. Deploy to staging environment
3. Monitor metrics for 24-48 hours
4. Gradually roll out to production users
5. Proceed to `/speckit.tasks` for task breakdown

---

## Troubleshooting

### Issue: Indexes not being used
```bash
# Verify index exists
db.achievements.getIndexes()

# Check query plan
db.achievements.find({profileId: ObjectId("..."), gameId: "123"}).explain("executionStats")
```

### Issue: SSE not connecting
- Check CORS configuration allows SSE
- Verify `/api/progress/*` routes registered
- Check nginx/proxy buffering disabled

### Issue: Adaptive params not adjusting
- Verify performance monitor logging
- Check response time thresholds in code
- Ensure sufficient sample size (5+ operations)

---

## Additional Resources

- [data-model.md](./data-model.md): Complete entity schemas
- [contracts/sse-events.md](./contracts/sse-events.md): SSE message formats
- [research.md](./research.md): Algorithm design decisions
- [MongoDB Indexes Documentation](https://docs.mongodb.com/manual/indexes/)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
