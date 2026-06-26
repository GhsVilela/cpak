# Quickstart: PlayStation Integration

**Feature**: 006-playstation-integration
**Date**: 2026-03-26
**Purpose**: Developer guide for building and testing the PlayStation integration.

---

## Prerequisites

- Node.js 20+
- MongoDB (bundled in Docker or external)
- A PSN account for testing
- An NPSSO token (instructions below)

---

## 1. Obtaining an NPSSO Token (Required for Testing)

1. Open a browser and navigate to: `https://store.playstation.com`
2. Sign in with your PlayStation Network account
3. After login, navigate to: `https://ca.account.sony.com/api/v1/ssocookie`
4. The page returns JSON containing your NPSSO token:
   ```json
   { "npsso": "your-npsso-token-here" }
   ```
5. Copy the `npsso` value — this is used to create a PlayStation profile in cpak

**Note**: The NPSSO token expires in ~24 hours. It will be exchanged for longer-lived OAuth tokens (refresh token ~60 days) during profile creation.

---

## 2. Backend Setup

```bash
cd backend

# Install dependencies (includes psn-api)
npm install

# Run tests
npm run test

# Run tests with coverage (must maintain ≥60% lines)
npm run test -- --coverage

# Start development server
npm run dev
```

### Key Files to Implement

| File | Action | Description |
|------|--------|-------------|
| `src/services/adapters/playstation.ts` | CREATE | PlayStation adapter (auth, sync, images) |
| `src/services/syncService.ts` | MODIFY | Add `syncPlayStation()` method |
| `src/models/achievement.ts` | MODIFY | Add `trophyGrade`, `isHidden` fields |
| `src/models/game.ts` | MODIFY | Add `trophyBronze/Silver/Gold/Platinum` fields |
| `src/api/routes/auth.ts` | MODIFY | Add PSN NPSSO validation endpoint |
| `tests/unit/playstation-adapter.test.ts` | CREATE | Adapter unit tests |
| `tests/integration/routes/playstation-sync.test.ts` | CREATE | Sync integration tests |

### Testing the Adapter

```bash
# Run only PlayStation tests
npx vitest run --reporter=verbose tests/unit/playstation-adapter.test.ts

# Run with coverage report
npx vitest run --coverage tests/unit/playstation-adapter.test.ts
```

---

## 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run tests
npm run test

# Start development server
npm run dev
```

### Key Files to Implement

| File | Action | Description |
|------|--------|-------------|
| `app/playstation/page.tsx` | MODIFY | Add trophy summary, generation filter, sync controls |
| `app/playstation/game/[id]/page.tsx` | CREATE | Game detail page with trophy grade badges |
| `components/TrophyGradeBadge.tsx` | CREATE | Reusable trophy grade badge component |
| `tests/pages/playstation.test.tsx` | CREATE/MODIFY | PlayStation page tests |
| `tests/pages/playstation-game.test.tsx` | CREATE | Game detail page tests |
| `tests/components/trophy-grade-badge.test.tsx` | CREATE | Badge component tests |

---

## 4. Implementation Order

### Phase 1: Backend Foundation
1. Add `trophyGrade`, `isHidden` to Achievement model
2. Add `trophyBronze/Silver/Gold/Platinum` to Game model
3. Create `PlayStationAdapter` class with auth methods
4. Add NPSSO validation endpoint

### Phase 2: Backend Sync
5. Implement trophy title fetching (game list)
6. Implement trophy definition + earned status fetching
7. Implement image download with CDN fallback
8. Add `syncPlayStation()` to `syncService.ts`
9. Include PlayStation in scheduled auto-sync

### Phase 3: Frontend Pages
10. Enhance PlayStation page with trophy summary + sync controls
11. Add generation filter to PlayStation page
12. Create `TrophyGradeBadge` component
13. Create game detail page with trophy list + grade badges

### Phase 4: Testing
14. Unit tests for PlayStationAdapter
15. Integration tests for sync endpoint
16. Frontend page tests (PlayStation library)
17. Frontend page tests (game detail)
18. Component tests (TrophyGradeBadge)

---

## 5. Trophy Grade Badge Design

### Colors (matching PlayStation branding)

| Grade | Background | Text/Border | Hex |
|-------|-----------|-------------|-----|
| Platinum | Light steel blue | Dark blue | `#a0b4c8` / `#1a3a5c` |
| Gold | Gold/amber | Dark gold | `#c8a800` / `#7a6800` |
| Silver | Silver/gray | Dark gray | `#a8a8a8` / `#4a4a4a` |
| Bronze | Bronze/copper | Dark brown | `#cd7f32` / `#7a4b1e` |

### Component API

```tsx
<TrophyGradeBadge grade="platinum" />  // Renders styled badge with grade label
<TrophyGradeBadge grade="gold" />
<TrophyGradeBadge grade="silver" />
<TrophyGradeBadge grade="bronze" />
```

---

## 6. PSN API Rate Limits

The PSN API (unofficial) has rate limits. Match the Xbox adapter's defensive patterns:

- **Default delay between requests**: 200ms
- **On 429 (rate limited)**: Exponential backoff starting at 2s, max 3 retries
- **On 5xx**: Retry with exponential backoff, max 3 retries
- **On 403 (privacy)**: Terminal — report to user
- **Batch processing**: Process games sequentially or in small batches (3-5 concurrent)

---

## 7. Environment Variables

**No new environment variables**. PlayStation configuration is stored in the settings collection:

| Setting Key | Category | Encrypted | Description |
|------------|----------|-----------|-------------|
| (none required) | — | — | All PSN auth is per-profile via NPSSO token exchange |

PSN authentication is entirely profile-based (no app-level API keys), unlike Xbox which requires client credentials. Each PlayStation profile stores its own OAuth tokens.
