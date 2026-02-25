# Implementation Plan: Regression Test Suite

**Branch**: `004-regression-tests` | **Date**: 2026-02-24 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `/specs/004-regression-tests/spec.md`

## Summary

Add a regression test suite covering backend API routes, service logic, and frontend components/pages to prevent breaking changes as Xbox and PlayStation integration work continues. The backend uses Vitest with two distinct layers — unit tests (all external dependencies mocked) and API integration tests (real Fastify server + `mongodb-memory-server`). The frontend uses Vitest + React Testing Library + jsdom, with MSW 2.x intercepting `apiClient` HTTP calls at the network level. GitHub Actions CI runs both suites on every pull request and blocks merge on failure.

## Technical Context

**Language/Version**: TypeScript 5.9 (backend ESM, `"type": "module"`); TypeScript 5.9 (frontend Next.js 15)  
**Primary Dependencies**: Backend — Fastify 5, Mongoose 8, node-cron 4, Zod 3; Frontend — Next.js 15, React 19, Tailwind CSS 3  
**Storage**: MongoDB 8 (bundled or external); `mongodb-memory-server` 10 for test isolation  
**Testing**: Vitest (backend unit + API integration); Vitest + React Testing Library + jsdom (frontend); MSW 2.x (frontend HTTP interception); GitHub Actions (CI)  
**Target Platform**: Node.js 20, runs locally and in GitHub Actions ubuntu-latest  
**Project Type**: Web application — separate `backend/` and `frontend/` workspaces  
**Performance Goals**: Full test suite completes in under 5 minutes on a standard developer machine  
**Constraints**: No real network calls to external platforms; no Docker or external services required to run tests; each test must be independent of execution order  
**Scale/Scope**: 10 API route files, ~7 service files, 12 shared components, ~7 page files — approximately 100–150 individual test cases in initial implementation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status | Notes |
|-----------|------|--------|-------|
| I. Unified Container Frontend | Tests must not change Next.js deployment mode or add browser processes to the container | ✅ PASS | Tests run outside the container; no production code changes required |
| II. REST Backend with Database-Backed Settings | Tests must not read application settings from environment variables | ✅ PASS | `mongodb-memory-server` replaces the DB connection; no env var settings access in tests |
| III. Self-Hosting via Unified Container | Test infrastructure must not add new required services to the production container | ✅ PASS | Test tooling (`vitest`, `msw`, `mongodb-memory-server`) are `devDependencies` only |
| IV. Security with Encrypted Settings | Tests must not expose secrets or hardcode credentials | ✅ PASS | All credentials in test fixtures are synthetic/fake values; no production DB access |
| V. Observability & Operations | CI pipeline step must produce clear pass/fail output visible on PRs | ✅ PASS | GitHub Actions already wired; test jobs will emit structured output |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/004-regression-tests/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── test-command-interface.md  ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/                          ← existing source (unchanged)
│   ├── api/routes/               ← covered by API integration tests
│   ├── services/                 ← covered by unit tests
│   └── utils/                   ← covered by unit tests
├── tests/
│   ├── setup.ts                  ← shared Vitest setup (mongodb-memory-server lifecycle)
│   ├── helpers/
│   │   └── server.ts             ← Fastify test server factory
│   ├── unit/
│   │   ├── services/             ← one file per service (syncService, scheduler, etc.)
│   │   └── utils/               ← one file per util (crypto, config, etc.)
│   └── integration/
│       └── routes/               ← one file per route module (games, profiles, sync, etc.)
├── vitest.config.ts
└── package.json                  ← add vitest, @vitest/coverage-v8, mongodb-memory-server

frontend/
├── app/                          ← existing pages (unchanged)
├── components/                   ← existing components (unchanged)
├── tests/
│   ├── setup.ts                  ← RTL + MSW server bootstrap
│   ├── mocks/
│   │   └── handlers.ts           ← MSW request handlers (all apiClient endpoints)
│   ├── components/               ← one file per shared component
│   └── pages/                    ← one file per page (steam, xbox, playstation, settings, setup)
├── vitest.config.ts
└── package.json                  ← add vitest, @testing-library/react, @testing-library/user-event, jsdom, msw

.github/workflows/
└── build.yml                     ← add test-backend and test-frontend jobs
```

**Structure Decision**: Web application layout (Option 2). Tests co-located in `tests/` under each workspace root, mirroring the source tree. Two distinct backend test layers (`unit/` and `integration/`) with a shared Vitest config that runs both.

## Complexity Tracking

> No constitution violations.
