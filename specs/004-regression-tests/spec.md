# Feature Specification: Regression Test Suite

**Feature Branch**: `004-regression-tests`  
**Created**: 2026-02-24  
**Status**: Draft  
**Input**: User description: "Build regression test suite for backend and frontend covering existing code to avoid breaking features with upcoming xbox and playstation integration changes"

## Clarifications

### Session 2026-02-24

- Q: Which test layer strategy should the suite use: unit-only, unit + API integration, integration-only, or unit + integration + snapshots? → A: Unit tests + API integration tests — unit tests for service/utility logic; API integration tests spin up the real server and hit routes with a test database. Catches both logic and wiring bugs.
- Q: How should the backend API integration tests isolate MongoDB? → A: `mongodb-memory-server` — spins up a real, ephemeral MongoDB process in-process for each test run; no external dependencies required locally or in CI.
- Q: What is the scope of frontend tests — shared components only, components + page smoke tests, or full components + pages with mocked data fetching? → A: All components including pages — full test coverage of both `components/` and all `app/` pages with data-fetching behavior mocked via `apiClient`.
- Q: How should frontend tests intercept `apiClient` calls — manual module mock, MSW network interception, or dependency injection? → A: MSW (Mock Service Worker) — intercept HTTP calls at the network level using `msw` in Node.js handler mode; fixtures are reusable across components and pages.
- Q: Are browser-level end-to-end (E2E) tests in or out of scope for this feature? → A: E2E explicitly out of scope — no Playwright or Cypress tests; full regression protection is achieved through API integration tests and MSW-backed component/page tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Backend API Regression Coverage (Priority: P1)

A developer working on Xbox or PlayStation integration needs confidence that existing API endpoints for games, profiles, sync, backup, restore, achievements, settings, and system management continue to work correctly after any code change. They run the backend test suite and receive a clear pass/fail result for every covered route, along with a coverage report.

**Why this priority**: The backend API is the foundation of the entire application. Without verified API correctness, frontend features and integrations cannot be trusted. Any accidental breakage of sync, backup, or restore endpoints would have immediate user impact.

**Independent Test**: Can be fully tested by running the backend test command in isolation, producing a pass/fail result and coverage report without starting the full application stack.

**Acceptance Scenarios**:

1. **Given** the backend test suite exists, **When** a developer runs it locally, **Then** all tests pass and a coverage report is produced showing at least 70% coverage of API routes and service logic.
2. **Given** a developer modifies a sync-related service, **When** the test suite runs, **Then** any broken behavior in existing sync, backup, or restore flows is reported as a failing test.
3. **Given** an API route has no error handling for invalid input, **When** the test suite runs, **Then** a test case exercises that invalid input and asserts the appropriate error response.
4. **Given** the backend tests run on CI, **When** a pull request is opened, **Then** the pipeline executes all backend tests and blocks merge if any test fails.

---

### User Story 2 - Frontend Component Regression Coverage (Priority: P2)

A developer modifying shared UI components (GameGrid, SyncStatus, BackupProgressModal, etc.) needs confidence that those components still render correctly and behave as expected across their primary states (loading, success, error, empty) after any change.

**Why this priority**: Frontend regressions are highly visible to users and difficult to catch manually as the number of components grows. Automated component tests make it safe to refactor shared components across Steam, Xbox, and PlayStation views.

**Independent Test**: Can be fully tested by running the frontend test command in isolation against the component library, verifying render output and key interactions without a running backend or browser.

**Acceptance Scenarios**:

1. **Given** the frontend test suite exists, **When** a developer runs it locally, **Then** all component tests pass and a coverage report shows at least 60% coverage of frontend components.
2. **Given** a developer changes the `GameTile` component, **When** the test suite runs, **Then** tests assert that the tile renders game name, cover image, and sync status correctly.
3. **Given** the `BackupProgressModal` is in a loading state, **When** its test runs, **Then** the test verifies the progress indicator and cancel button are rendered.
4. **Given** the `SyncStatus` component receives an error state, **When** its test runs, **Then** the test verifies an error message is displayed to the user.

---

### User Story 3 - Critical Service Logic Unit Coverage (Priority: P3)

A developer adding new platform adapters (Xbox, PlayStation) needs confidence that the core service logic — sync orchestration, rate limiting, adaptive throttling, scheduler, and backup/restore jobs — behaves correctly across normal and edge-case conditions without requiring a live third-party connection.

**Why this priority**: Service logic is the most complex part of the codebase. It directly controls data integrity and user data safety. Third-party platforms cannot be called in automated tests, so mocking these boundaries is critical for reliable coverage.

**Independent Test**: Can be fully tested by running service unit tests with all external dependencies mocked, verifying business logic in isolation.

**Acceptance Scenarios**:

1. **Given** the sync service receives a cancellation signal mid-run, **When** the service logic test runs, **Then** the test verifies the sync operation halts and leaves no partial state.
2. **Given** the rate limiter reaches its threshold, **When** the service logic test runs, **Then** requests beyond the limit are queued or rejected per the defined policy.
3. **Given** the scheduler is configured with a backup interval, **When** the scheduler test runs, **Then** the test verifies that jobs are triggered at the expected intervals.
4. **Given** an external platform API (Steam, Xbox, PlayStation) call fails, **When** the adapter test runs using a mock, **Then** the test verifies the adapter returns a structured error to the sync service.

---

### User Story 4 - Automated CI Test Gating (Priority: P4)

A contributor opens a pull request with changes that inadvertently break an existing feature. The CI pipeline automatically runs the full test suite and blocks the PR merge until all tests pass, without requiring manual review of every code path.

**Why this priority**: Without CI gating, regression protection only works when developers remember to run tests locally. Automating this removes human error from the safety net.

**Independent Test**: Can be verified by opening a pull request with a deliberately failing test and confirming the CI pipeline blocks the merge.

**Acceptance Scenarios**:

1. **Given** CI is configured, **When** a pull request is opened, **Then** the pipeline runs all backend and frontend tests automatically.
2. **Given** any test fails in CI, **When** a merge is attempted, **Then** the merge is blocked and the test failure is reported on the pull request.
3. **Given** all tests pass in CI, **When** a merge is attempted, **Then** the merge is permitted to proceed.

---

### Edge Cases

- What happens when a test relies on database state left over from a previous test run? Each test must set up and tear down its own data to remain independent.
- How does the test suite handle platform-specific adapters (Xbox, PlayStation) that require authentication tokens? External calls must be intercepted and replaced with fixtures so tests never reach live APIs.
- What happens when a new route is added without a corresponding test? Coverage thresholds fail and block CI, signalling the gap.
- How does the test suite handle async operations such as backup jobs that run in the background? Tests must await completion or use controlled fake timers rather than relying on real elapsed time.
- What if a test passes locally but fails in CI due to environment differences? Tests must not rely on local file paths, OS-specific behavior, or hardcoded external endpoints.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The test suite MUST cover all existing backend API routes (achievements, backup, export/import, games, icons, profiles, settings, sync, sync runs, system) via **API integration tests** that spin up the real server against an isolated test database and assert over HTTP request/response pairs.
- **FR-002**: The test suite MUST cover the core service layer (sync service, scheduler, rate limiter, adaptive throttler, adaptive batch controller, adaptive concurrency controller, and sync cancellation) via **unit tests** where all external dependencies (database, platform APIs, filesystem) are replaced by test doubles.
- **FR-003**: The test suite MUST cover all frontend **shared components** (`components/`) in their primary states (loading, success, error, empty) AND all **page-level components** (`app/*/page.tsx`) with their HTTP calls to `apiClient` intercepted at the network level via MSW running in Node.js handler mode, verifying that each page renders its key UI elements correctly across its primary states.
- **FR-004**: Tests MUST NOT make real network calls to external platforms (Steam, Xbox, PlayStation) or to the backend API from frontend tests. Backend platform boundaries must be replaced by test doubles in service unit tests; frontend `apiClient` HTTP calls must be intercepted by MSW handlers returning controlled fixture responses.
- **FR-005**: Developers MUST be able to run the full test suite with a single command from each project root (`backend/` and `frontend/`).
- **FR-006**: The test suite MUST produce a coverage report showing per-file and aggregate coverage percentages after each run.
- **FR-007**: The CI pipeline MUST automatically run both backend and frontend test suites on every pull request and block merge on any failure.
- **FR-008**: Each individual test MUST be independent: it must not rely on execution order, shared mutable state, or leftover data from other tests.
- **FR-009**: The backend test suite MUST verify that each API route returns the correct HTTP status codes for both successful requests and common error conditions (invalid input, missing resource, unauthorized).
- **FR-010**: The frontend test suite MUST verify that user-facing interactions (clicking sync, cancelling backup, selecting a profile) trigger the expected state changes in components.
- **FR-011**: Coverage thresholds MUST be enforced: tests fail if aggregate backend coverage drops below 70% or aggregate frontend coverage drops below 60%.
- **FR-012**: Test output MUST clearly identify which test failed and why, without requiring developers to inspect logs outside the test runner.
- **FR-013**: Browser-level end-to-end (E2E) tests (Playwright, Cypress, or equivalent) are explicitly **out of scope** for this feature. Regression protection is fully achieved through backend API integration tests and MSW-backed frontend component and page tests.

### Key Entities

- **Test Case**: A single, isolated, independently runnable verification of one unit of behavior. Belongs to either the backend or frontend suite. Has a pass/fail outcome and optional coverage contribution.
- **Test Suite**: A grouped collection of test cases for a specific layer (backend API, backend services, frontend components). Can be run independently or together.
- **Coverage Report**: A generated artifact showing which lines, branches, and functions were exercised during a test run. Aggregated per suite and per file.
- **Test Double (Mock/Stub/Fixture)**: A stand-in for an external dependency (platform API, file system, database) that returns controlled responses so tests remain deterministic.
- **CI Pipeline Step**: The automated execution of the test suite triggered by a pull request or commit, producing a pass/fail status that gates the merge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Backend test suite achieves at least 70% aggregate line coverage across API routes and service logic from the initial implementation.
- **SC-002**: Frontend test suite achieves at least 60% aggregate line coverage across components from the initial implementation.
- **SC-003**: The complete test suite (backend + frontend) finishes in under 5 minutes on a standard developer machine.
- **SC-004**: Tests pass consistently — zero flaky tests observed across 5 consecutive runs on the same codebase without changes.
- **SC-005**: Any change that breaks an existing covered behavior is detected as a failing test before the pull request is merged.
- **SC-006**: A developer unfamiliar with a module can run its tests and understand what the module is expected to do from the test descriptions alone.
- **SC-007**: CI pipeline status (pass/fail) is visible on every pull request with a direct link to the failing test output.

## Assumptions

- The project will adopt a test runner appropriate for each layer; no existing test infrastructure is present to migrate from.
- The backend suite is split into two distinct layers: (1) **unit tests** for service/utility logic with all external dependencies mocked, and (2) **API integration tests** that start the real Fastify server connected to an isolated test database and verify behavior end-to-end via HTTP. The frontend uses component tests only (no full browser/E2E tests in this scope).
- Test doubles for Steam, Xbox, and PlayStation APIs will be built using recorded real-response fixtures to stay realistic without live connectivity.
- The 70% backend and 60% frontend coverage thresholds are starting baselines to be raised incrementally as the suite matures.
- Backend API integration tests will use `mongodb-memory-server` to spin up a real, ephemeral MongoDB instance in-process. This requires no external database, Docker, or network access and works identically on developer machines and in CI.
- Browser-level E2E tests (Playwright, Cypress) are out of scope for this feature. They may be considered in a future feature once Xbox and PlayStation platform integrations stabilize.
