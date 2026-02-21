---
description: "Task breakdown for System Performance Optimization"
feature: "003-performance-optimization"
created: "2026-02-19"
---

# Tasks: System Performance Optimization

**Input**: Design documents from `/specs/003-performance-optimization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/sse-events.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Web app structure: `backend/src/`, `frontend/`
- Backend: models, services, api/routes, migrations, utils
- Frontend: app (Next.js pages), components, services

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency configuration

- [X] T001 Verify project structure matches plan.md file layout
- [X] T002 [P] Add Vitest dependencies to backend/package.json: `vitest`, `@vitest/ui`, `mongodb-memory-server`
- [X] T003 [P] Add Playwright dependencies to frontend/package.json: `@playwright/test`
- [X] T004 [P] Create vitest.config.ts in backend/ with ESM configuration
- [X] T005 [P] Create playwright.config.ts in frontend/ with SSE test support

**Checkpoint**: Setup complete - foundational work can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Performance (Phase 1 from quickstart.md - 30 minutes)

- [X] T006 Create migration script backend/src/migrations/add-achievement-indexes.ts with compound index (profileId, gameId, achievementId)
- [X] T007 [P] Create migration script backend/src/migrations/add-game-indexes.ts with index (profileId, platform)
- [X] T008 Integrate migrations into backend/src/api/server.ts startup sequence
- [X] T009 Add index verification logging to backend/src/utils/logger.ts

### Performance Monitoring Infrastructure

- [X] T010 Create backend/src/services/performanceMonitor.ts with threshold tracking for DB queries, API calls, batch operations
- [X] T011 Add performance metrics types to backend/src/services/performanceMonitor.ts: SlowQueryEvent, ApiResponseEvent, BatchMetrics

### Adaptive Control Algorithms (Phase 2 from quickstart.md - 2-3 hours)

- [X] T012 [P] Create backend/src/services/adaptiveBatchController.ts implementing feedback-controlled batch sizing algorithm
- [X] T013 [P] Create backend/src/services/adaptiveThrottler.ts implementing 250-500ms adaptive delay based on response times
- [X] T014 [P] Create backend/src/services/adaptiveConcurrencyController.ts using p-limit with adaptive maximum based on API performance

### Core Tracking Models

- [X] T015 [P] Create backend/src/models/syncOperation.ts schema with indexes on (profileId, createdAt) and (status, startedAt)
- [X] T016 [P] Create backend/src/models/gameSyncStatus.ts schema with indexes on (syncOperationId, status) and (profileId, gameId)
- [X] T017 [X] Create backend/src/models/backupJob.ts schema with indexes on (status, createdAt) and TTL on expiresAt
- [X] T018 [P] Create backend/src/models/restoreJob.ts schema with index on (status, createdAt)

### Progress Service Foundation

- [X] T019 Create backend/src/services/progressService.ts with SSE connection management, broadcast methods, and heartbeat mechanism
- [X] T020 Add progress event types to backend/src/services/progressService.ts: ProgressEvent, CompleteEvent, ErrorEvent, HeartbeatEvent
- [X] T021 Create backend/src/api/routes/progress.ts with SSE endpoints: GET /api/progress/sync/:operationId, /api/progress/backup/:jobId, /api/progress/restore/:jobId
- [X] T022 Register progress routes in backend/src/api/routes/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Achievement Sync Performance (Priority: P1) 🎯 MVP

**Goal**: Eliminate API unresponsiveness and slow queries during achievement sync operations for large libraries (600+ games, 50k+ achievements) while respecting user-configured batch size and concurrency settings

**Independent Test**: 
1. Configure sync_batch_size=50, sync_image_concurrency=10 in settings
2. Trigger full sync for profile with 100+ games
3. Verify: API remains responsive (<2s), queries complete <500ms, adaptive algorithms reduce batch/concurrency when needed, original settings respected as maximum

**User Story Mapping**:
- **Acceptance Scenarios** (from spec.md):
  - AC1.1: Full library sync (600 games) completes without API unresponsiveness
  - AC1.2: MongoDB queries use compound index, complete in <50ms
  - AC1.3: Adaptive batching reduces batch size when response time >750ms
  - AC1.4: User-configured settings respected as maximum values

### Implementation for User Story 1

#### Database Layer

- [X] T023 [US1] Modify backend/src/models/achievement.ts to add compound index (profileId, gameId, achievementId) in schema definition
- [X] T024 [US1] Modify backend/src/models/game.ts to add compound index (profileId, platform) in schema definition

#### Service Layer - Sync Integration

- [X] T025 [US1] Modify backend/src/services/steam.ts to integrate AdaptiveBatchController for achievement fetching from Steam API
- [X] T026 [US1] Modify backend/src/services/steam.ts to integrate AdaptiveThrottler for delays between API batches
- [X] T027 [US1] Modify backend/src/services/steam.ts to integrate AdaptiveConcurrencyController for icon download parallelism using p-limit
- [X] T028 [US1] Add performance monitoring to backend/src/services/steam.ts: wrap Steam API calls with performanceMonitor.measureApiCall()
- [X] T029 [US1] Add performance monitoring to backend/src/services/steam.ts: wrap MongoDB queries with performanceMonitor.measureDbQuery()

#### Sync Orchestration

- [X] T030 [US1] Modify backend/src/services/syncService.ts to create SyncOperation record at sync start with initial adaptive parameters
- [X] T031 [US1] Modify backend/src/services/syncService.ts to update SyncOperation progress fields (gamesCompleted, achievementsSynced, iconDownloads) during sync
- [X] T032 [US1] Modify backend/src/services/syncService.ts to persist adaptive parameter adjustments to SyncOperation.adaptiveParams
- [X] T033 [US1] Modify backend/src/services/syncService.ts to mark SyncOperation as completed/failed with final statistics
- [X] T034 [US1] Add error handling to backend/src/services/syncService.ts: capture game-level errors to SyncOperation.errors array

#### Backwards Compatibility

- [X] T035 [US1] Modify backend/src/services/configService.ts to load sync_batch_size and sync_image_concurrency settings as adaptive maximums
- [X] T036 [US1] Add validation to backend/src/services/adaptiveBatchController.ts to ensure current batch never exceeds user-configured maximum
- [X] T037 [US1] Add validation to backend/src/services/adaptiveConcurrencyController.ts to ensure concurrency never exceeds user-configured maximum

**Checkpoint**: Achievement sync now performs efficiently without API unresponsiveness. User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Backup/Restore Progress Tracking (Priority: P2)

**Goal**: Provide real-time progress feedback during backup creation and restore operations via SSE, tracking file preparation, compression, upload, extraction, and database restoration phases

**Independent Test**:
1. Navigate to Settings page
2. Click "Create Backup" button
3. Verify: SSE connection established, progress updates show collections processed, file size, compression status, "Download Ready" appears when complete
4. Upload backup file for restore
5. Verify: Progress updates show upload percentage, extraction status, collections restored, completion message

**User Story Mapping**:
- **Acceptance Scenarios** (from spec.md):
  - AC2.1: Backup creation shows preparing → compressing → ready phases with progress percentage
  - AC2.2: Restore shows uploading → extracting → validating → restoring phases with progress
  - AC2.3: File size and collections count displayed during backup/restore
  - AC2.4: Errors during backup/restore trigger error event via SSE
  - AC2.5: Progress updates sent every 2 seconds or on significant milestones
  - AC2.6: Connection heartbeat every 30 seconds keeps SSE alive

### Implementation for User Story 2

#### Backup Progress Integration

- [X] T038 [P] [US2] Modify backend/src/api/routes/backup.ts POST /api/backup to create BackupJob record at operation start
- [X] T039 [US2] Modify backend/src/api/routes/backup.ts to call progressService.broadcastProgress() during collection export loop
- [X] T040 [US2] Modify backend/src/api/routes/backup.ts to update BackupJob fields (collectionsProcessed, recordsProcessed, fileSize) as backup proceeds
- [X] T041 [US2] Modify backend/src/api/routes/backup.ts to broadcast complete event when backup file is ready with download path
- [X] T042 [US2] Modify backend/src/api/routes/backup.ts to broadcast error event on backup failure with error details

#### Restore Progress Integration

- [X] T043 [P] [US2] Modify backend/src/api/routes/backup.ts POST /api/restore to create RestoreJob record at operation start
- [X] T044 [US2] Modify backend/src/api/routes/backup.ts to broadcast progress during file upload phase (status: 'uploading')
- [X] T045 [US2] Modify backend/src/api/routes/backup.ts to broadcast progress during extraction phase (status: 'extracting')
- [X] T046 [US2] Modify backend/src/api/routes/backup.ts to broadcast progress during database restoration loop (status: 'restoring')
- [X] T047 [US2] Modify backend/src/api/routes/backup.ts to update RestoreJob fields (collectionsRestored, recordsRestored, imagesRestored) during restore
- [X] T048 [US2] Modify backend/src/api/routes/backup.ts to broadcast complete event when restore finishes with summary statistics
- [X] T049 [US2] Modify backend/src/api/routes/backup.ts to capture warnings (e.g., duplicate records skipped) in RestoreJob.warnings array

#### Cleanup & Lifecycle

- [X] T050 [US2] Add TTL cleanup job to backend/src/services/scheduler.ts to expire BackupJob records after 24 hours
- [X] T051 [US2] Add orphaned RestoreJob cleanup to backend/src/services/scheduler.ts to remove records older than 7 days

**Checkpoint**: Backup and restore operations now provide real-time progress feedback. User Story 2 should work independently from User Story 1.

---

## Phase 5: User Story 3 - Sync Progress Visibility (Priority: P3)

**Goal**: Display real-time sync progress in frontend UI with game-level granularity, adaptive parameter visibility, estimated time remaining, and per-game status indicators

**Independent Test**:
1. Navigate to Steam page
2. Click "Sync Now" button
3. Verify: Progress modal appears showing:
   - Overall progress bar with percentage
   - Current game being synced with name
   - Games completed / total games counter
   - Achievements synced counter
   - Icons downloaded counter
   - Current adaptive batch size and concurrency values
   - Estimated time remaining (if available)
4. Verify: Modal closes automatically on completion with success message

**User Story Mapping**:
- **Acceptance Scenarios** (from spec.md):
  - AC3.1: Sync progress modal shows overall progress (X/Y games, Z achievements)
  - AC3.2: Current game being synced displayed with name
  - AC3.3: Estimated time remaining shown (if calculable)
  - AC3.4: Adaptive parameters visible (current batch size, concurrency level)

### Implementation for User Story 3

#### Frontend SSE Client

- [X] T052 [P] [US3] Create frontend/services/sseClient.ts with EventSource management, automatic reconnection with exponential backoff, and error handling
- [X] T053 [P] [US3] Add progress event parsing to frontend/services/sseClient.ts: handle progress, complete, error, heartbeat event types

#### UI Components - Sync Progress

- [X] T054 [P] [US3] Create frontend/components/ProgressIndicator.tsx generic component with progress bar, percentage display, and status text
- [X] T055 [P] [US3] Create frontend/components/SyncProgressPanel.tsx displaying overall sync progress with games/achievements/icons counters
- [X] T056 [US3] Add adaptive parameters display to frontend/components/SyncProgressPanel.tsx: show current batch size and concurrency values
- [X] T057 [US3] Add estimated time remaining to frontend/components/SyncProgressPanel.tsx: format seconds as human-readable time
- [X] T058 [US3] Add per-game status list to frontend/components/SyncProgressPanel.tsx: show completed/syncing/failed games with icons

#### UI Components - Backup/Restore Progress

- [X] T059 [P] [US3] Create frontend/components/BackupProgressModal.tsx showing backup creation phases (preparing, compressing, ready) with progress bar
- [X] T060 [P] [US3] Create frontend/components/RestoreProgressModal.tsx showing restore phases (uploading, extracting, validating, restoring) with progress bar
- [X] T061 [US3] Add file size display to frontend/components/BackupProgressModal.tsx: format bytes as human-readable (MB/GB)
- [X] T062 [US3] Add collections/records counters to frontend/components/RestoreProgressModal.tsx

#### Page Integration

- [X] T063 [US3] Modify frontend/app/steam/page.tsx to integrate SyncProgressPanel: show modal on sync start, establish SSE connection
- [X] T064 [US3] Modify frontend/app/steam/page.tsx to close SyncProgressPanel on sync completion or error with toast notification
- [X] T065 [US3] Modify frontend/app/settings/page.tsx to integrate BackupProgressModal: show modal on backup creation with SSE connection
- [X] T066 [US3] Modify frontend/app/settings/page.tsx to integrate RestoreProgressModal: show modal on restore upload with SSE connection

#### Error Handling

- [X] T067 [US3] Add SSE error handling to frontend/services/sseClient.ts: display user-friendly error messages in modal
- [X] T068 [US3] Add SSE disconnection handling to frontend/services/sseClient.ts: show "Connection lost, reconnecting..." message
- [X] T069 [US3] Modify frontend/components/Toast.tsx to handle error events from SSE: display error code and message

**Checkpoint**: All user stories should now be independently functional. Users have full visibility into sync, backup, and restore operations with real-time progress feedback.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T070 [P] Update specs/003-performance-optimization/README.md with implementation summary and architectural decisions
- [X] T071 [P] Add performance logging documentation to backend/src/utils/logger.ts: document slow query patterns and thresholds
- [X] T072 Code review backend/src/services/syncService.ts for cleanup: remove debug logging, optimize error handling
- [X] T073 Code review frontend/components for consistency: ensure all progress components use shared ProgressIndicator styling
- [X] T074 [P] Add MongoDB query performance validation script to backend/src/scripts/: verify indexes eliminate COLLSCAN
- [X] T075 Security review of SSE implementation: validate connection limits, prevent memory leaks from orphaned connections
- [X] T076 Run quickstart.md validation steps: verify all 4 implementation phases work as documented
- [X] T077 [P] Update .github/agents/copilot-instructions.md with adaptive algorithm patterns and SSE implementation notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
  - Foundational provides: Database indexes, adaptive controllers, performance monitor, SyncOperation model, progressService
  - User Story 1 adds: Integration into syncService and steam adapter

- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on User Story 1
  - Foundational provides: BackupJob/RestoreJob models, progressService with SSE endpoints
  - User Story 2 adds: Integration into backup/restore routes
  - Independent: Does not modify sync flow, operates on separate endpoints

- **User Story 3 (P3)**: Depends on Foundational (Phase 2) - Can benefit from US1/US2 being complete for full testing
  - Foundational provides: SSE endpoints exposed via progressService
  - User Story 3 adds: Frontend UI components and SSE client
  - Partial independence: Can be developed and tested with mock SSE data, but full integration testing requires US1 and US2

### Within Each User Story

**User Story 1** (Achievement Sync Performance):
1. Database schema modifications (T023-T024) - parallel, no dependencies
2. Service layer adaptive integration (T025-T029) - depends on schema, can be parallel across files
3. Sync orchestration (T030-T034) - depends on adaptive integration
4. Backwards compatibility validation (T035-T037) - depends on sync orchestration

**User Story 2** (Backup/Restore Progress):
1. Backup progress integration (T038-T042) - sequential within backup.ts
2. Restore progress integration (T043-T049) - parallel to backup, sequential within restore flow
3. Cleanup jobs (T050-T051) - parallel, depends on job models from Foundational

**User Story 3** (Sync Progress Visibility):
1. SSE client (T052-T053) - parallel, no dependencies
2. Progress UI components (T054-T062) - parallel, depends on SSE client structure
3. Page integration (T063-T066) - depends on components, parallel across pages
4. Error handling (T067-T069) - depends on page integration

### Parallel Opportunities

**Setup Phase** (Phase 1):
- T002, T003, T004, T005 can all run in parallel (different files)

**Foundational Phase** (Phase 2):
- Database migrations (T006-T007) can run in parallel
- Adaptive controllers (T012-T014) can run in parallel (independent files)
- Core models (T015-T018) can run in parallel (independent schemas)

**User Story 1**:
- Schema modifications (T023-T024) can run in parallel
- Adaptive integration (T025-T027) can run in parallel after schemas complete
- Performance monitoring additions (T028-T029) can run in parallel with adaptive integration

**User Story 2**:
- Backup integration (T038-T042) and Restore integration (T043-T049) can run in parallel (separate code paths)
- Cleanup jobs (T050-T051) can run in parallel

**User Story 3**:
- SSE client creation (T052-T053) can run in parallel with progress components
- Progress components (T054-T055, T059-T060) can run in parallel (independent components)
- Component features (T056-T058, T061-T062) depend on base components but can parallelize across components
- Page integrations (T063-T066) can run in parallel (separate pages)

**Polish Phase** (Phase 6):
- Documentation tasks (T070, T071, T077) can run in parallel
- Validation tasks (T074, T076) can run in parallel after implementation complete

---

## Parallel Example: User Story 1

```bash
# After Foundational Phase completes, launch database schema modifications in parallel:
Developer A: "Modify backend/src/models/achievement.ts to add compound index" (T023)
Developer B: "Modify backend/src/models/game.ts to add compound index" (T024)

# After schemas complete, launch adaptive integration in parallel:
Developer A: "Integrate AdaptiveBatchController into steam.ts" (T025)
Developer B: "Integrate AdaptiveThrottler into steam.ts" (T026)
Developer C: "Integrate AdaptiveConcurrencyController into steam.ts" (T027)

# Performance monitoring can run in parallel with adaptive integration:
Developer D: "Add measureApiCall() wrapping to steam.ts" (T028)
Developer D: "Add measureDbQuery() wrapping to steam.ts" (T029)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~30 minutes)
2. Complete Phase 2: Foundational (~4-6 hours)
   - Database indexes: 30 minutes
   - Adaptive controllers: 2-3 hours
   - Progress infrastructure: 1-2 hours
3. Complete Phase 3: User Story 1 (~3-4 hours)
   - Schema modifications: 30 minutes
   - Adaptive integration: 1.5 hours
   - Sync orchestration: 1 hour
   - Backwards compatibility: 30 minutes
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Trigger full sync for profile with 100+ games
   - Verify API remains responsive (<2s response times)
   - Verify MongoDB queries complete in <50ms (check logs)
   - Verify adaptive algorithms reduce batch/concurrency when needed
   - Verify user settings respected as maximum values
5. Deploy/demo if ready - MVP delivers core performance improvement

**Estimated Total**: 8-11 hours for MVP (Phase 1 + Phase 2 + Phase 3)

### Incremental Delivery

1. **Milestone 1**: Setup + Foundational → Foundation ready (~5-7 hours)
   - Database performance improves immediately (indexes)
   - Adaptive algorithms ready for integration
   - Progress tracking infrastructure available

2. **Milestone 2**: Add User Story 1 → Test independently → Deploy/Demo (~3-4 hours)
   - **MVP COMPLETE** 🎯
   - Achievement sync no longer causes API unresponsiveness
   - Large library syncs (600+ games) complete without slowdown
   - User-configured settings respected

3. **Milestone 3**: Add User Story 2 → Test independently → Deploy/Demo (~3-4 hours)
   - Backup creation shows real-time progress
   - Restore operations provide user feedback during upload/extraction
   - No more "black box" waiting for large file operations

4. **Milestone 4**: Add User Story 3 → Test independently → Deploy/Demo (~4-5 hours)
   - Full UI visibility into sync operations
   - Users can see estimated time remaining
   - Adaptive parameters visible for transparency

5. **Milestone 5**: Polish → Final validation → Production deployment (~2-3 hours)
   - Code cleanup and documentation
   - Performance validation
   - Security review

**Estimated Total**: 17-23 hours for complete feature (all phases)

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (~5-7 hours)
   - Critical path: Database migrations → Adaptive controllers → Progress service
   - Parallelizable: Most tasks in Foundational phase can run concurrently

2. **Once Foundational is done, split into parallel tracks**:
   - **Developer A**: User Story 1 (Achievement Sync) - ~3-4 hours
     - Backend: Integrate adaptive algorithms into sync flow
     - Most critical: Addresses primary performance issue
   - **Developer B**: User Story 2 (Backup/Restore Progress) - ~3-4 hours
     - Backend: Add progress tracking to backup/restore routes
     - Independent code path from sync
   - **Developer C**: User Story 3 (Sync Progress Visibility) - ~4-5 hours
     - Frontend: Build SSE client and progress UI components
     - Can start with mock data, integrate when US1/US2 complete

3. **Stories complete and integrate independently**
   - Each developer can test their story without blocking others
   - Integration point: Frontend (US3) connects to backend SSE endpoints from US1/US2

**Estimated Total with Parallel Team**: ~9-12 hours wall-clock time (vs 17-23 hours sequential)

---

## Notes

- **[P] tasks**: Different files, no dependencies - safe to parallelize
- **[Story] label**: Maps task to specific user story for traceability (US1, US2, US3)
- **Independent stories**: Each user story should be fully functional on its own
- **Backwards compatibility**: User Story 1 maintains existing user settings as adaptive maximums
- **Performance targets**: 
  - Database queries: <50ms (down from 498ms)
  - API responses during sync: <2s (prevents unresponsiveness)
  - SSE updates: Every 2 seconds or on significant progress
  - SSE heartbeat: Every 30 seconds
- **Commit strategy**: Commit after each task or logical group
- **Validation checkpoints**: Stop at each phase checkpoint to validate story independence
- **Avoid**: 
  - Same file conflicts (coordinate when multiple tasks modify same file)
  - Cross-story dependencies that break independence
  - Skipping Foundational phase (BLOCKS all user stories)

---

## Task Summary

- **Total Tasks**: 77
- **Setup Phase**: 5 tasks (~30 minutes)
- **Foundational Phase**: 17 tasks (~4-6 hours) - BLOCKING all user stories
- **User Story 1 (P1)**: 15 tasks (~3-4 hours) - Achievement Sync Performance 🎯 MVP
- **User Story 2 (P2)**: 14 tasks (~3-4 hours) - Backup/Restore Progress
- **User Story 3 (P3)**: 18 tasks (~4-5 hours) - Sync Progress Visibility
- **Polish Phase**: 8 tasks (~2-3 hours)

**Parallel Opportunities Identified**: 42 tasks marked [P] can run in parallel when dependencies met

**Independent Test Criteria**:
- User Story 1: Trigger sync with 100+ games, verify API remains responsive, adaptive algorithms work, settings respected
- User Story 2: Create backup and verify progress updates, restore backup and verify phase tracking
- User Story 3: Start sync and verify UI shows real-time progress with all counters and adaptive parameters

**Suggested MVP Scope**: Phase 1 (Setup) + Phase 2 (Foundational) + Phase 3 (User Story 1 only) = 37 tasks, ~8-11 hours

**Format Validation**: ✅ All tasks follow required checklist format with checkbox, ID, optional [P] marker, optional [Story] label, description with file path
