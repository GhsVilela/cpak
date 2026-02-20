# Implementation Plan: System Performance Optimization

**Branch**: `003-performance-optimization` | **Date**: 2026-02-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-performance-optimization/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Optimize system performance for large-scale achievement synchronization and backup/restore operations. Primary improvements: (1) Eliminate MongoDB collection scans causing 500ms+ queries by implementing compound indexes; (2) Add adaptive batching and throttling to prevent API unresponsiveness during sync of 50,000+ achievements; (3) Implement Server-Sent Events for real-time progress feedback during long-running operations; (4) Respect existing user-configurable settings while adding adaptive overrides when performance degrades.

**Key User Impact**: Users with large libraries (600+ games, 25,000+ achievements) will experience responsive API throughout sync operations, clear progress visibility, and significantly faster database queries. System maintains backwards compatibility with existing settings while intelligently adapting when configured values cause degradation.

## Technical Context

**Language/Version**: TypeScript 5.x with Node.js 20+ (Next.js 15+, Fastify 5+)  
**Primary Dependencies**: Next.js 15 (frontend), Fastify 5 (backend), MongoDB 8 (database), node-cron, p-limit (concurrency control)  
**Storage**: MongoDB 8+ with collections: profiles, games, achievements, settings, sync_runs, backupMetadata  
**Testing**: Vitest (unit/integration tests), Playwright (E2E tests)  
**Target Platform**: Unified Docker container (Linux x86_64/arm64) with supervisord managing multiple processes  
**Project Type**: Web application (Next.js frontend + Fastify backend)  
**Performance Goals**: API response <2s during sync for 1,000 game libraries, DB queries <500ms (p95), handle 50,000 achievements without unresponsiveness  
**Constraints**: <2s API response during heavy sync operations, <500ms database query times (p95), maintain backwards compatibility with existing user settings  
**Scale/Scope**: 1,000 games per profile, 50,000 achievements (25,000 regular + 25,000 gray icons), multiple concurrent users, support for external MongoDB instances

**Existing Implementation Notes**:
- User-configurable settings already exist: `sync_batch_size` (default: 10), `sync_image_concurrency` (default: 5)
- Settings stored in MongoDB `settings` collection managed by `configService`
- Current sync logic in `backend/src/services/adapters/steam.ts` uses batch processing
- Backup/restore in `backend/src/api/routes/backup.ts` has hardcoded BATCH_SIZE of 100
- No current implementation for adaptive throttling or SSE progress updates
- MongoDB slow query log shows COLLSCAN on achievement queries: `{gameId, achievementId}` causing 498ms queries across 26,790 documents

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Principle I: Unified Container Frontend
**Status**: PASS - No changes to unified container architecture. Performance optimizations are internal to existing Next.js and Fastify services.

### ✅ Principle II: REST Backend with Database-Backed Settings  
**Status**: PASS - Extends existing REST API with SSE endpoints (standard HTTP). Adaptive logic respects existing database-backed settings (`sync_batch_size`, `sync_image_concurrency`) while adding intelligent overrides. No new environment variables required.

### ✅ Principle III: Self-Hosting via Unified Container
**Status**: PASS - All optimizations work within unified container. MongoDB index creation handled via migration scripts. No additional services or dependencies required.

### ✅ Principle IV: Security with Encrypted Settings
**Status**: PASS - No security-related changes. Performance optimizations don't affect existing encryption or secret management.

### ✅ Principle V: Observability & Operations
**Status**: PASS - ENHANCED - Adds performance metrics logging (FR-021) and progress tracking entities. Improves observability with structured logging for slow queries and adaptive adjustments. SSE provides real-time operation visibility to users.

**Constitution Compliance**: ✅ All gates passed. Feature enhances existing architecture without introducing violations. Backwards compatible with existing user settings while providing intelligent adaptive behavior.

## Project Structure

### Documentation (this feature)

```text
specs/003-performance-optimization/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0: SSE implementation, adaptive algorithms, MongoDB indexing
├── data-model.md        # Phase 1: SyncOperation, GameSyncStatus, BackupJob, RestoreJob, ProgressUpdate entities
├── quickstart.md        # Phase 1: Developer guide for implementing performance features
├── contracts/           # Phase 1: SSE event schemas, progress update API contracts
│   └── sse-events.yaml  # Server-Sent Event message formats
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── achievement.ts           # [MODIFY] Add compound index: profileId + gameId + achievementId
│   │   ├── syncOperation.ts         # [NEW] Tracking entity for sync jobs
│   │   └── gameSyncStatus.ts        # [NEW] Per-game sync progress tracking
│   ├── services/
│   │   ├── adapters/
│   │   │   └── steam.ts             # [MODIFY] Add adaptive batching, throttling, SSE progress emission
│   │   ├── syncService.ts           # [MODIFY] Orchestrate adaptive sync with progress tracking
│   │   ├── progressService.ts       # [NEW] SSE connection management and progress broadcasting
│   │   └── performanceMonitor.ts    # [NEW] Track API response times, adjust adaptive parameters
│   ├── api/
│   │   └── routes/
│   │       ├── backup.ts            # [MODIFY] Add SSE progress, adaptive batching
│   │       ├── sync.ts              # [MODIFY] Integrate SSE progress updates
│   │       └── progress.ts          # [NEW] SSE endpoint: GET /api/progress/:operationId
│   └── migrations/
│       └── add-achievement-indexes.ts  # [NEW] Create compound indexes on achievements collection
└── tests/
    ├── unit/
    │   ├── adaptiveBatching.test.ts    # [NEW] Test adaptive batch size logic
    │   ├── performanceMonitor.test.ts  # [NEW] Test metrics tracking and threshold detection
    │   └── progressService.test.ts     # [NEW] Test SSE broadcasting
    └── integration/
        ├── syncPerformance.test.ts     # [NEW] End-to-end sync with 1000+ games
        └── backupProgress.test.ts      # [NEW] Backup/restore with progress tracking

frontend/
├── app/
│   ├── steam/
│   │   └── page.tsx                 # [MODIFY] Add sync progress indicators using SSE
│   └── settings/
│       └── page.tsx                 # [EXISTING] User-configurable batch size and concurrency settings
├── components/
│   ├── SyncStatus.tsx               # [MODIFY] Subscribe to SSE for real-time updates
│   ├── ProgressIndicator.tsx        # [NEW] Generic progress bar with ETA
│   └── BackupRestorePanel.tsx       # [NEW] Backup/restore UI with live progress
└── services/
    ├── sseClient.ts                 # [NEW] SSE connection management and event parsing
    └── progressSubscriber.ts        # [NEW] Hook for subscribing to operation progress
```

**Structure Decision**: Web application structure (Option 2) selected. This feature modifies existing backend services and adds new progress tracking capabilities. Frontend changes are minimal (progress UI components and SSE client). No new top-level services or projects required - all work happens within existing Next.js and Fastify applications.

**Key Implementation Areas**:
1. **Database Layer** (models/): Add indexes, new tracking entities
2. **Service Layer** (services/): Adaptive algorithms, performance monitoring, SSE broadcasting  
3. **API Layer** (api/routes/): SSE endpoints, progress integration
4. **Frontend Layer** (app/, components/): Real-time progress UI, SSE subscription
5. **Migration Scripts**: One-time index creation on achievements collection

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No violations identified.** All constitutional principles are maintained or enhanced by this feature.
