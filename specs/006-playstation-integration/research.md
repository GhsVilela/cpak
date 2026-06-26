# Research: PlayStation Integration

**Feature**: 006-playstation-integration
**Date**: 2026-03-26
**Purpose**: Resolve all NEEDS CLARIFICATION items and technology decisions before Phase 1 design.

---

## R1: PSN Authentication Flow (NPSSO → OAuth Tokens)

**Decision**: Use the `psn-api` npm package which wraps the PSN authentication flow.

**Rationale**: The `psn-api` package (by achievements.app) is the most mature, well-maintained Node.js library for PSN API access. It handles the complete NPSSO → OAuth token exchange flow, including:

1. User obtains an NPSSO token by logging into `store.playstation.com` and visiting `https://ca.account.sony.com/api/v1/ssocookie`
2. NPSSO token is exchanged for an authorization code via Sony's OAuth endpoint
3. Authorization code is exchanged for access token + refresh token pair
4. Access token expires in ~1 hour; refresh token expires in ~60 days
5. Token refresh uses standard OAuth refresh_token grant type

**Alternatives considered**:
- Raw HTTP calls to Sony's OAuth endpoints: More control but significant maintenance burden, error-prone auth header construction, and no community bug fixes
- `playstation-trophies` package: Less maintained, fewer features, limited trophy group support

**Key functions from `psn-api`**:
- `exchangeNpssoForCode(npssoToken)` → authorization code
- `exchangeCodeForAccessToken(code)` → `{ accessToken, expiresIn, refreshToken, refreshTokenExpiresIn }`
- `exchangeRefreshTokenForAuthTokens(refreshToken)` → refreshed token pair

---

## R2: PSN API Endpoints for Trophy Data

**Decision**: Use the PSN Trophy API v1 endpoints via `psn-api` wrapper functions.

**Rationale**: The PSN Trophy API provides structured endpoints for all required data:

### Trophy Title List (Games with Trophies)
- **Endpoint**: `/trophy/v1/users/{accountId}/trophyTitles`
- **Returns**: List of games with trophy metadata per game:
  - `npCommunicationId` — unique game identifier for trophy purposes
  - `trophyTitleName` — game title
  - `trophyTitleIconUrl` — game cover art URL (PlayStation CDN)
  - `trophyTitlePlatform` — platform string: `"PS3"`, `"PS4"`, `"PS5"`, `"PSVITA"`
  - `definedTrophies` — `{ bronze, silver, gold, platinum }` totals
  - `earnedTrophies` — `{ bronze, silver, gold, platinum }` earned counts
  - `progress` — completion percentage (0-100)
  - `lastUpdatedDateTime` — last trophy earn timestamp
- **Pagination**: `offset` + `limit` params, with `totalItemCount` in response

### Trophy List per Game
- **Endpoint**: `/trophy/v1/npCommunicationIds/{npCommunicationId}/trophyGroups/{trophyGroupId}/trophies`
- **Returns**: Individual trophy details:
  - `trophyId` — numeric trophy ID within the game
  - `trophyName` — trophy name (redacted for hidden trophies if not earned)
  - `trophyDetail` — trophy description
  - `trophyType` — `"bronze"`, `"silver"`, `"gold"`, `"platinum"`
  - `trophyIconUrl` — trophy icon URL (PlayStation CDN)
  - `trophyHidden` — boolean flag for hidden/secret trophies

### User Earned Trophies per Game
- **Endpoint**: `/trophy/v1/users/{accountId}/npCommunicationIds/{npCommunicationId}/trophyGroups/{trophyGroupId}/trophies`
- **Returns**: Earn status overlay:
  - `earned` — boolean
  - `earnedDateTime` — unlock timestamp (ISO 8601)

**Key `psn-api` wrapper functions**:
- `getUserTitles(auth, accountId, options)` → paginated trophy titles
- `getTitleTrophies(auth, npCommunicationId, trophyGroupId, options)` → trophy definitions
- `getUserTrophiesEarnedForTitle(auth, accountId, npCommunicationId, trophyGroupId, options)` → earn status

**Alternatives considered**:
- PlayStation Partners API (official): Requires PlayStation developer partnership; not available for community/self-hosted use
- Web scraping PSN profiles: Fragile, rate-limited, incomplete data

---

## R3: PlayStation CDN Image URLs

**Decision**: Use URLs returned directly by the PSN Trophy API for both game art and trophy icons.

**Rationale**: The PSN API returns complete CDN URLs for images:

- **Game cover art**: `trophyTitleIconUrl` field in trophy title response
  - Format: `https://image.api.playstation.com/trophy/np/{npCommunicationId}_00_...png`
  - Publicly accessible (no auth header needed)
  - Resolution: Typically 240×240 or higher

- **Trophy icons**: `trophyIconUrl` field in trophy definition response
  - Format: `https://image.api.playstation.com/trophy/np/{npCommunicationId}_00_...png`
  - Publicly accessible
  - Single icon per trophy (no separate locked variant — locked state shown via CSS grayscale, matching Xbox pattern)

**Fallback chain** (when PSN CDN returns no image or errors):
1. PlayStation CDN (primary — from API response)
2. SteamGridDB (search by game title, using existing `SteamGridDBAdapter`)
3. PCGamingWiki (via existing `fetchPCGamingWikiImageUrl`)
4. Wikipedia (via existing `fetchWikipediaImageUrl`)

**Alternatives considered**:
- PlayStation Store CDN: Different URL structure, requires product ID mapping, not consistently available for older titles
- IGDB/RAWG APIs: Additional API key requirement, overkill when SteamGridDB already serves this role

---

## R4: Hidden Trophy Resolution via Third-Party Database

**Decision**: Use the PSN API's own `getTitleTrophies` endpoint (which returns full details for ALL trophies regardless of earn status) combined with a separate user-earned overlay call.

**Rationale**: The PSN Trophy API actually provides two separate endpoints:
1. **Trophy definitions** (not user-specific): Returns ALL trophy details including hidden ones — name, description, icon, grade. This is a non-authenticated game-level query.
2. **User earned status** (user-specific): Returns only earn status + timestamp overlay.

By calling the trophy definitions endpoint first, we get the real names of ALL trophies including hidden ones. This eliminates the need for a third-party trophy database in most cases.

**Fallback for edge cases**: If the definitions endpoint redacts hidden trophy details (which happens for some PS3-era games), the system falls back to displaying "Hidden Trophy" with a generic icon.

**Alternatives considered**:
- PSNProfiles.com scraping: Fragile, ToS concerns, rate limiting
- TrueTrophies API: No public API available
- Maintaining our own trophy database: Unsustainable for a self-hosted project

---

## R5: PlayStation Platform Generation Detection

**Decision**: Use the `trophyTitlePlatform` field from the trophy titles API response.

**Rationale**: The PSN API returns platform information directly:
- `"PS3"` — PlayStation 3
- `"PS4"` — PlayStation 4
- `"PS5"` — PlayStation 5
- `"PSVITA"` or `"PSVita"` — PlayStation Vita

These map directly to the `devices` field on the Game model (same field used by Xbox for generation filtering). The mapping is:

| API Value | `devices` Array Value | Display Label |
|-----------|----------------------|---------------|
| `"PS3"` | `['PS3']` | PS3 |
| `"PS4"` | `['PS4']` | PS4 |
| `"PS5"` | `['PS5']` | PS5 |
| `"PSVITA"` / `"PSVita"` | `['PSVita']` | PS Vita |

Some games span multiple platforms (e.g., PS4 + PS5 cross-gen). The API may return a comma-separated string or multiple entries. The adapter normalizes to an array of unique platform strings.

**Alternatives considered**:
- Hardcoding generation from npCommunicationId prefix: Unreliable, prefix format changed across generations
- External game database lookup: Unnecessary since the API provides this data

---

## R6: Best npm Package for PSN API Access

**Decision**: `psn-api` (npm: `psn-api`)

**Rationale**:
- **Maturity**: Actively maintained, used by achievements.app (a large PSN trophy tracking service)
- **Coverage**: Provides typed wrappers for authentication, profile, trophy titles, trophy definitions, and earned trophies
- **TypeScript**: Written in TypeScript with complete type definitions
- **No server dependency**: Works purely via HTTP calls, no WebSocket or server-side-events needed
- **Self-contained auth**: Handles NPSSO → authorization code → access/refresh token flow
- **Token refresh**: Built-in `exchangeRefreshTokenForAuthTokens()` function

**Key considerations**:
- Package handles the OAuth flow but doesn't manage token storage — our adapter stores encrypted tokens in the Profile model (same as Xbox)
- Package sends requests to Sony's servers — we wrap calls with retry logic and rate limiting (matching Xbox adapter pattern)
- Package types may need augmentation for fields like `lastPlayedDateTime` or `playDuration` if the API returns them but the package doesn't type them

**Alternatives considered**:
- `playstation-trophies`: Less maintained, limited API coverage
- Direct HTTP calls: More work, same underlying API, no community maintenance
- `@psnawp/psnawp`: Python only, not usable in Node.js

---

## R7: Play Time & Last Played Data Availability

**Decision**: Store `lastPlayed` and `playTimeMinutes` when available; these fields are already optional on the Game model.

**Rationale**: The PSN API's trophy title list includes:
- `lastUpdatedDateTime` — timestamp of the last trophy earned (available for all games)
- Play time data is NOT directly available from the trophy API

The `lastUpdatedDateTime` field maps to `lastPlayed` on the Game model. True "play time" (hours played) is not exposed by the PSN trophy endpoints. The recent play history endpoints (used by the PlayStation app) may expose play duration but require additional scopes and are not covered by `psn-api`.

**Decision**: Map `lastUpdatedDateTime` → `lastPlayed`. Leave `playTimeMinutes` as `null` for PlayStation games (data not available from trophy API). If future API access provides play duration, the field is ready to receive it.

**Alternatives considered**:
- PlayStation recent activity API: Different endpoint, different auth scopes, `psn-api` doesn't wrap it yet
- Scraping PlayStation Wrap-Up data: One-time annual data, not real-time

---

## R8: Profile Trophy Summary Computation

**Decision**: Compute trophy summary by aggregating precomputed `trophyBronze`/`trophySilver`/`trophyGold`/`trophyPlatinum` fields from the Game model.

**Rationale**: Each game stores its earned trophy counts by grade. The trophy summary for a profile is a simple `SUM()` across all games for that profile:

```
GET /api/games?platform=playstation&profileId=X
  → response includes aggregated totals: { totalBronze, totalSilver, totalGold, totalPlatinum }
```

This is computed server-side using a MongoDB aggregation pipeline on the games collection, filtered by `profileId` and `platform: 'playstation'`. The aggregation runs once per page load (not per-trophy) and is fast because:
- Fields are precomputed during sync (no join to achievements collection)
- Index exists on `(profileId, platform)`
- Typical result set: <500 games

**Alternatives considered**:
- Store summary in Profile model: Requires updating on every sync, potential staleness
- Compute from Achievement collection: Requires expensive group-by query across potentially 50k+ documents
