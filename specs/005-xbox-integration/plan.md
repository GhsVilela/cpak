# Implementation Plan: Xbox Integration

**Branch**: `005-xbox-integration` | **Date**: 2026-02-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-xbox-integration/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add full Xbox integration to cpak — Xbox Live OAuth authentication via `@xboxreplay/xboxlive-auth`, game and achievement sync using Xbox REST APIs, image fetching with SteamGridDB name-search fallback, a refactored add-profile page with platform selection, and console generation filtering (Xbox 360 / Xbox One / Xbox Series X|S / PC). Leverages the existing platform-agnostic architecture (models, components, image storage) with one minor schema addition.

## Technical Context

**Language/Version**: TypeScript 5.7+, Node.js 20+  
**Primary Dependencies**: Fastify 5, Mongoose 8, Next.js 15, React 19, `@xboxreplay/xboxlive-auth` 5.x (new)  
**Storage**: MongoDB 8+ (existing collections: profiles, games, achievements, settings, syncoperations, syncruns)  
**Testing**: Vitest 4, mongodb-memory-server (backend), Testing Library + MSW (frontend)  
**Target Platform**: Unified Docker container (Linux x86_64/arm64)  
**Project Type**: Web application (backend + frontend monorepo)  
**Performance Goals**: Sync 500 games in <15 minutes, image local-first with network fallback, 90%+ image coverage  
**Constraints**: Zero new environment variables (settings stored in MongoDB), one minor schema addition (`devices` field on Game model for console generation filtering), existing adaptive batch/rate-limit infrastructure reused  
**Scale/Scope**: 50-500 games per profile, 500-25,000 achievements, 10-500MB images on disk per profile

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Unified Container Frontend | PASS | No new services. Xbox adapter is a backend module within existing Fastify app. Next.js standalone mode unchanged. |
| II | REST Backend with DB-Backed Settings | PASS | New Xbox OAuth settings (`xbox_client_id`, `xbox_client_secret`) stored in MongoDB `settings` collection, configurable via Settings UI. No environment variable fallbacks for application settings. New routes follow REST conventions (`/api/auth/xbox/*`). |
| III | Self-Hosting via Unified Container | PASS | Zero new mandatory environment variables. Xbox OAuth credentials configured via web UI. Single container deployment unchanged. |
| IV | Security with Encrypted Settings | PASS | Xbox refresh tokens encrypted at rest using existing AES-256-GCM encryption (when `ENCRYPTION_KEY` set). Client secret stored encrypted in settings collection. No secrets hardcoded or in env vars. |
| V | Observability & Operations | PASS | Structured logging for Xbox sync operations via existing pino logger. Xbox sync operations tracked in `syncoperations` collection. Health/readiness endpoints unchanged. |
| VI | Test Coverage by Default | PASS | Plan includes: backend unit tests for Xbox adapter (`backend/tests/unit/services/adapters/xbox.test.ts`), integration tests for auth routes (`backend/tests/integration/routes/auth.test.ts`), frontend page tests for updated setup page and Xbox game detail page. |

**Post-Phase 1 Re-check**: All gates still PASS. No violations introduced by design decisions.

## Project Structure

### Documentation (this feature)

```text
specs/005-xbox-integration/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: API research, auth approach, library selection
├── data-model.md        # Phase 1: Entity mapping (no schema changes)
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/           # Phase 1: API contracts
│   ├── xbox-auth-api.md # New OAuth routes
│   └── xbox-sync-api.md # Sync flow, SteamGridDB enhancement
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.ts              # NEW: Xbox OAuth routes (/api/auth/xbox/*)
│   │   │   ├── profiles.ts          # MODIFIED: Updated Zod schema for Xbox credentials
│   │   │   ├── sync.ts              # EXISTING: Already supports /sync/xbox
│   │   │   └── index.ts             # MODIFIED: Register auth routes
│   │   └── middleware/
│   ├── services/
│   │   ├── adapters/
│   │   │   ├── xbox.ts              # NEW: Xbox Live API adapter (auth, games, achievements)
│   │   │   ├── steam.ts             # EXISTING: No changes
│   │   │   └── steamgriddb.ts       # MODIFIED: Add searchGameByName(), downloadGameImageByName()
│   │   ├── syncService.ts           # MODIFIED: Add syncXbox() method
│   │   ├── scheduler.ts             # EXISTING: Already syncs all profiles (auto-includes Xbox)
│   │   └── configService.ts         # EXISTING: No changes needed
│   ├── models/                      # ONE CHANGE: game.ts adds `devices` field
│   │   └── game.ts                  # MODIFIED: Add optional `devices: string[]` field
│   └── utils/
│       ├── imageStorage.ts          # EXISTING: Already platform-namespaced
│       └── rateLimiter.ts           # EXISTING: Already has 'xbox' config
└── tests/
    ├── unit/
    │   └── services/
    │       └── adapters/
    │           └── xbox.test.ts     # NEW: Xbox adapter unit tests
    └── integration/
        └── routes/
            └── auth.test.ts         # NEW: Xbox OAuth route tests

frontend/
├── app/
│   ├── setup/
│   │   └── page.tsx                 # MODIFIED: Platform selector + Xbox OAuth flow
│   ├── xbox/
│   │   ├── page.tsx                 # MODIFIED: Full page with ProfileSelector, sync controls, GameGrid
│   │   └── game/
│   │       └── [id]/
│   │           └── page.tsx         # NEW: Xbox game detail page (achievements view)
│   └── settings/
│       └── page.tsx                 # MODIFIED: Xbox settings section (client ID, client secret)
├── components/                      # EXISTING: All platform-generic, no changes needed
└── tests/
    ├── pages/
    │   ├── setup.test.tsx           # MODIFIED: Test platform selector + Xbox flow
    │   ├── xbox.test.tsx            # MODIFIED: Test full Xbox page with sync controls
    │   └── xboxGame.test.tsx        # NEW: Xbox game detail page tests
    └── mocks/
        └── handlers.ts             # MODIFIED: Add Xbox API mock handlers
```

**Structure Decision**: Web application (backend + frontend). Uses existing directory structure. New files are minimal — the platform-agnostic architecture means most existing code works for Xbox without modification.

## Files Changed Summary

### New Files (9)

| File | Description |
|---|---|
| `backend/src/services/adapters/xbox.ts` | Xbox Live API adapter: OAuth token management, game fetching, achievement fetching, profile lookup |
| `backend/src/api/routes/auth.ts` | Xbox OAuth routes: `/api/auth/xbox/url`, `/api/auth/xbox/callback`, `/api/auth/xbox/refresh` |
| `backend/tests/unit/services/adapters/xbox.test.ts` | Unit tests for Xbox adapter |
| `backend/tests/integration/routes/auth.test.ts` | Integration tests for Xbox OAuth routes |
| `frontend/app/xbox/game/[id]/page.tsx` | Xbox game detail page with achievement list |
| `frontend/tests/pages/xboxGame.test.tsx` | Tests for Xbox game detail page |
| `specs/005-xbox-integration/research.md` | Research document |
| `specs/005-xbox-integration/data-model.md` | Data model document |
| `specs/005-xbox-integration/quickstart.md` | Developer quickstart guide |

### Modified Files (10)

| File | Change |
|---|---|
| `backend/src/services/adapters/steamgriddb.ts` | Add `searchGameByName()`, `downloadGameImageByName()` methods |
| `backend/src/models/game.ts` | Add optional `devices: string[]` field + index for console generation filtering |
| `backend/src/services/syncService.ts` | Add `syncXbox()` method (~300 lines, mirrors `syncSteam()` structure) |
| `backend/src/api/routes/profiles.ts` | Extend Zod schema for Xbox OAuth credential fields |
| `backend/src/api/routes/index.ts` | Register new `/auth` route plugin |
| `backend/package.json` | Add `@xboxreplay/xboxlive-auth` dependency |
| `frontend/app/setup/page.tsx` | Refactor: platform card selector + Xbox OAuth login button |
| `frontend/app/xbox/page.tsx` | Upgrade from placeholder to full page (ProfileSelector, sync, GameGrid) |
| `frontend/app/settings/page.tsx` | Add Xbox OAuth settings fields (Client ID, Client Secret) |
| `frontend/tests/mocks/handlers.ts` | Add MSW handlers for Xbox API endpoints |

### Updated Test Files (3)

| File | Change |
|---|---|
| `frontend/tests/pages/setup.test.tsx` | Test platform selector, Xbox OAuth button |
| `frontend/tests/pages/xbox.test.tsx` | Test full Xbox page with sync controls, profile selector |
| `frontend/tests/pages/settings.test.tsx` | Test Xbox settings section (if applicable) |

## Complexity Tracking

> No constitution violations — table not required.
