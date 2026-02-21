# Research: System Performance Optimization

**Feature**: 003-performance-optimization  
**Date**: 2026-02-19  
**Research Phase**: Phase 0

## Overview

This document consolidates research findings for implementing performance optimizations across three critical areas: achievement synchronization, backup/restore operations, and real-time progress feedback. Research focuses on backwards-compatible solutions that respect existing user settings while adding intelligent adaptive behavior.

## 1. Server-Sent Events (SSE) Implementation

### Decision: Native Node.js/Fastify SSE with EventSource on client

**Research Findings**:

**Backend (Fastify)**:
```typescript
// Pattern: SSE endpoint with connection management
fastify.get('/api/progress/:operationId', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const { operationId } = request.params;
  const sendProgress = (data) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Register connection in progress service
  progressService.registerConnection(operationId, sendProgress);
  
  // Handle client disconnect
  request.raw.on('close', () => {
    progressService.unregisterConnection(operationId);
  });
});
```

**Frontend (Next.js)**:
```typescript
// Pattern: EventSource with automatic reconnection
const eventSource = new EventSource(`/api/progress/${operationId}`);

eventSource.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  updateProgressUI(progress);
};

eventSource.onerror = () => {
  eventSource.close();
  // Implement exponential backoff reconnection
};
```

**Best Practices**:
- Keep connections alive with periodic heartbeat messages (every 30s)
- Limit concurrent SSE connections per operation (max 10 clients per operation)
- Clean up orphaned connections after 5 minutes of inactivity
- Use structured message format: `{ type, operationId, progress, message, timestamp }`

**Alternatives Considered**:
- WebSockets: Overkill for one-way progress updates, more complex connection management
- Long polling: Higher latency, more server overhead, no automatic reconnection
- Traditional polling: Too much overhead, poor user experience

## 2. Adaptive Batching Algorithm

### Decision: Feedback-controlled adaptive batch sizing

**Algorithm**:
```typescript
class AdaptiveBatchController {
  private currentBatchSize: number;
  private readonly minBatchSize = 5;
  private readonly maxBatchSize;
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
      // Degrading: reduce batch size by 20%
      this.currentBatchSize = Math.max(
        this.minBatchSize,
        Math.floor(this.currentBatchSize * 0.8)
      );
    } else if (avgResponseTime < this.targetResponseTime * 0.5 && this.currentBatchSize < this.maxBatchSize) {
      // Performing well: increase batch size by 10%
      this.currentBatchSize = Math.min(
        this.maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.1)
      );
    }
  }
  
  getBatchSize(): number {
    return this.currentBatchSize;
  }
}
```

**Rationale**:
- Starts at user-configured value (respects existing settings)
- Automatically reduces when performance degrades (target: <500ms response time)
- Gradually increases when system performs well
- Never exceeds user's configured maximum (backwards compatible)
- Uses sliding window of recent measurements to avoid thrashing

**Alternatives Considered**:
- Fixed small batch: Too conservative, slow for healthy systems
- Per-game adaptive: Too complex, inconsistent behavior
- Linear adjustment: Too slow to respond to degradation

## 3. MongoDB Indexing Strategy

### Decision: Compound index (profileId, gameId, achievementId) with additional indexes

**Primary Index** (addresses COLLSCAN in slow query log):
```typescript
// achievements collection
db.achievements.createIndex(
  { profileId: 1, gameId: 1, achievementId: 1 },
  { name: 'idx_achievements_profile_game_achievement' }
);
```

**Supporting Indexes**:
```typescript
// Query pattern: List achievements for a game
db.achievements.createIndex(
  { profileId: 1, gameId: 1 },
  { name: 'idx_achievements_profile_game' }
);

// Query pattern: Sync operations need to find games by profile
db.games.createIndex(
  { profileId: 1, platform: 1 },
  { name: 'idx_games_profile_platform' }
);

// Query pattern: Settings lookup (already should be indexed on 'key')
db.settings.createIndex(
  { key: 1 },
  { name: 'idx_settings_key', unique: true }
);
```

**Index Selection Rationale**:
- Compound index on achievements matches exact query pattern from slow query log
- Left-to-right prefix property allows reuse for `{profileId, gameId}` queries
- Selective enough to avoid large index scans (profileId + gameId narrows to ~500 achievements per game)
- Low write overhead (achievements are written once, read many times)

**Migration Strategy**:
```typescript
// Create indexes idempotently (check existence first)
// Run during application startup or as standalone migration
// Background index creation to avoid blocking production traffic
await Achievement.collection.createIndex(
  { profileId: 1, gameId: 1, achievementId: 1 },
  { background: true, name: 'idx_achievements_profile_game_achievement' }
);
```

**Expected Performance Impact**:
- Query time: 498ms → <10ms (50x improvement)
- Eliminates COLLSCAN (26,790 docs scanned → index lookup)
- Index size: ~2-5MB for 50,000 achievements (acceptable overhead)

## 4. Adaptive Concurrency Control

### Decision: p-limit with dynamic limit adjustment

**Current State**: User configures `sync_image_concurrency` (default: 5)

**Enhancement Pattern**:
```typescript
class AdaptiveConcurrencyController {
  private userConfiguredLimit: number;
  private currentLimit: number;
  private limiter: any; // p-limit instance
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
    const avgResponseTime = this.apiResponseTimes.reduce((a, b) => a + b, 0) / this.apiResponseTimes.length;
    
    // If API calls are taking >2s on average, reduce concurrency
    if (avgResponseTime > 2000 && this.currentLimit > this.minLimit) {
      this.currentLimit = Math.max(this.minLimit, this.currentLimit - 1);
      this.limiter = pLimit(this.currentLimit);
    }
    // If API calls are fast (<500ms) and we're below user's limit, increase
    else if (avgResponseTime < 500 && this.currentLimit < this.userConfiguredLimit) {
      this.currentLimit = Math.min(this.userConfiguredLimit, this.currentLimit + 1);
      this.limiter = pLimit(this.currentLimit);
    }
  }
}
```

**Rationale**:
- Wraps existing p-limit library (already in dependencies)
- Starts at user's configured value (backwards compatible)
- Reduces when external API calls slow down
- Restores to user's setting when performance improves
- Gradual adjustment (±1 at a time) prevents thrashing

**Why p-limit**:
- Already in project dependencies
- Simple promise-based API
- Lightweight (no external dependencies)
- Battle-tested in production environments

## 5. Adaptive Throttling (Delay Between Batches)

### Decision: Dynamic delay with exponential backoff

**Pattern**:
```typescript
class AdaptiveThrottler {
  private currentDelay: number = 250; // Start at 250ms
  private readonly minDelay = 250;
  private readonly maxDelay = 2000;
  private readonly targetResponseTime = 500;
  
  async throttle(lastBatchResponseTime: number): Promise<void> {
    // Adjust delay based on last batch performance
    if (lastBatchResponseTime > this.targetResponseTime * 2) {
      // Slow batch: increase delay exponentially
      this.currentDelay = Math.min(
        this.maxDelay,
        this.currentDelay * 1.5
      );
    } else if (lastBatchResponseTime < this.targetResponseTime * 0.5) {
      // Fast batch: reduce delay linearly
      this.currentDelay = Math.max(
        this.minDelay,
        this.currentDelay - 50
      );
    }
    
    await new Promise(resolve => setTimeout(resolve, this.currentDelay));
  }
  
  getCurrentDelay(): number {
    return this.currentDelay;
  }
}
```

**Rationale**:
- Starts at 250ms (balance speed vs. responsiveness per clarifications)
- Increases exponentially when system is struggling (faster response to degradation)
- Decreases linearly when system is healthy (conservative return to speed)
- Never exceeds 2s (prevents sync from stalling completely)
- Independent of batch size (works with adaptive batching)

## 6. Performance Monitoring & Metrics

### Decision: Structured logging with performance thresholds

**Pattern**:
```typescript
class PerformanceMonitor {
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
  
  // Similar methods for measureApiCall, measureBatchOperation
}
```

**Metrics to Track**:
- Database query durations (p50, p95, p99)
- API response times during sync operations
- Batch operation durations
- Current adaptive parameters (batch size, concurrency, delay)
- SSE connection counts and durations
- Error rates and retry counts

**Logging Format**:
```json
{
  "timestamp": "2026-02-19T12:34:56.789Z",
  "level": "warn",
  "type": "slow_query",
  "operation": "findAndUpdateAchievement",
  "duration": 523,
  "threshold": 500,
  "adaptiveParams": {
    "batchSize": 8,
    "concurrency": 4,
    "delay": 350
  }
}
```

## 7. Backwards Compatibility Strategy

### Key Requirements:
1. Respect existing user-configured settings as starting point
2. Never exceed user's configured maximum values
3. Document adaptive behavior in settings UI (tooltip/help text)
4. Provide opt-out mechanism (if needed in future)

### Implementation Checklist:
- ✅ Read `sync_batch_size` from settings database (existing)
- ✅ Read `sync_image_concurrency` from settings database (existing)  
- ✅ Use configured values as maximum bounds for adaptive algorithms
- ✅ Start adaptive controllers at user's configured values
- ✅ Only reduce below configured values when performance degrades
- ✅ Restore to configured values when performance improves
- ✅ Log adaptive adjustments for transparency
- ✅ No breaking changes to settings schema or API contracts

### Settings UI Enhancement:
```typescript
// Add help text to existing settings fields
{
  label: "Sync Batch Size",
  key: "sync_batch_size",
  default: 10,
  helpText: "Maximum games processed per batch. System will automatically reduce this if performance degrades.",
  type: "number",
  min: 5,
  max: 50
}

{
  label: "Image Download Concurrency",
  key: "sync_image_concurrency", 
  default: 5,
  helpText: "Maximum concurrent image downloads. System will automatically reduce this if API becomes unresponsive.",
  type: "number",
  min: 2,
  max: 20
}
```

## 8. Migration and Rollout Plan

### Phase 1: Database Indexes (Low Risk)
1. Create migration script: `add-achievement-indexes.ts`
2. Run background index creation (non-blocking)
3. Verify index usage with `explain()` queries
4. Expected timeline: 1-2 minutes for 50k documents

### Phase 2: Adaptive Algorithms (Medium Risk)
1. Implement adaptive controllers with feature flags
2. Deploy with adaptive features disabled by default
3. Enable for canary users (internal testing)
4. Monitor metrics for 24-48 hours
5. Gradually enable for all users

### Phase 3: SSE Progress Tracking (Low Risk)
1. Deploy SSE endpoints (no breaking changes)
2. Update frontend to use SSE (graceful degradation if unavailable)
3. Monitor SSE connection counts and errors
4. Expected timeline: Immediate rollout (additive feature)

### Rollback Plan:
- Database indexes: Cannot be easily rolled back (but low risk, read-only impact)
- Adaptive algorithms: Disable via feature flag, revert to user settings only
- SSE: Frontend falls back to no progress indicator (existing behavior)

## Conclusion

All research items have been resolved with concrete decisions. The chosen approaches prioritize:
1. **Backwards Compatibility**: Respect existing user settings as maximum bounds
2. **Adaptive Behavior**: Intelligent response to system load without manual intervention
3. **Observability**: Comprehensive metrics and structured logging
4. **Simplicity**: Use existing dependencies where possible (p-limit, Fastify SSE)
5. **Performance**: Targeted optimizations (compound indexes) for maximum impact

**No remaining NEEDS CLARIFICATION items.** Ready to proceed to Phase 1: Data Model and Contracts.
