# Quickstart: Game Visualization Modes & Image Management

**Feature**: `007-game-visualization-modes` | **Date**: 2026-03-30

## Prerequisites

- Node.js 20+
- Docker (for running MongoDB via mongodb-memory-server in tests, or local container)
- Git (on branch `007-game-visualization-modes`)

## Development Setup

```bash
# Backend
cd backend
npm install
npm run dev          # Starts Fastify on port 3001

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # Starts Next.js on port 3000
```

## Key Files to Modify

### Backend

| File | Change |
|------|--------|
| `backend/src/models/game.ts` | Add `capsuleImagePath`, `iconImagePath`, `heroImagePath`, `customTitle` fields. Remove `imagePath`. |
| `backend/src/utils/imageStorage.ts` | Add `hero` to ImageType. Add resize logic for icon (64×64) and hero (1920×620). |
| `backend/src/api/routes/games.ts` | Add `search` query param with `$regex`. Add `PATCH /:id` for title edit. Add `PATCH /:id/images/:imageType` for image upload. |
| `backend/src/services/adapters/steam.ts` | Add icon + hero download from Steam CDN alongside existing grid download. |
| `backend/src/services/adapters/xbox.ts` | Add icon + hero download from Emerald/Store API alongside existing grid download. |
| `backend/src/services/adapters/playstation.ts` | Add icon download from `trophyTitleIconUrl`. Add hero download from SteamGridDB. |
| `backend/src/services/adapters/steamgriddb.ts` | Add `getIconImages()` method. |
| `backend/src/migrations/007-game-image-fields.ts` | New migration: rename `imagePath` → `capsuleImagePath`. |

### Frontend

| File | Change |
|------|--------|
| `frontend/components/GameGrid.tsx` | Accept `viewMode` prop. Render different layouts per mode. |
| `frontend/components/GameTile.tsx` | Update to use `capsuleImagePath` instead of `imagePath`. |
| `frontend/components/GameListItem.tsx` | New component: List view row (icon + title + stats). |
| `frontend/components/GameHeroCard.tsx` | New component: Hero view card (wide banner + title overlay). |
| `frontend/components/ViewModeSelector.tsx` | New component: Capsule/List/Hero toggle. |
| `frontend/components/GameSearchInput.tsx` | New component: Debounced search input. |
| `frontend/components/GameEditModal.tsx` | New component: Modal for title/image editing. |
| `frontend/app/steam/page.tsx` | Add ViewModeSelector + GameSearchInput to page. |
| `frontend/app/xbox/page.tsx` | Add ViewModeSelector + GameSearchInput to page. |
| `frontend/app/playstation/page.tsx` | Add ViewModeSelector + GameSearchInput to page. |

## Running Tests

```bash
# Backend tests
cd backend
npm run test                    # Run all tests
npm run test -- --coverage      # Run with coverage (must stay ≥60% lines)

# Frontend tests
cd frontend
npm run test                    # Run all tests
npm run test -- --coverage      # Run with coverage (must stay ≥60% lines)
```

## Verification Steps

1. **Migration**: Run the migration script, verify all games have `capsuleImagePath` and no `imagePath`.
2. **Image Download**: Trigger a sync for any platform. Verify three image files created per game in `/app/data/images/{platform}/{gameId}/`.
3. **View Modes**: Navigate to any platform page. Switch between Capsule, List, Hero. Verify correct images display.
4. **Search**: Type a game name in the search box. Verify results filter correctly.
5. **Edit**: Click a game, edit title and upload a new image. Verify changes persist after page reload and re-sync.

## Image Dimensions Reference

| Type | Dimensions | Usage |
|------|-----------|-------|
| Icon | 64×64 | List view rows |
| Hero | 1920×620 | Hero view cards |
| Capsule (Grid) | 600×900 | Capsule/Grid view tiles (current default) |
