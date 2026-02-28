# Quickstart: Xbox Integration

**Feature**: 005-xbox-integration  
**Date**: 2026-02-27

## Prerequisites

- cpak instance running (Docker container or development mode)
- Microsoft account with Xbox profile (must be adult account, 18+)
- Azure AD App Registration (one-time setup by instance admin)

## Azure App Registration (Admin One-Time Setup)

1. Go to [Azure Portal → App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
   - Name: `cpak` (or any descriptive name)
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI (Web): `http://<your-cpak-host>:<port>/api/auth/xbox/callback`
     - Example: `http://localhost:8080/api/auth/xbox/callback`
3. Copy the **Application (client) ID**
4. Go to **Certificates & secrets** → New client secret → copy the secret **value**
5. In cpak **Settings** page:
   - Enter the Client ID in **Xbox Client ID**
   - Enter the Client Secret in **Xbox Client Secret**
   - (Optional) Set **Xbox Redirect URI** if auto-detection doesn't work

## Adding an Xbox Profile

1. Navigate to **Settings** → click **Add Profile** (or go to `/setup`)
2. Select **Xbox** from the platform selector
3. Click **Sign in with Xbox**
4. Microsoft login page opens → sign in with your Xbox/Microsoft account
5. Grant permissions for `XboxLive.signin` and `XboxLive.offline_access`
6. After successful login, you'll be redirected back to cpak
7. Your Xbox profile appears with your gamertag as display name

## Triggering a Sync

### Manual Sync

1. Navigate to the **Xbox** page (`/xbox`)
2. Select your profile from the profile selector
3. Click **Sync** button
4. Watch the progress bar: games discovered → achievements synced → images downloaded
5. Games appear in the grid as they're synced

### Scheduled Sync

Xbox profiles are automatically included in the scheduled sync (default: daily at 3 AM UTC). Configure in **Settings** → **Scheduler**.

## Browsing Xbox Games

1. Navigate to `/xbox`
2. Games display in a grid with cover art and completion percentage
3. Toggle "Completed only" to filter 100% games
4. Sort by completion, title, or last synced
5. Click a game tile to see individual achievements with icons

## Troubleshooting

### "Xbox OAuth not configured"

The `xbox_client_id` and `xbox_client_secret` settings are not set. Go to **Settings** and enter your Azure AD app credentials.

### "Xbox re-authentication required"

Your Microsoft OAuth refresh token has expired (typically after 90 days of inactivity, or if revoked). Click the re-authenticate link to sign in again.

### "Privacy settings block achievement data"

Your Xbox privacy settings may prevent achievement data access. Go to [Xbox Privacy Settings](https://account.xbox.com/en-us/Settings) and ensure "Others can see your game and app history" is set to allow.

### Games have no cover art

1. Check that the game appears in your Xbox title history
2. If Xbox doesn't provide images, ensure SteamGridDB API key is configured in **Settings**
3. SteamGridDB searches by game name — unusual titles may not match

### Token refresh keeps failing

- Ensure your Azure AD app registration is still active
- Check that the client secret hasn't expired (Azure secrets have configurable lifetimes)
- Try deleting the Xbox profile and re-authenticating

## Development Notes

### Running Locally

```bash
# Backend: Start with dev server
cd backend && npm run dev

# Frontend: Start Next.js dev server
cd frontend && npm run dev

# For Xbox OAuth callback, the redirect URI must match your local setup
# Default: http://localhost:8080/api/auth/xbox/callback
```

### Running Tests

```bash
# Backend unit tests (Xbox adapter, sync service)
cd backend && npm test -- --grep xbox

# Frontend tests (Xbox page, setup page)
cd frontend && npm test -- --grep xbox

# All tests
npm test
```

### Key Files

| File | Purpose |
|---|---|
| `backend/src/services/adapters/xbox.ts` | Xbox Live API adapter |
| `backend/src/services/syncService.ts` | `syncXbox()` method |
| `backend/src/api/routes/auth.ts` | Xbox OAuth routes |
| `backend/src/services/adapters/steamgriddb.ts` | Name-search enhancement |
| `frontend/app/setup/page.tsx` | Platform selector + Xbox OAuth button |
| `frontend/app/xbox/page.tsx` | Xbox game library page |
| `frontend/app/xbox/game/[id]/page.tsx` | Xbox game detail page |
