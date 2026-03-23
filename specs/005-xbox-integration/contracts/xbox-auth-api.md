# API Contracts: Xbox Authentication

**Feature**: 005-xbox-integration  
**Domain**: Backend REST API — Xbox OAuth flow

## New Routes (under `/api/auth/xbox/`)

These are NEW routes not in the existing API. They handle the Xbox OAuth flow.

---

### GET /api/auth/xbox/url

Generate the Microsoft OAuth authorization URL for Xbox login.

**Query Parameters**:

| Param | Type | Required | Description |
|---|---|---|---|
| `redirectTo` | string | No | Frontend URL to redirect after auth completes (default: `/setup`) |

**Response 200**:

```json
{
  "url": "https://login.live.com/oauth20_authorize.srf?client_id=...&scope=XboxLive.signin+XboxLive.offline_access&response_type=code&redirect_uri=...&state=..."
}
```

**Response 400** (Xbox settings not configured):

```json
{
  "error": "Xbox OAuth not configured. Please set xbox_client_id and xbox_client_secret in Settings."
}
```

**Notes**:
- `state` parameter includes CSRF token + optional `redirectTo` URL (base64-encoded)
- `xbox_client_id` and `xbox_redirect_uri` are read from settings collection

---

### GET /api/auth/xbox/callback

OAuth callback endpoint — Microsoft redirects here after user authentication.

**Query Parameters** (set by Microsoft):

| Param | Type | Required | Description |
|---|---|---|---|
| `code` | string | Yes | Authorization code from Microsoft |
| `state` | string | Yes | CSRF state token (must match) |
| `error` | string | No | Error code if auth failed |
| `error_description` | string | No | Human-readable error description |

**Success Flow**:
1. Validate `state` parameter
2. Exchange `code` for Microsoft OAuth tokens (`live.exchangeCodeForAccessToken`)
3. Exchange access token for Xbox User Token (`xnet.exchangeRpsTicketForUserToken`)
4. Exchange user token for XSTS Token (`xnet.exchangeTokenForXSTSToken`)
5. Fetch user profile (XUID, gamertag) from Xbox profile API
6. Create or update Profile document
7. Redirect to frontend: `{redirectTo}?xboxProfileId={profileId}&success=true`

**Error Flow**:
- Redirect to frontend: `{redirectTo}?error=xbox_auth_failed&message={urlEncoded error}`

**Notes**:
- This endpoint redirects (HTTP 302), it does not return JSON
- The refresh token is encrypted before storage
- If a profile with the same XUID already exists, it is updated (upsert behavior)

---

### POST /api/auth/xbox/refresh

Manually trigger token refresh for an Xbox profile. Primarily used for testing/diagnostics.

**Request Body**:

```json
{
  "profileId": "MongoDB ObjectId"
}
```

**Response 200**:

```json
{
  "success": true,
  "expiresAt": "2026-02-28T04:00:00.000Z"
}
```

**Response 400** (profile is not Xbox):

```json
{
  "error": "Profile is not an Xbox profile"
}
```

**Response 401** (refresh token expired):

```json
{
  "error": "Xbox re-authentication required",
  "authUrl": "https://login.live.com/oauth20_authorize.srf?..."
}
```

---

## Modified Routes

### POST /api/profiles (Existing — Updated Validation)

**Updated Zod Schema** — add Xbox-specific credential fields:

```typescript
credentials: z.object({
  steamApiKey: z.string().optional(),
  xboxRefreshToken: z.string().optional(),   // Already exists
  psnRefreshToken: z.string().optional(),    // Already exists
  refreshToken: z.string().optional(),       // NEW: generic OAuth refresh token
  tokenType: z.string().optional(),          // NEW: 'xbox' | 'bearer'
  expiresAt: z.string().datetime().optional(), // NEW: token expiry
  scopes: z.array(z.string()).optional(),    // NEW: OAuth scopes
}).optional()
```

**Note**: The OAuth callback creates profiles directly — this update just ensures manual profile creation via API also works for Xbox.

### POST /api/sync/xbox (Existing Route — Now Functional)

Currently returns 500 "Xbox sync not implemented". After this feature, triggers full Xbox sync.

**Behavior**: Same as `POST /api/sync/steam` — fire-and-forget, creates SyncOperation, returns immediately.

**Query Parameters** (no change):

| Param | Type | Required | Description |
|---|---|---|---|
| `profileId` | string | No | Specific profile to sync. If omitted, syncs all Xbox profiles. |

**Response 200**:

```json
{
  "message": "Xbox sync started",
  "operationId": "MongoDB ObjectId"
}
```

**Response 401** (token expired, re-auth needed):

```json
{
  "error": "Xbox re-authentication required for profile {profileId}",
  "authUrl": "https://login.live.com/oauth20_authorize.srf?..."
}
```
