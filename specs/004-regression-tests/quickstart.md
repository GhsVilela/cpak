# Quickstart: Regression Test Suite

**Phase**: 1 — Design & Contracts  
**Date**: 2026-02-24  
**Feature**: [spec.md](spec.md)

---

## Prerequisites

- Node.js 20+ installed
- `npm ci` run in both `backend/` and `frontend/` (or `npm install` for first-time setup)
- No external services, Docker, or database required

---

## Run Backend Tests

```bash
cd backend

# Run all tests (unit + integration)
npm test

# Run with coverage report
npm test -- --coverage

# Run only unit tests
npm test -- tests/unit

# Run only API integration tests
npm test -- tests/integration

# Watch mode (local development)
npm test -- --watch
```

**Expected output** (all passing):
```
✓ tests/unit/services/syncService.test.ts (12)
✓ tests/unit/services/scheduler.test.ts (8)
✓ tests/integration/routes/games.test.ts (6)
...
Test Files  X passed
Tests       X passed
Coverage: lines ≥ 70% ✓
```

---

## Run Frontend Tests

```bash
cd frontend

# Run all tests (components + pages)
npm test

# Run with coverage report
npm test -- --coverage

# Run only shared component tests
npm test -- tests/components

# Run only page tests
npm test -- tests/pages

# Watch mode (local development)
npm test -- --watch
```

**Expected output** (all passing):
```
✓ tests/components/GameGrid.test.tsx (5)
✓ tests/components/SyncStatus.test.tsx (4)
✓ tests/pages/steam.test.tsx (4)
...
Test Files  X passed
Tests       X passed
Coverage: lines ≥ 60% ✓
```

---

## Run Both Suites

```bash
# From repository root — run sequentially
(cd backend && npm test) && (cd frontend && npm test)
```

---

## Writing a New Test

### Backend unit test (service)

```ts
// backend/tests/unit/services/rateLimiter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimiter } from '../../../src/services/rateLimiter.ts'

describe('RateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 })
    for (let i = 0; i < 5; i++) {
      expect(await limiter.acquire()).toBe(true)
    }
  })

  it('blocks requests over the limit', async () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 })
    await limiter.acquire()
    await limiter.acquire()
    expect(await limiter.acquire()).toBe(false)
  })
})
```

### Backend API integration test (route)

```ts
// backend/tests/integration/routes/games.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestServer } from '../../helpers/server.ts'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => { app = await createTestServer() })
afterAll(async () => { await app.close() })

describe('GET /api/games', () => {
  it('returns 200 with empty array when no games exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ games: [] })
  })

  it('returns 400 for invalid query parameters', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games?limit=notanumber' })
    expect(res.statusCode).toBe(400)
  })
})
```

### Frontend component test

```tsx
// frontend/tests/components/SyncStatus.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncStatus } from '../../components/SyncStatus.tsx'

describe('SyncStatus', () => {
  it('shows idle status', () => {
    render(<SyncStatus status="idle" />)
    expect(screen.getByText(/idle/i)).toBeInTheDocument()
  })

  it('shows error message when status is error', () => {
    render(<SyncStatus status="error" message="Connection failed" />)
    expect(screen.getByText(/connection failed/i)).toBeInTheDocument()
  })
})
```

### Frontend page test (with MSW override)

```tsx
// frontend/tests/pages/steam.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/handlers.ts'
import SteamPage from '../../app/steam/page.tsx'

describe('Steam page', () => {
  it('shows empty state when no games', async () => {
    // MSW default handler already returns []
    render(<SteamPage />)
    await waitFor(() => expect(screen.getByText(/no games/i)).toBeInTheDocument())
  })

  it('shows error when API fails', async () => {
    server.use(
      http.get('/api/games', () => HttpResponse.json({ error: 'fail' }, { status: 500 }))
    )
    render(<SteamPage />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
```

---

## New Dependencies to Install

### Backend

```bash
cd backend
npm install -D vitest @vitest/coverage-v8 mongodb-memory-server
```

### Frontend

```bash
cd frontend
npm install -D vitest @vitest/coverage-v8 @vitejs/plugin-react \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  jsdom msw
```

---

## CI

Tests run automatically in GitHub Actions on every push and pull request. No manual trigger needed.  
See [contracts/test-command-interface.md](contracts/test-command-interface.md) for CI job structure and branch protection setup.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `MongoMemoryServer` binary download fails in CI | First-run download; should self-resolve with cache configured | Set `MONGOMS_DOWNLOAD_DIR` to a cached workspace path in CI |
| `Error: Cannot find module 'mongodb-memory-server'` | Not installed | `npm install -D mongodb-memory-server` in `backend/` |
| MSW `onUnhandledRequest: 'error'` fails a test | Component makes an API call with no matching handler | Add the missing endpoint to `frontend/tests/mocks/handlers.ts` |
| Coverage threshold fails | New code added without tests | Write tests for the new code or temporarily lower threshold with documented justification |
| `app.listen() called during test` | `server.ts` not refactored to export `buildServer()` | Export factory function and guard `listen()` with `import.meta.url` check (see [research.md](research.md#finding-6)) |
