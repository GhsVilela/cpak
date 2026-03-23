# Data Model: Regression Test Suite

**Phase**: 1 — Design & Contracts  
**Date**: 2026-02-24  
**Feature**: [spec.md](spec.md)

> This feature introduces no new MongoDB collections or domain entities. It adds **test infrastructure** — configuration files, test helper utilities, and CI workflow steps. The entities below describe the test infrastructure model.

---

## Entity 1: BackendTestSuite

Represents the collection of all automated tests for the backend Node.js application.

| Attribute | Value |
|-----------|-------|
| Location | `backend/tests/` |
| Runner | Vitest |
| Environment | `node` |
| Sub-layers | `unit/` (mocked dependencies), `integration/` (real server + mongodb-memory-server) |
| Config file | `backend/vitest.config.ts` |
| npm script | `npm test` |
| Coverage threshold | 70% lines, functions, branches |
| Coverage provider | `@vitest/coverage-v8` |

### Sub-entity: BackendUnitTest

A single test case that exercises one isolated function or class with all external dependencies replaced by `vi.mock()` or `vi.spyOn()`.

| Attribute | Value |
|-----------|-------|
| Target modules | `src/services/*.ts`, `src/utils/*.ts` |
| External dependencies mocked | Mongoose models, node-cron, axios/fetch calls to platform APIs, filesystem |
| Location | `backend/tests/unit/services/`, `backend/tests/unit/utils/` |

### Sub-entity: BackendAPIIntegrationTest

A test case that sends an HTTP request to a running Fastify test server connected to `mongodb-memory-server` and asserts the HTTP response status and body.

| Attribute | Value |
|-----------|-------|
| Target modules | `src/api/routes/*.ts` |
| Server factory | `backend/tests/helpers/server.ts` (wraps `buildServer()`) |
| Database | `mongodb-memory-server` instance started in `tests/setup.ts` |
| HTTP client | Fastify `app.inject()` — no real network binding required |
| Location | `backend/tests/integration/routes/` |

---

## Entity 2: FrontendTestSuite

Represents the collection of all automated tests for the Next.js frontend application.

| Attribute | Value |
|-----------|-------|
| Location | `frontend/tests/` |
| Runner | Vitest |
| Environment | `jsdom` |
| Plugin | `@vitejs/plugin-react` |
| Sub-layers | `components/` (shared components), `pages/` (Next.js app pages) |
| Config file | `frontend/vitest.config.ts` |
| npm script | `npm test` |
| Coverage threshold | 60% lines, functions, branches |
| Coverage provider | `@vitest/coverage-v8` |

### Sub-entity: ComponentTest

A test case that renders a single shared component from `components/` using React Testing Library and asserts its rendered output and user interaction behavior.

| Attribute | Value |
|-----------|-------|
| Target modules | `components/*.tsx` (all 12 components) |
| DOM environment | jsdom |
| HTTP interception | MSW `server` from `tests/mocks/handlers.ts` (where components fetch data) |
| Location | `frontend/tests/components/` |

### Sub-entity: PageTest

A test case that renders a Next.js `app/*/page.tsx` file using React Testing Library and asserts that key page elements render correctly across primary states (loading, success, error, empty).

| Attribute | Value |
|-----------|-------|
| Target modules | `app/page.tsx`, `app/steam/page.tsx`, `app/playstation/page.tsx`, `app/xbox/page.tsx`, `app/settings/page.tsx`, `app/setup/page.tsx`, `app/steam/game/[id]/page.tsx` |
| HTTP interception | MSW handlers (all `apiClient` calls intercepted; `onUnhandledRequest: 'error'`) |
| Next.js mocks | `next/navigation` (`useRouter`, `usePathname`) mocked via `vi.mock('next/navigation')` |
| Location | `frontend/tests/pages/` |

---

## Entity 3: MSWHandlerRegistry

The central registry of MSW request handlers that define fixture responses for all `apiClient` endpoints.

| Attribute | Value |
|-----------|-------|
| Location | `frontend/tests/mocks/handlers.ts` |
| Exports | `server` (MSW Node.js server instance) |
| Endpoints covered | All routes exposed by the backend API (see contracts/test-command-interface.md) |
| Override mechanism | Per-test `server.use(http.get(...))` calls to override default handlers for error/empty states |
| Validation | `onUnhandledRequest: 'error'` — any uncaught request causes the test to fail, catching missing handlers early |

---

## Entity 4: TestSetupFile

A Vitest setup file that runs before all tests in a suite to initialize shared infrastructure.

### BackendSetupFile (`backend/tests/setup.ts`)

| Attribute | Value |
|-----------|-------|
| Lifecycle | `beforeAll` — starts `MongoMemoryServer`, connects Mongoose; `afterEach` — clears all collections; `afterAll` — disconnects Mongoose, stops MongoMemoryServer |
| Side effects | Overrides `MONGO_URI` env variable in the test process so `configService` uses the in-memory instance |

### FrontendSetupFile (`frontend/tests/setup.ts`)

| Attribute | Value |
|-----------|-------|
| Lifecycle | `beforeAll` — calls `server.listen({ onUnhandledRequest: 'error' })`; `afterEach` — calls `server.resetHandlers()`; `afterAll` — calls `server.close()` |
| Additional setup | `@testing-library/jest-dom` matchers imported for `.toBeInTheDocument()` etc. |

---

## Entity 5: CIPipelineTestJob

A GitHub Actions job step that runs the test suite for one workspace and reports pass/fail to the pull request.

| Attribute | Value |
|-----------|-------|
| Workflow file | `.github/workflows/build.yml` |
| Jobs to add | `test-backend`, `test-frontend` |
| Trigger | Same as existing jobs: `push` to `main`/`master`, any `pull_request` |
| Blocking | Merge is blocked if either job fails (default GitHub branch protection behavior) |
| Coverage artifacts | Uploaded as workflow artifacts (`lcov` reports) for optional external consumption |

---

## State Transitions

### Test Run Lifecycle

```
Idle
  ↓  npm test (or CI trigger)
Bootstrapping (setup.ts — start MongoDB / MSW server)
  ↓
Running Tests (parallel Vitest workers)
  ↓
Collecting Coverage (v8 provider)
  ↓
Checking Thresholds (70% backend / 60% frontend)
  ↓ pass                    ↓ fail
Exit 0 (CI green)      Exit 1 (CI red, merge blocked)
```

---

## Validation Rules

| Rule | Description |
|------|-------------|
| **VR-001** | Each test file must import and use the shared setup file lifecycle; no test may create its own MongoDB or MSW instance independently. |
| **VR-002** | Test fixtures must use synthetic data only (fake IDs, fake API keys). No production credentials or real user data may appear in any test file. |
| **VR-003** | `onUnhandledRequest: 'error'` must remain active in `FrontendSetupFile`; handlers must not be silenced globally. |
| **VR-004** | Coverage thresholds are enforced in `vitest.config.ts`; they must not be disabled or lowered without a documented decision. |
| **VR-005** | `buildServer()` factory in `backend/src/api/server.ts` must not call `listen()` when invoked — it must return a ready Fastify instance only. The entry-point `listen()` call must be guarded by an `import.meta.url` check. |
