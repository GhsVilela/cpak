# Implementation Plan: PlayStation Integration

**Branch**: `006-playstation-integration` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/006-playstation-integration/spec.md`

## Summary

Add full PlayStation Network (PSN) integration to cpak, including NPSSO-based authentication with OAuth token exchange, game & trophy sync (with grade metadata: bronze/silver/gold/platinum), PlayStation CDN image fetching with multi-source fallback, trophy summary statistics per profile, game detail pages with trophy grade badges, console generation filtering (PS3/PS4/PS5/PS Vita), and hidden trophy resolution via third-party lookup. The implementation follows the established Xbox adapter pattern: a new `PlayStationAdapter` class, schema extensions for trophy grades and generation data on existing models, and frontend enhancements to the existing PlayStation page with a new game detail route.

## Technical Context

**Language/Version**: TypeScript (Node 20)
**Primary Dependencies**: Fastify 5+ (backend), Next.js 15+ (frontend), Mongoose (ODM), `psn-api` npm package (for PSN API access), Vitest (testing)
**Storage**: MongoDB (bundled or external) — existing collections: profiles, games, achievements, sync_operations, settings
**Testing**: Vitest + mongodb-memory-server (backend), Vitest + Testing Library + MSW (frontend)
**Target Platform**: Unified Docker container (Linux, x86_64 + arm64)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Sync progress updates within 1s; library page load <2s; trophy summary computed from precomputed fields (no aggregation queries)
**Constraints**: PSN API rate limits (unofficial API), NPSSO token ~24h lifespan exchanged for ~60-day refresh token, no official Sony SDK
**Scale/Scope**: Single-user self-hosted app, typical library: 50-500 games, 5000-50000 trophies

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Unified Container Frontend | ✅ PASS | PlayStation pages built in existing Next.js app; no new server processes |
| II. REST Backend with DB Settings | ✅ PASS | PSN credentials stored in settings collection via UI; no new env vars |
| III. Self-Hosting via Unified Container | ✅ PASS | No new deployment requirements; all config via web UI |
| IV. Security with Encrypted Settings | ✅ PASS | NPSSO/OAuth tokens encrypted using existing AES-256-GCM mechanism |
| V. Observability & Operations | ✅ PASS | Follows existing structured logging and sync tracking patterns |
| VI. Test Coverage by Default | ✅ PASS | Tests required for: adapter, routes, sync integration, frontend pages, game detail page; 60% coverage floor maintained |

**Gate Result**: ALL PASS — no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/006-playstation-integration/
├── plan.md              # This file
├── research.md          # Phase 0: PSN API research, npm packages, CDN patterns
├── data-model.md        # Phase 1: Schema extensions (Game, Achievement, Profile)
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/           # Phase 1: API contract definitions
│   └── api-contracts.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── achievement.ts          # MODIFY: add trophyGrade, isHidden fields
│   │   └── game.ts                 # MODIFY: add trophyBronze/Silver/Gold/Platinum fields
│   ├── services/
│   │   ├── adapters/
│   │   │   └── playstation.ts      # NEW: PlayStationAdapter class
│   │   └── syncService.ts          # MODIFY: add syncPlayStation() method
│   └── api/
│       └── routes/
│           └── auth.ts             # MODIFY: add PSN auth validation endpoint
└── tests/
    ├── unit/
    │   └── playstation-adapter.test.ts   # NEW
    └── integration/
        └── routes/
            └── playstation-sync.test.ts  # NEW

frontend/
├── app/
│   └── playstation/
│       ├── page.tsx                # MODIFY: add trophy summary, generation filter, sync controls
│       └── game/
│           └── [id]/
│               └── page.tsx        # NEW: game detail page with trophy grade badges
├── components/
│   └── TrophyGradeBadge.tsx        # NEW: reusable trophy grade badge component
└── tests/
    ├── pages/
    │   ├── playstation.test.tsx     # NEW or MODIFY
    │   └── playstation-game.test.tsx # NEW
    └── components/
        └── trophy-grade-badge.test.tsx # NEW
```

**Structure Decision**: Extends existing web application structure. No new projects, services, or deployment artifacts. All changes fit within the established backend/frontend split.
