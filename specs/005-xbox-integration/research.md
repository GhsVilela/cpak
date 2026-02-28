# Research: Xbox Integration

**Feature**: 005-xbox-integration  
**Date**: 2026-02-27

## 1. Xbox Authentication Approach

**Decision**: Use Microsoft OAuth 2.0 via `@xboxreplay/xboxlive-auth` library with Custom Azure Application flow.

**Rationale**: Xbox does not provide static API keys like Steam. Microsoft requires OAuth 2.0 authentication with Azure AD app registration. The `@xboxreplay/xboxlive-auth` library (v5.1.0, Apache-2.0, TypeScript, zero dependencies) provides the complete authentication pipeline including OAuth code exchange, Xbox Network token generation, and token refresh — all needed for cpak's server-side flow.

**Alternatives Considered**:
- **Direct email/password auth** via `authenticate()`: Rejected — does not support 2FA, stores user passwords, violates security best practices.
- **OpenXbox/xbox-webapi-python**: Rejected — Python library, cpak backend is Node.js/TypeScript.
- **Manual OAuth implementation from scratch**: Rejected — `@xboxreplay/xboxlive-auth` handles the complex multi-step Xbox token exchange (Live → User Token → XSTS Token) and is actively maintained (latest release Aug 2025).

### Authentication Flow

1. **Azure App Setup** (one-time by cpak instance admin):
   - Register app at Azure AD Portal: "Personal Microsoft accounts only"
   - Redirect URI: `http://<cpak-host>/api/auth/xbox/callback`
   - Note Client ID and Client Secret
   - Store `xbox_client_id` and `xbox_client_secret` in cpak settings via UI

2. **User Authentication** (per Xbox profile):
   - Frontend generates authorize URL via `live.getAuthorizeUrl({ clientId, scope: 'XboxLive.signin XboxLive.offline_access', responseType: 'code', redirectUri })`
   - User clicks "Sign in with Xbox" → redirected to Microsoft login
   - After login, Microsoft redirects back with authorization code
   - Backend callback exchanges code for tokens: `live.exchangeCodeForAccessToken(code)`
   - Backend converts to Xbox tokens: `xnet.exchangeRpsTicketForUserToken(accessToken, 'd')` → `xnet.exchangeTokenForXSTSToken(userToken)`
   - Stores XUID, gamertag, refresh token (encrypted), XSTS details in profile

3. **Token Refresh** (automatic):
   - Before sync, check if XSTS token expired
   - Refresh via `live.refreshAccessToken(refreshToken)` → re-exchange for User Token → XSTS Token
   - Update stored tokens in profile (encrypted)

### Required Settings (via UI, stored in MongoDB `settings` collection)

| Setting Key | Type | Description |
|---|---|---|
| `xbox_client_id` | string | Azure AD Application (client) ID |
| `xbox_client_secret` | encrypted string | Azure AD Client Secret |
| `xbox_redirect_uri` | string | Callback URL for OAuth flow (defaults to auto-detect) |

### Library: `@xboxreplay/xboxlive-auth`

- **Version**: 5.1.0
- **License**: Apache-2.0
- **Size**: Zero external dependencies
- **Key exports**: `authenticate`, `live`, `xnet`, `XSAPIClient`
- **Key methods used**:
  - `live.getAuthorizeUrl(options)` — generate OAuth URL
  - `live.exchangeCodeForAccessToken(code)` — code → tokens
  - `live.refreshAccessToken(refreshToken)` — refresh flow
  - `xnet.exchangeRpsTicketForUserToken(accessToken, 'd')` — Live token → Xbox user token
  - `xnet.exchangeTokenForXSTSToken(userToken, options)` — user token → XSTS token
  - `XSAPIClient.get(url, { options })` — authenticated Xbox API calls

## 2. Xbox REST API Endpoints

**Decision**: Use three Xbox Live REST API endpoints for game/achievement data, authenticated with XSTS tokens via `XSAPIClient`.

**Rationale**: The Xbox Live REST API is the official data source. These endpoints provide all data needed for achievement tracking — title history (game list with achievement counts), per-game achievement details, and user profile information.

### Endpoints

| Endpoint | Domain | Purpose | Contract Version |
|---|---|---|---|
| `GET /users/xuid({xuid})/history/titles` | `achievements.xboxlive.com` | Title history — list games with achievement summaries | 2 |
| `GET /users/xuid({xuid})/achievements` | `achievements.xboxlive.com` | Per-user achievements (filterable by titleId) | 2 |
| `GET /users/xuid({xuid})/profile/settings?settings=Gamertag,GameDisplayPicRaw,Gamerscore` | `profile.xboxlive.com` | User profile — gamertag, avatar | 2 |

### Authentication Header

```
Authorization: XBL3.0 x={userHash};{xstsToken}
X-XBL-Contract-Version: 2
```

### Title History Response Structure

```json
{
  "titles": [
    {
      "titleId": "1234567890",
      "name": "Game Title",
      "devices": ["XboxSeries", "XboxOne", "PC"],
      "achievement": {
        "currentAchievements": 15,
        "totalAchievements": 50,
        "currentGamerscore": 200,
        "totalGamerscore": 1000,
        "progressPercentage": 30
      },
      "titleHistory": {
        "lastTimePlayed": "2026-01-15T10:30:00Z"
      },
      "images": [
        {
          "url": "https://store-images.s-microsoft.com/...",
          "type": "BoxArt"
        }
      ]
    }
  ],
  "pagingInfo": {
    "continuationToken": "...",
    "totalRecords": 150
  }
}
```

### Achievement Detail Response Structure

```json
{
  "achievements": [
    {
      "id": "1",
      "name": "Achievement Name",
      "description": "Achievement description",
      "progressState": "Achieved",
      "progression": {
        "timeUnlocked": "2026-01-15T10:30:00Z"
      },
      "mediaAssets": [
        {
          "name": "Icon",
          "type": "Icon",
          "url": "https://store-images.s-microsoft.com/..."
        }
      ],
      "isSecret": false
    }
  ],
  "pagingInfo": {
    "continuationToken": "...",
    "totalRecords": 50
  }
}
```

### Pagination

Xbox APIs use continuation tokens. Response includes `pagingInfo.continuationToken` which is passed as `continuationToken` query parameter for next page.

## 3. Xbox Image Sources

**Decision**: Use Xbox title images from title history response as primary source. Fall back to SteamGridDB name-based search.

**Rationale**: The Xbox title history API response directly includes game images (type "BoxArt", "Poster", "Tile") from Microsoft's CDN (`store-images.s-microsoft.com`). Achievement responses include icon URLs in `mediaAssets`. This covers 95%+ of cases. For missing images, SteamGridDB's `/search/autocomplete/{term}` endpoint enables name-based search for any game, not just Steam games.

### Image Priority Chain (Game Art)

1. **Xbox title history `images[]`** — Look for type `BoxArt` or `Poster` (portrait preferred)
2. **Xbox Store image URL pattern** — `https://store-images.s-microsoft.com/image/apps.{titleId}.*.jpg`
3. **SteamGridDB name search** — `GET /search/autocomplete/{gameName}` → `GET /grids/game/{sgdbGameId}?dimensions=600x900`
4. **No image** — graceful fallback

### Image Priority Chain (Achievement Icons)

1. **Xbox achievement `mediaAssets[]`** — type `Icon`, directly from Microsoft CDN
2. **No icon** — show locked-state placeholder

### SteamGridDB Name Search (New Capability)

The existing SteamGridDB adapter only supports `searchGameBySteamId()`. A new method is needed:

```
GET https://www.steamgriddb.com/api/v2/search/autocomplete/{term}
```

Returns array of matching games with SteamGridDB game IDs. Then use existing `getGridImages(gameId)` to fetch cover art.

### Storage Structure

```
images/xbox/{titleId}/game_grid.{ext}         — game cover art
images/xbox/{titleId}/{achievementId}_icon.{ext}  — achievement icon (unlocked)
```

Xbox achievements provide a single icon URL regardless of lock state (no locked variant like Steam). Both `iconPath` and `iconGrayPath` store the same file path; the frontend applies a CSS grayscale filter for locked achievements. The lock state is indicated by `progressState` field.

## 4. Profile Model Compatibility

**Decision**: Use existing Profile model OAuth fields without schema changes.

**Rationale**: The Profile model already includes `credentials.accessToken`, `credentials.refreshToken`, `credentials.expiresAt`, `credentials.scopes`, and `credentials.tokenType`. The pre-save encryption hook already encrypts `accessToken` and `refreshToken`. The `toJSON()` method already strips these from API responses.

### Xbox-Specific Credential Storage

| Field | Xbox Usage |
|---|---|
| `profileId` | XUID (Xbox User ID, 64-bit numeric string) |
| `displayName` | Xbox Gamertag |
| `credentials.accessToken` | Not stored (short-lived, regenerated from refresh token) |
| `credentials.refreshToken` | Microsoft OAuth refresh token (encrypted) |
| `credentials.expiresAt` | XSTS token expiry timestamp |
| `credentials.tokenType` | `'xbox'` |
| `credentials.scopes` | `['XboxLive.signin', 'XboxLive.offline_access']` |

**Note**: XSTS tokens and user hashes are short-lived (typically 4-16 hours). They are regenerated from the refresh token before each sync, not stored persistently. Only the Microsoft OAuth refresh token is stored.

## 5. SteamGridDB Adapter Enhancement

**Decision**: Add `searchGameByName(name)` and `downloadGameImageByName(gameName)` methods to the existing SteamGridDB adapter.

**Rationale**: The existing adapter only supports Steam app ID lookup (`searchGameBySteamId`). Xbox games need name-based lookup via `/search/autocomplete/{term}`.

**Alternatives Considered**:
- **Separate Xbox image adapter**: Rejected — would duplicate image download/cache logic.
- **New adapter class**: Rejected — SteamGridDB is a single service; extending the existing adapter is cleaner.

## 6. Rate Limiting

**Decision**: Use existing rate limiter with Xbox configuration already in place.

**Rationale**: The `RateLimiterService` already has an `xbox` platform configuration: 60 requests/minute, 1 second retry delay. The `executeWithRetry()` wrapper handles 429 errors, timeouts, and connection resets — all applicable to Xbox Live APIs.

## 7. Frontend OAuth Flow

**Decision**: Backend-initiated OAuth — frontend opens a popup/redirect to a backend-generated authorization URL, backend handles the callback.

**Rationale**: The OAuth callback must exchange the authorization code for tokens server-side (requires client secret). A backend route generates the auth URL and handles the callback, then redirects the frontend with a success/error indicator.

### Flow

1. Frontend: User clicks "Sign in with Xbox" on setup page
2. Frontend: Calls `GET /api/auth/xbox/url` → receives authorization URL
3. Frontend: Redirects user (or opens popup) to Microsoft login
4. Microsoft: User authenticates → redirects to `GET /api/auth/xbox/callback?code=...`
5. Backend: Exchanges code → creates/updates profile → redirects to frontend with `profileId`
6. Frontend: Detects successful auth → shows profile created, triggers initial sync

## 8. Platform Selection UX

**Decision**: Refactor setup page from per-platform checkboxes to a platform-card selector that dynamically loads the appropriate configuration form.

**Rationale**: Current setup page has checkboxes for each platform with Steam being functional and Xbox/PlayStation showing "coming soon". A card-based platform selector is cleaner and scales better as platforms are added.

### Design

- Three platform cards: Steam (blue), Xbox (green), PlayStation (blue)
- Clicking a card expands/slides to show that platform's setup form
- Steam: API Key + Steam ID fields (existing)
- Xbox: "Sign in with Xbox" button → OAuth flow
- PlayStation: "Coming soon" badge (no interaction)
