# Contract: Test Command Interface

**Phase**: 1 — Design & Contracts  
**Date**: 2026-02-24  
**Feature**: [spec.md](../spec.md)

> This feature introduces no HTTP API changes. The "contract" is the developer-facing command interface for running tests and receiving coverage reports, and the CI pipeline status contract.

---

## Developer Command Interface

### Backend

All commands run from `backend/` directory.

| Command | Description | Exit Code |
|---------|-------------|-----------|
| `npm test` | Run all unit and integration tests once | 0 (pass) / 1 (fail or threshold breach) |
| `npm test -- --coverage` | Run all tests and emit coverage report to stdout + `coverage/lcov.info` | 0 / 1 |
| `npm test -- --watch` | Run tests in watch mode (local development only; not used in CI) | n/a |
| `npm test -- tests/unit` | Run only unit tests | 0 / 1 |
| `npm test -- tests/integration` | Run only API integration tests | 0 / 1 |

**Coverage threshold contract** (enforced by `vitest.config.ts`; violation causes exit code 1):

| Metric | Threshold |
|--------|-----------|
| Lines | ≥ 70% |
| Functions | ≥ 70% |
| Branches | ≥ 70% |
| Statements | ≥ 70% |

### Frontend

All commands run from `frontend/` directory.

| Command | Description | Exit Code |
|---------|-------------|-----------|
| `npm test` | Run all component and page tests once | 0 (pass) / 1 (fail or threshold breach) |
| `npm test -- --coverage` | Run all tests and emit coverage report to stdout + `coverage/lcov.info` | 0 / 1 |
| `npm test -- --watch` | Run tests in watch mode (local development only) | n/a |
| `npm test -- tests/components` | Run only shared component tests | 0 / 1 |
| `npm test -- tests/pages` | Run only page-level tests | 0 / 1 |

**Coverage threshold contract** (enforced by `vitest.config.ts`; violation causes exit code 1):

| Metric | Threshold |
|--------|-----------|
| Lines | ≥ 60% |
| Functions | ≥ 60% |
| Branches | ≥ 60% |
| Statements | ≥ 60% |

---

## Test Output Schema

Vitest stdout output per test run (text reporter):

```
✓ tests/unit/services/syncService.test.ts (12 tests) 45ms
✓ tests/unit/services/scheduler.test.ts (8 tests) 23ms
✓ tests/integration/routes/games.test.ts (6 tests) 312ms
...
Test Files  18 passed (18)
Tests       84 passed (84)
Duration    4.2s

Coverage:
File                           | % Stmts | % Branch | % Funcs | % Lines |
-------------------------------|---------|----------|---------|---------|
src/services/syncService.ts    |   78.4  |   72.1   |   80.0  |   78.4  |
...
All coverage thresholds met.
```

**Failure output contract** (when a test fails):

```
FAIL tests/integration/routes/games.test.ts > GET /api/games > returns 200 with game list
AssertionError: expected 404 to equal 200
  at tests/integration/routes/games.test.ts:24:5
```

Each failure line **must** include: test file path, test name, assertion that failed, and file:line location. This is the default Vitest output and requires no additional configuration.

---

## CI Pipeline Contract

### Workflow: `.github/workflows/build.yml`

**New jobs added**:

```
test-backend
  Runs on: ubuntu-latest
  Needs: (none — runs in parallel with build-backend)
  Steps:
    1. checkout
    2. setup-node (Node 20, npm cache)
    3. npm ci (backend/)
    4. npm test -- --coverage (backend/)
  On failure: job status = failure, PR check = failed, merge blocked

test-frontend
  Runs on: ubuntu-latest
  Needs: (none — runs in parallel with build-frontend)
  Steps:
    1. checkout
    2. setup-node (Node 20, npm cache)
    3. npm ci (frontend/)
    4. npm test -- --coverage (frontend/)
  On failure: job status = failure, PR check = failed, merge blocked
```

**PR status checks produced** (visible on every pull request):

| Check name | Pass condition |
|------------|---------------|
| `Test Backend` | All backend tests pass AND all coverage thresholds met |
| `Test Frontend` | All frontend tests pass AND all coverage thresholds met |

**Branch protection recommendation** (to be configured in GitHub repository settings):

- Require status checks to pass before merging: `Test Backend`, `Test Frontend`
- These checks join the existing `Build Backend` and `Build Frontend` checks already in `build.yml`

---

## MSW Handler Registry Contract

All MSW handlers are defined in `frontend/tests/mocks/handlers.ts`. Each registered handler covers one backend API endpoint used by the frontend. Adding a new `apiClient` call in production code **requires** a corresponding handler to be added; the `onUnhandledRequest: 'error'` policy enforces this automatically by failing any test that makes an unhandled request.

**Registered endpoints** (initial set, to be expanded as needed):

| Method | Path | Default fixture response |
|--------|------|--------------------------|
| GET | `/api/games` | `{ games: [] }` |
| GET | `/api/games/:id` | Game object fixture |
| GET | `/api/profiles` | `{ profiles: [] }` |
| POST | `/api/profiles` | Created profile fixture |
| GET | `/api/sync/status` | `{ status: 'idle' }` |
| POST | `/api/sync/start` | `{ jobId: 'mock-job-1' }` |
| GET | `/api/achievements` | `{ achievements: [] }` |
| GET | `/api/backup` | Backup list fixture |
| POST | `/api/backup` | `{ jobId: 'mock-backup-1' }` |
| GET | `/api/settings` | Settings fixture |
| PUT | `/api/settings` | Updated settings fixture |
| GET | `/api/health` | `{ status: 'ok' }` |

Per-test overrides use `server.use(http.get('/api/games', () => HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 })))` to simulate error states without modifying the shared registry.
