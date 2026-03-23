# Research: Regression Test Suite

**Phase**: 0 — Outline & Research  
**Date**: 2026-02-24  
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## Finding 1: Backend Test Runner — Vitest over Jest

**Decision**: Use **Vitest** for all backend tests.

**Rationale**:  
The backend package is `"type": "module"` (native ESM). Jest requires significant transformation config (`--experimental-vm-modules`, Babel or `ts-jest`) to handle ESM TypeScript and has a history of flaky interop with native ESM modules. Vitest is built on Vite/esbuild, handles ESM and TypeScript natively with zero extra configuration, and shares the same `vi.mock()` / `vi.spyOn()` API shape that Jest users already know. The project already uses `tsx` for dev (`tsx watch`), which confirms the team is comfortable with the esbuild/tsx toolchain that Vitest uses internally.

**Alternatives considered**:  
- Jest + `ts-jest`: Requires babel transform or `--experimental-vm-modules`; known incompatibilities with ESM packages in `node_modules`.  
- Node.js built-in test runner (`node:test`): No mock framework, no coverage provider, poor DX; not suitable for a comprehensive regression suite.

**Key configuration**:  
```ts
// backend/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      thresholds: { lines: 70, functions: 70, branches: 70 }
    }
  }
})
```

---

## Finding 2: MongoDB Isolation — `mongodb-memory-server` 10 + Mongoose 8

**Decision**: Use **`mongodb-memory-server` 10.x** for all backend API integration tests.

**Rationale**:  
`mongodb-memory-server` downloads and caches a real MongoDB binary, then spins it up in-process before tests and tears it down after. Because it runs a real MongoDB process (not a mock), all Mongoose queries, indexes, and aggregation pipelines execute exactly as they would in production. It requires no external database, Docker, or network access — making it zero-setup for new contributors and suitable for any CI environment with Node.js. The `DOWNLOAD_DIR` can be configured to a workspace-local cache to avoid re-downloads in CI.

**Alternatives considered**:  
- Separate `cpak-test` database on existing MongoDB instance: Requires every developer and every CI runner to have MongoDB accessible; breaks the zero-external-dependency goal.  
- Testcontainers (Docker): Requires Docker daemon running locally and in CI; adds ~30s startup overhead per run; heavier than needed for this scope.

**Setup pattern** (Mongoose 8 + mongodb-memory-server 10):  
```ts
// backend/tests/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterEach(async () => {
  // Clear all collections between tests
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})
```

**Fastify server factory** (prevents port conflicts and enables `inject()` for HTTP testing):  
```ts
// backend/tests/helpers/server.ts
import { buildServer } from '../../src/api/server.ts'
// Returns a Fastify instance with .inject() — no real port binding needed
export async function createTestServer() {
  const app = await buildServer()
  await app.ready()
  return app
}
```
> **Note**: `server.ts` must export a `buildServer()` factory. If the current `server.ts` only has a top-level `listen()` call, it needs to be refactored to export a factory function. This is the only production code change required by this feature.

---

## Finding 3: Frontend Test Runner — Vitest + React Testing Library + jsdom

**Decision**: Use **Vitest + @testing-library/react + jsdom** for all frontend component and page tests.

**Rationale**:  
Next.js 15 projects can be tested with either Jest (via `jest-environment-jsdom`) or Vitest. Vitest is preferred for consistency with the backend toolchain (single `vitest` version to maintain). React Testing Library 16.x supports React 19. The jsdom environment simulates a browser DOM without requiring a real browser process, keeping tests fast and CI-portable. Next.js App Router page components that use `use client` are compatible with RTL + jsdom as long as navigation, routing, and data fetching are controlled (handled by MSW + mocked `next/navigation`).

**Alternatives considered**:  
- Jest + `jest-environment-jsdom`: Would work but introduces a second test runner; inconsistent DX with backend tests; known issues with some React 19 APIs.  
- Playwright component tests: Requires browser binaries; E2E explicitly out of scope per clarification.

**Key configuration**:  
```ts
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['components/**/*.tsx', 'app/**/*.tsx'],
      thresholds: { lines: 60, functions: 60, branches: 60 }
    }
  }
})
```

---

## Finding 4: Frontend HTTP Interception — MSW 2.x Node.js Handler Mode

**Decision**: Use **MSW 2.x** (`msw/node`) for intercepting all `apiClient` HTTP calls in frontend tests.

**Rationale**:  
MSW 2 introduced a stable Node.js request interception API (`setupServer` from `msw/node`) that intercepts `fetch` and `XMLHttpRequest` calls at the network layer, below the module boundary. This is more realistic than module mocking (`vi.mock('services/apiClient')`) because it verifies that the component calls the correct URL and method, not just that it calls a function. A single shared `handlers.ts` file defines all fixture responses and is reused across component tests and page tests, reducing duplication. MSW 2 dropped the browser service worker requirement for Node.js environments, making setup lightweight.

**Alternatives considered**:  
- Manual module mock (`vi.mock('services/apiClient')`): Faster to set up, but only intercepts at the import level; does not catch wrong URLs or HTTP methods; fixture reuse across files is awkward.  
- `nock`: HTTP interception for Node.js, but only intercepts `http`/`https` Node.js core modules; does not intercept `fetch` which Next.js and the browser use natively.

**Setup pattern**:  
```ts
// frontend/tests/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/handlers'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```ts
// frontend/tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('/api/games', () => HttpResponse.json({ games: [] })),
  http.get('/api/profiles', () => HttpResponse.json({ profiles: [] })),
  // ... one handler per apiClient endpoint
)
```

---

## Finding 5: CI Integration — GitHub Actions Test Jobs

**Decision**: Add `test-backend` and `test-frontend` jobs to the existing `build.yml` workflow.

**Rationale**:  
The project already uses GitHub Actions (`build.yml`) with `build-backend` and `build-frontend` jobs. Adding parallel `test-backend` and `test-frontend` jobs to the same workflow ensures tests run on every PR and push to `main`. Using separate jobs (not steps in the build jobs) allows them to fail independently with clear labeling and run in parallel to minimize total CI time. Coverage artifacts can be uploaded as workflow artifacts for later reference. No new CI secrets or environment variables are needed since tests use `mongodb-memory-server` and MSW — no live services required.

**Job structure** (to be added to `.github/workflows/build.yml`):  
```yaml
test-backend:
  name: Test Backend
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm', cache-dependency-path: backend/package-lock.json }
    - run: npm ci
      working-directory: backend
    - run: npm test -- --coverage
      working-directory: backend

test-frontend:
  name: Test Frontend
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: '20', cache: 'npm', cache-dependency-path: frontend/package-lock.json }
    - run: npm ci
      working-directory: frontend
    - run: npm test -- --coverage
      working-directory: frontend
```

---

## Finding 6: `server.ts` Refactor Requirement

**Decision**: `backend/src/api/server.ts` must export a `buildServer()` factory function.

**Rationale**:  
Fastify best practice for testability is to separate server construction (which sets up routes, plugins, and middleware) from server startup (`listen()`). If `server.ts` currently calls `fastify.listen()` at module load time, importing it in tests will attempt to bind a port, which causes conflicts when running multiple test files in parallel. Exporting a `buildServer()` factory solves this cleanly and is the standard Fastify testing pattern. This is the **only production code change** required to enable testing — all other changes are additive (new test files and config).

**Pattern**:  
```ts
// server.ts (refactored export)
export async function buildServer() {
  const app = fastify({ logger: false })
  await app.register(/* routes, plugins */)
  return app
}

// Entry point (unchanged behavior)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildServer()
  await app.listen({ port: 8080, host: '0.0.0.0' })
}
```
