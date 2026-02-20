# SSE Events Schema

**Feature**: 003-performance-optimization  
**Date**: 2026-02-19  
**Protocol**: Server-Sent Events (text/event-stream)

## Overview

This document defines the message formats for Server-Sent Events (SSE) used in real-time progress tracking. SSE is used for one-way server-to-client streaming of progress updates during long-running operations (sync, backup, restore).

## Connection Endpoints

### GET /api/progress/sync/:operationId

Subscribe to progress updates for a sync operation.

**URL Parameters**:
- `operationId` (string, required): SyncOperation._id

**Response Headers**:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Stream**: Continuous stream of progress events until operation completes or client disconnects.

---

### GET /api/progress/backup/:jobId

Subscribe to progress updates for a backup operation.

**URL Parameters**:
- `jobId` (string, required): BackupJob._id

**Response Headers**: Same as sync endpoint

**Event Stream**: Progress events until backup is ready or fails.

---

### GET /api/progress/restore/:jobId

Subscribe to progress updates for a restore operation.

**URL Parameters**:
- `jobId` (string, required): RestoreJob._id

**Response Headers**: Same as sync endpoint

**Event Stream**: Progress events until restore completes or fails.

---

## Event Message Format

All SSE messages follow this structure:

```
data: <JSON-encoded-payload>\n\n
```

### Base Event Schema

```typescript
interface ProgressEvent {
  type: 'progress' | 'complete' | 'error' | 'heartbeat';
  operationId: string;
  timestamp: string;              // ISO 8601 format
  payload: ProgressPayload | CompletePayload | ErrorPayload | null;
}
```

---

## Event Types

### 1. Progress Event

Sent periodically (every 2 seconds or when significant progress occurs) to update client on operation status.

**Type**: `progress`

**Payload Schema**:
```typescript
interface ProgressPayload {
  status: 'preparing' | 'running' | 'syncing' | 'compressing' | 'restoring';
  progress: {
    current: number;              // Items processed
    total: number;                // Total items
    percentage: number;           // 0-100
  };
  currentStep: string;            // Human-readable description
  estimatedTimeRemaining?: number; // Seconds (null if cannot estimate)
  details?: {                     // Operation-specific details
    // For sync operations:
    gamesCompleted?: number;
    achievementsSynced?: number;
    iconsDownloaded?: number;
    adaptiveBatchSize?: number;
    adaptiveConcurrency?: number;
    
    // For backup operations:
    collectionsProcessed?: number;
    recordsWritten?: number;
    fileSize?: number;
    
    // For restore operations:
    collectionsRestored?: number;
    recordsInserted?: number;
    imagesRestored?: number;
  };
}
```

**Example Message**:
```
data: {"type":"progress","operationId":"65abc123def456","timestamp":"2026-02-19T17:15:30.000Z","payload":{"status":"syncing","progress":{"current":250,"total":600,"percentage":41.67},"currentStep":"Syncing achievements for Game: Red Dead Redemption 2","estimatedTimeRemaining":420,"details":{"gamesCompleted":249,"achievementsSynced":12450,"iconsDownloaded":24900,"adaptiveBatchSize":8,"adaptiveConcurrency":4}}}

```

---

### 2. Complete Event

Sent once when operation finishes successfully.

**Type**: `complete`

**Payload Schema**:
```typescript
interface CompletePayload {
  status: 'completed';
  summary: {
    totalDuration: number;        // Milliseconds
    itemsProcessed: number;
    // Operation-specific summary
    gamessynced?: number;
    achievementsSynced?: number;
    iconDownloadsFailed?: number;
    
    backupFileSize?: number;
    backupFilePath?: string;
    
    collectionsRestored?: number;
    recordsRestored?: number;
  };
  message: string;                // User-friendly completion message
}
```

**Example Message**:
```
data: {"type":"complete","operationId":"65abc123def456","timestamp":"2026-02-19T17:22:45.000Z","payload":{"status":"completed","summary":{"totalDuration":435000,"itemsProcessed":600,"gamesSynced":600,"achievementsSynced":25000,"iconDownloadsFailed":12},"message":"Sync completed successfully. 600 games synced, 25,000 achievements updated."}}

```

---

### 3. Error Event

Sent when operation encounters a fatal error.

**Type**: `error`

**Payload Schema**:
```typescript
interface ErrorPayload {
  status: 'failed';
  error: {
    code: string;                 // Error code (e.g., 'DATABASE_ERROR', 'NETWORK_ERROR')
    message: string;              // User-friendly error message
    details?: any;                // Additional error context (optional)
  };
  partialProgress?: {             // Progress before failure (optional)
    itemsProcessed: number;
    percentage: number;
  };
}
```

**Example Message**:
```
data: {"type":"error","operationId":"65abc123def456","timestamp":"2026-02-19T17:18:20.000Z","payload":{"status":"failed","error":{"code":"MONGODB_CONNECTION_ERROR","message":"Database connection lost during sync operation. Please check your database connection and try again.","details":{"mongoError":"Connection timeout"}},"partialProgress":{"itemsProcessed":320,"percentage":53.33}}}

```

---

### 4. Heartbeat Event

Sent every 30 seconds to keep connection alive, even when no progress updates occur.

**Type**: `heartbeat`

**Payload**: `null`

**Example Message**:
```
data: {"type":"heartbeat","operationId":"65abc123def456","timestamp":"2026-02-19T17:16:30.000Z","payload":null}

```

---

## Client Implementation

### JavaScript/TypeScript (Browser)

```typescript
function subscribeToProgress(
  operationType: 'sync' | 'backup' | 'restore',
  operationId: string,
  onProgress: (payload: ProgressPayload) => void,
  onComplete: (payload: CompletePayload) => void,
  onError: (payload: ErrorPayload) => void
): EventSource {
  const url = `/api/progress/${operationType}/${operationId}`;
  const eventSource = new EventSource(url);
  
  eventSource.onmessage = (event) => {
    try {
      const data: ProgressEvent = JSON.parse(event.data);
      
      switch (data.type) {
        case 'progress':
          onProgress(data.payload as ProgressPayload);
          break;
        case 'complete':
          onComplete(data.payload as CompletePayload);
          eventSource.close();
          break;
        case 'error':
          onError(data.payload as ErrorPayload);
          eventSource.close();
          break;
        case 'heartbeat':
          // Optional: log heartbeat or reset timeout timer
          console.debug('Heartbeat received');
          break;
      }
    } catch (parseError) {
      console.error('Failed to parse SSE message:', parseError);
    }
  };
  
  eventSource.onerror = (err) => {
    console.error('SSE connection error:', err);
    eventSource.close();
    // Implement exponential backoff reconnection if needed
  };
  
  return eventSource;
}

// Usage example:
const eventSource = subscribeToProgress(
  'sync',
  'operation-123',
  (progress) => {
    console.log(`Progress: ${progress.progress.percentage}%`);
    updateProgressBar(progress.progress.percentage);
    updateStatusText(progress.currentStep);
  },
  (complete) => {
    console.log('Sync complete:', complete.message);
    showSuccessNotification(complete.message);
  },
  (error) => {
    console.error('Sync failed:', error.error.message);
    showErrorNotification(error.error.message);
  }
);

// Cleanup on unmount:
// eventSource.close();
```

---

## Server Implementation

### Fastify SSE Route (TypeScript)

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ProgressService } from '../services/progressService.js';

export async function progressRoutes(fastify: FastifyInstance) {
  const progressService = new ProgressService();
  
  // Sync progress endpoint
  fastify.get(
    '/progress/sync/:operationId',
    async (request: FastifyRequest<{ Params: { operationId: string } }>, reply: FastifyReply) => {
      const { operationId } = request.params;
      
      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable nginx buffering
      });
      
      // Register connection
      const sendEvent = (event: ProgressEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        reply.raw.write(message);
      };
      
      progressService.registerConnection(operationId, sendEvent);
      
      // Heartbeat interval
      const heartbeatInterval = setInterval(() => {
        sendEvent({
          type: 'heartbeat',
          operationId,
          timestamp: new Date().toISOString(),
          payload: null
        });
      }, 30000);
      
      // Clean up on disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeatInterval);
        progressService.unregisterConnection(operationId);
      });
    }
  );
  
  // Similar endpoints for backup and restore
  fastify.get('/progress/backup/:jobId', async (request, reply) => { /* ... */ });
  fastify.get('/progress/restore/:jobId', async (request, reply) => { /* ... */ });
}
```

---

## Broadcasting Progress Updates

### From Service Layer

```typescript
// In syncService.ts or similar
async function syncGame(gameId: string, syncOperationId: string) {
  // ... sync logic ...
  
  // Broadcast progress update
  await progressService.broadcastProgress({
    type: 'progress',
    operationId: syncOperationId,
    timestamp: new Date().toISOString(),
    payload: {
      status: 'syncing',
      progress: {
        current: gamesCompleted,
        total: totalGames,
        percentage: (gamesCompleted / totalGames) * 100
      },
      currentStep: `Syncing achievements for Game: ${gameName}`,
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
}
```

---

## Error Handling

### Connection Errors:
- **Client disconnects**: Server automatically cleans up connection registry
- **Network timeout**: Client should implement reconnection with exponential backoff
- **Server restart**: Clients will see `onerror` event and can reconnect

### Message Errors:
- **Parsing error on client**: Log error, continue listening for next message
- **Invalid operation ID**: Server returns 404 before establishing SSE connection
- **Operation not found**: Send error event, close connection

---

## Performance Considerations

### Server-Side:
- **Connection Limit**: Max 10 concurrent SSE connections per operation (prevents memory exhaustion)
- **Broadcast Throttling**: Updates sent max every 2 seconds (prevents message flooding)
- **Automatic Cleanup**: Orphaned connections cleaned after 5 minutes of inactivity
- **Memory Usage**: ~5KB per active connection (minimal overhead)

### Client-Side:
- **Message Rate**: Expect 0.5-1 message per second during active operation
- **Reconnection**: Implement exponential backoff (1s, 2s, 4s, 8s, max 30s)
- **Memory**: JSON parsing overhead minimal (<1KB per message)
- **Browser Compatibility**: EventSource API supported in all modern browsers

---

## Testing

### Unit Tests:
- Parse SSE message format correctly
- Handle each event type appropriately
- Reconnect on connection loss

### Integration Tests:
- Receive progress updates during real sync operation
- Receive complete event when operation finishes
- Receive error event when operation fails
- Heartbeat messages arrive every 30 seconds

### E2E Tests (Playwright):
```javascript
test('shows real-time sync progress', async ({ page }) => {
  await page.goto('/steam');
  await page.click('[data-testid="sync-button"]');
  
  // Wait for progress indicator to appear
  await page.waitForSelector('[data-testid="progress-bar"]');
  
  // Verify progress updates
  const progressText = page.locator('[data-testid="progress-text"]');
  await expect(progressText).toContainText(/\d+%/);
  
  // Wait for completion
  await page.waitForSelector('[data-testid="sync-complete"]', { timeout: 60000 });
});
```

---

## Security Considerations

1. **Authentication**: Ensure SSE endpoints verify user session/token before establishing connection
2. **Authorization**: Verify user has access to the specified operation (operation belongs to user's profile)
3. **Rate Limiting**: Limit SSE connection attempts per user (prevent DoS)
4. **Data Exposure**: Only send progress data user is authorized to see
5. **Connection Limits**: Enforce per-user and per-operation connection limits

---

## Migration from Polling (Optional)

If existing implementation uses polling, gradual migration strategy:

1. **Phase 1**: Deploy SSE endpoints (v2), keep polling endpoints (v1)
2. **Phase 2**: Update frontend to use SSE with fallback to polling
3. **Phase 3**: Monitor SSE adoption rate (95%+ over 2 weeks)
4. **Phase 4**: Deprecate polling endpoints with sunset warning
5. **Phase 5**: Remove polling implementation

**Current Status**: No polling endpoints exist, SSE is net-new feature.

---

## Appendix: Complete Event Flow Example

**Scenario**: User syncs 600 games

```
1. Client initiates sync:
   POST /api/sync/steam?profileId=abc123
   Response: { syncOperationId: "op-456" }

2. Client subscribes to SSE:
   GET /api/progress/sync/op-456
   
3. Server sends progress events:
   data: {"type":"progress",...,"payload":{"progress":{"percentage":5}}}
   data: {"type":"progress",...,"payload":{"progress":{"percentage":12}}}
   ...
   data: {"type":"heartbeat",...}  [after 30s]
   ...
   data: {"type":"progress",...,"payload":{"progress":{"percentage":98}}}
   
4. Server sends completion:
   data: {"type":"complete",...,"payload":{"summary":{...}}}
   
5. Client closes connection automatically (on 'complete' event)
```

---

## Conclusion

SSE provides efficient, real-time progress updates with:
- **Low Latency**: Sub-second update delivery
- **Simple Protocol**: Standard HTTP, no special server requirements
- **Automatic Reconnection**: Built into EventSource API
- **Backwards Compatible**: Doesn't break existing REST API
- **Scalable**: Minimal server overhead, efficient broadcasting

All event schemas are defined TypeScript-first with runtime validation possible using Zod schemas.
