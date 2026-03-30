# Implementation Plan: Game Visualization Modes & Image Management

**Branch**: `007-game-visualization-modes` | **Date**: 2026-03-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/007-game-visualization-modes/spec.md`

## Summary

Add three game visualization modes (Capsule/Grid, List, Hero) to all platform pages with multi-type image downloading (icon 64×64, hero 1920×620, capsule 600×900) from platform CDNs and optional SteamGridDB. Include server-side game search, user-editable game titles and images, and a database migration from single `imagePath` to three separate image path fields.

## Technical Context

**Language/Version**: TypeScript 5.x (Node 20), React 19  
**Primary Dependencies**: Fastify 5.2, Next.js 15.1, Mongoose 8.9, Sharp 0.32, Tailwind CSS 3.4  
**Storage**: MongoDB 8+ (bundled in unified container), file system for images (`/app/data/images/`)  
**Testing**: Vitest 4 + Testing Library + MSW (frontend), Vitest 4 + mongodb-memory-server (backend); 60% line coverage threshold  
**Target Platform**: Unified Docker container (x86_64 + arm64), served via Caddy reverse proxy  
**Project Type**: Web application (backend + frontend)  
**Performance Goals**: View mode switch <1s, search response <500ms, sync time increase <50%  
**Constraints**: Image uploads max 10MB, parallel image downloads per-game, SteamGridDB optional (only when API key configured)  
**Scale/Scope**: Hundreds to thousands of games per library, 3 platform pages (Steam, Xbox, PlayStation)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-Design | Post-Design | Notes |
|---|-----------|------------|-------------|-------|
| I | Unified Container Frontend | ✅ PASS | ✅ PASS | Next.js standalone mode unchanged. New components extend existing frontend. No new server processes. |
| II | REST Backend with Database-Backed Settings | ✅ PASS | ✅ PASS | New `search` param and `PATCH` endpoints follow existing REST patterns. No new env vars. Game model changes in MongoDB `games` collection. |
| III | Self-Hosting via Unified Container | ✅ PASS | ✅ PASS | No new container components. Images stored in existing `/app/data/images/` volume. No new ports or processes. |
| IV | Security with Encrypted Settings | ✅ PASS | ✅ PASS | Image uploads validated (10MB max, format check) at system boundary. Regex search input escaped to prevent ReDoS. No new secrets. |
| V | Observability & Operations | ✅ PASS | ✅ PASS | No new operational requirements. Existing structured logging covers new endpoints. |
| VI | Test Coverage by Default | ✅ PASS | ✅ PASS | 5 new frontend components require 5 new test files. Modified backend files (imageStorage, game model, routes, adapters) require updated tests. 60% line coverage maintained. |

**GATE RESULT**: ✅ All principles pass pre- and post-design. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/007-game-visualization-modes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   └── game.ts                      # MODIFY: Add iconPath, heroImagePath, capsuleImagePath, customTitle fields
│   ├── migrations/
│   │   └── 007-game-image-fields.ts     # NEW: Migration script for imagePath → capsuleImagePath
│   ├── services/
│   │   └── adapters/
│   │       ├── steam.ts                 # MODIFY: Download icon + hero images from Steam CDN
│   │       ├── xbox.ts                  # MODIFY: Download icon + hero images from Xbox/Emerald CDN
│   │       ├── playstation.ts           # MODIFY: Download icon + hero images
│   │       └── steamgriddb.ts           # MODIFY: Add getIconImages() method
│   ├── api/
│   │   └── routes/
│   │       ├── games.ts                 # MODIFY: Add search param, PATCH for title/image edit
│   │       └── icons.ts                 # MODIFY (if needed): Ensure new image types are served
│   └── utils/
│       └── imageStorage.ts              # MODIFY: Add resize logic for icon (64×64) and hero (1920×620)
└── tests/
    ├── unit/
    │   └── imageStorage.test.ts         # MODIFY: Add tests for icon/hero resize
    └── integration/
        └── routes/
            └── games.test.ts            # MODIFY: Add search & PATCH tests

frontend/
├── components/
│   ├── GameGrid.tsx                     # MODIFY: Support view mode prop, render List/Hero layouts
│   ├── GameTile.tsx                     # MODIFY: Support capsule rendering (current behavior extracted)
│   ├── GameListItem.tsx                 # NEW: List view row component (icon + title + stats)
│   ├── GameHeroCard.tsx                 # NEW: Hero view card component (wide banner + title overlay)
│   ├── ViewModeSelector.tsx             # NEW: Toggle between Capsule/List/Hero modes
│   ├── GameSearchInput.tsx              # NEW: Debounced search input component
│   └── GameEditModal.tsx                # NEW: Modal for editing title + uploading images
├── app/
│   ├── steam/page.tsx                   # MODIFY: Add view mode selector + search input
│   ├── xbox/page.tsx                    # MODIFY: Add view mode selector + search input
│   └── playstation/page.tsx             # MODIFY: Add view mode selector + search input
└── tests/
    ├── components/
    │   ├── GameListItem.test.tsx         # NEW
    │   ├── GameHeroCard.test.tsx         # NEW
    │   ├── ViewModeSelector.test.tsx     # NEW
    │   ├── GameSearchInput.test.tsx      # NEW
    │   └── GameEditModal.test.tsx        # NEW
    └── pages/
        └── (existing page tests updated)
```

**Structure Decision**: Follows existing web application structure (backend/ + frontend/) per constitution principles I and III. No new projects or services added.
