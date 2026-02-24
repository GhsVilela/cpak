# Progress Tracking API

**Feature**: 003-performance-optimization  
**Date**: 2026-02-21  
**Protocol**: REST API with polling

## Overview

This document defines the REST API endpoints for progress tracking during long-running operations (sync, backup, restore). The frontend polls these endpoints at regular intervals (typically 1-2 seconds) to retrieve current operation status and display progress to users.

## Endpoints

### GET /api/sync/:profileId/status

Get the current sync operation status for a profile.

**URL Parameters**:
- `profileId` (string, required): Profile._id

**Response**: 200 OK
```json
{
  "syncing": true,
  "operationId": "507f1f77bcf86cd799439011",
  "progress": {
    "totalGames": 150,
    "completedGames": 45,
    "currentGame": "Counter-Strike 2",
    "achievements": 1250,
    "icons": 2500,
    "errors": 2
  },
  "startedAt": "2026-02-21T10:30:00Z",
  "estimatedCompletion": "2026-02-21T10:45:00Z"
}
```

**When no sync is active**:
```json
{
  "syncing": false,
  "lastSync": "2026-02-21T09:15:00Z"
}
```

---

### GET /api/backup/status

Get the current backup operation status.

**Response**: 200 OK
```json
{
  "current": {
    "jobId": "507f1f77bcf86cd799439012",
    "phase": "compressing",
    "progress": {
      "collectionsProcessed": 3,
      "totalCollections": 5,
      "recordsProcessed": 15000,
      "fileSize": 15728640,
      "percentage": 60
    },
    "startedAt": "2026-02-21T10:30:00Z"
  },
  "recent": [
    {
      "jobId": "507f1f77bcf86cd799439013",
      "status": "completed",
      "fileSize": 25165824,
      "completedAt": "2026-02-21T09:00:00Z",
      "downloadUrl": "/api/backup/download/507f1f77bcf86cd799439013"
    }
  ]
}
```

**When no backup is active**:
```json
{
  "current": null,
  "recent": []
}
```

---

### GET /api/restore/status

Get the current restore operation status.

**Response**: 200 OK
```json
{
  "current": {
    "jobId": "507f1f77bcf86cd799439014",
    "phase": "restoring",
    "progress": {
      "collectionsRestored": 2,
      "totalCollections": 5,
      "recordsRestored": 8000,
      "percentage": 40
    },
    "startedAt": "2026-02-21T10:35:00Z"
  }
}
```

**When no restore is active**:
```json
{
  "current": null
}
```

---

## Polling Implementation

### Frontend Polling Pattern

The frontend establishes polling intervals when operations begin and clears them when operations complete or the component unmounts.

**Example (React/Next.js)**:
```typescript
const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
const pollIntervalRef = useRef<NodeJS.Timeout>();

const startSyncPolling = useCallback(() => {
  const poll = async () => {
    try {
      const response = await fetch(`/api/sync/${profileId}/status`);
      const data = await response.json();
      setSyncStatus(data);
      
      // Stop polling when sync completes
      if (!data.syncing && pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = undefined;
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };
  
  // Initial poll
  poll();
  
  // Poll every 1 second
  pollIntervalRef.current = setInterval(poll, 1000);
}, [profileId]);

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };
}, []);
```

### Polling Intervals

- **Sync status**: 1 second (real-time game progress updates)
- **Backup/Restore status**: 1-2 seconds (phase transitions and percentage updates)

### Backend Caching

To minimize database load from frequent polling:

- Progress information is cached in-memory on the backend
- Database updates occur per game completion (sync) or per collection (backup/restore)
- Poll requests return cached data without hitting database on every request

## Progress Phases

### Sync Operation Phases

1. **initializing**: Starting sync operation
2. **syncing**: Processing games and downloading achievements/icons
3. **completed**: All games processed successfully
4. **failed**: Operation encountered fatal error

### Backup Operation Phases

1. **preparing**: Collecting data from database
2. **compressing**: Creating compressed archive
3. **ready**: Backup file ready for download
4. **failed**: Operation encountered error
5. **expired**: Backup file expired and removed (24 hours after creation)

### Restore Operation Phases

1. **uploading**: Receiving backup file from client
2. **validating**: Checking backup file integrity
3. **extracting**: Decompressing backup archive
4. **restoring**: Writing data to database
5. **completed**: Restore finished successfully
6. **failed**: Operation encountered error

## Error Handling

When operations fail, the status endpoints return error information:

```json
{
  "current": {
    "jobId": "507f1f77bcf86cd799439015",
    "phase": "failed",
    "error": {
      "code": "BACKUP_COMPRESSION_FAILED",
      "message": "Failed to compress backup data",
      "details": "Compression library error: insufficient memory"
    },
    "failedAt": "2026-02-21T10:40:00Z"
  }
}
```

Clients should display error messages to users and provide options to retry or cancel the operation.

## Performance Considerations

- **Polling frequency**: Keep intervals at 1-2 seconds for responsive UI without overwhelming the backend
- **Request cancellation**: Cancel pending requests when starting new polls to prevent request pile-up
- **UI debouncing**: Debounce rapid UI updates to prevent flickering during fast operations
- **Cleanup**: Always clear polling intervals when components unmount to prevent memory leaks

## Migration Notes

This polling-based approach replaced an earlier SSE (Server-Sent Events) design. Polling was chosen for:

1. **Simplicity**: No connection management, reconnection logic, or heartbeat messages required
2. **Reliability**: Works consistently across all network environments (proxies, load balancers)
3. **Debugging**: Easier to trace and debug individual HTTP requests
4. **Resource efficiency**: No persistent connections, backend can scale horizontally without connection state

The 1-2 second polling interval provides responsive-enough updates for these long-running operations (typically 5-30 seconds) while keeping server load manageable.
