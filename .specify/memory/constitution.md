# cpak Constitution

## Core Principles

### I. Static Frontend Minimalism
The frontend MUST be a static web application built into self-contained assets (`index.html`, `app.js`, `styles.css`) served by a simple HTTP server or a reverse proxy. Build tooling SHOULD be optional; when used, it MUST produce a deterministic `dist/` directory that can be copied verbatim to production. Runtime configuration (e.g., API base URL) MUST be injected via a `config.json` or `window.__CONFIG__` without requiring a rebuild.

### II. REST Backend Simplicity
The backend MUST be a single stateless REST service exposing JSON endpoints, with minimal dependencies. It MUST provide `GET /health` (200 OK) and `GET /version` (returns semantic version string). Business resources SHOULD expose CRUD under a single base path (e.g., `/api/items`). A locally hosted document datastore (MongoDB) is RECOMMENDED by default; alternative stores MAY be used if they remain self-hostable and require no managed services.

### III. Self-Hosting First
The system MUST be deployable via a single host or `docker-compose` without any managed cloud prerequisites. A reverse proxy (Caddy or NGINX) SHOULD terminate TLS and route `/` to the static frontend and `/api` to the backend. All services MUST run with sane defaults and be configurable only via environment variables and mounted files.

### IV. Security Baseline
Traffic MUST be served over HTTPS in production (TLS termination at the proxy). CORS MUST be explicitly configured to restrict origins to known hosts. Secrets MUST NOT be hardcoded; they MUST be supplied via environment variables or mounted secrets. Authentication, when required, SHOULD be JWT bearer tokens with short-lived access tokens.

### V. Observability & Operations
The backend MUST log structured events to stdout/stderr (JSON or key-value). Health and readiness endpoints MUST be present. Basic request logging SHOULD be enabled at the proxy. Metrics MAY be exposed (e.g., `/metrics`) but are not required for the minimal template.

## Minimal Requirements

### Frontend
- MUST build to `./dist` containing `index.html`, `app.js`, `styles.css`.
- MUST read API base URL from either `./dist/config.json` or `window.__CONFIG__.API_BASE_URL` injected at runtime by the host.
- MUST avoid server-side rendering; static assets only.
- SHOULD be framework-agnostic; any framework used MUST compile down to static assets.

### Backend
- MUST listen on configurable `API_PORT` (default `8080`).
- MUST serve under `API_BASE_PATH` (default `/api`).
- MUST expose:
	- `GET /health` → `200 { status: "ok" }`
	- `GET /version` → `200 { version: "x.y.z" }`
	- Resource example under `API_BASE_PATH` (e.g., `/items`): `GET`, `POST`, `PUT`, `DELETE` returning JSON
- MUST enable CORS for `ALLOWED_ORIGINS`.
- SHOULD persist to MongoDB via `MONGO_URI` and `MONGO_DB` (defaults: `mongodb://localhost:27017`, db `cpak`). If using in-memory storage, MUST provide a migration path to MongoDB.
- SHOULD run as a single process without external dependencies beyond the OS and optional container runtime.

### Reverse Proxy & Routing
- MUST route `/` to the frontend static assets.
- MUST route `/api` to the backend service and preserve paths.
- SHOULD enable gzip/brotli compression and basic request logging.
- MUST terminate TLS using locally managed certificates (e.g., Let's Encrypt) in production.

### Configuration (Environment Variables)
- `API_PORT`: Backend port (default `8080`).
- `API_BASE_PATH`: Base path for API (default `/api`).
- `MONGO_URI`: MongoDB connection string (default `mongodb://localhost:27017`).
- `MONGO_DB`: MongoDB database name (default `cpak`).
- `MONGO_USERNAME` / `MONGO_PASSWORD`: Optional MongoDB credentials if auth is enabled.
- `ALLOWED_ORIGINS`: Comma-separated list for CORS.
- `JWT_SECRET`: Required if auth is enabled; otherwise omit.
- `API_BASE_URL` (frontend): Full base URL to the backend, injected at runtime.

#### Trophy Hunter (Domain) Variables
- `STEAM_API_KEY`: Optional Steam Web API key for data access.
- `XBOX_CLIENT_ID` / `XBOX_CLIENT_SECRET` / `XBOX_REDIRECT_URI`: OAuth client for Xbox.
- `PLAYSTATION_CLIENT_ID` / `PLAYSTATION_CLIENT_SECRET` / `PLAYSTATION_REDIRECT_URI`: OAuth client for PlayStation.
- `STEAMGRID_API_KEY`: API key for SteamGridDB image fetching.
- `SCHEDULER_ENABLED`: Enable periodic sync (default `false`).
- `SCHEDULER_CRON`: Cron expression for sync (default `0 3 * * *`).
- `SYNC_RATE_LIMIT_PER_MIN`: Global per-minute sync limit (default `60`).

### Docker Compose (Reference Template)
```yaml
version: "3.9"
services:
	web:
		image: caddy:2
		volumes:
			- ./dist:/usr/share/caddy
			- ./ops/Caddyfile:/etc/caddy/Caddyfile
		ports:
			- "80:80"
			- "443:443"
		environment:
			- API_BASE_URL=https://example.com/api

	mongo:
		image: mongo:6
		ports:
			- "27017:27017"
		volumes:
			- ./data/mongo:/data/db
		environment:
			- MONGO_INITDB_DATABASE=cpak

	api:
		image: ghsvilela/cpak-api:latest
		depends_on:
			- mongo
		environment:
			- API_PORT=8080
			- API_BASE_PATH=/api
			- MONGO_URI=mongodb://mongo:27017
			- MONGO_DB=cpak
			- ALLOWED_ORIGINS=https://example.com
			- JWT_SECRET=${JWT_SECRET}
		ports:
			- "8080:8080"
```

### NGINX (Reference Snippet)
```nginx
server {
	listen 80;
	server_name example.com;

	location / {
		root /var/www/dist;
		try_files $uri /index.html;
	}

	location /api/ {
		proxy_pass http://api:8080/api/;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
	}
}
```

## Development Workflow (Minimal)
- Frontend: Build outputs to `./dist`. Runtime config provided via `config.json` or `window.__CONFIG__`.
- Backend: Provide `health`, `version`, and one resource with CRUD. Unit tests SHOULD exist for handlers; integration test MAY be deferred.
- CI (optional): Build backend image; verify `/health` and `/version`; publish artifacts; no managed services required.

## Trophy Hunter Domain

### Platforms & Profiles
- MUST support Steam, Xbox, and PlayStation as distinct platforms.
- MUST allow multiple user profiles per platform. Profiles MUST store identifiers and tokens required to fetch achievements.
- Tokens and sensitive fields MUST be encrypted at rest.

### Data Storage (MongoDB Collections)
- `profiles`: Platform (`steam|xbox|playstation`), display name, identifiers, token metadata.
- `games`: Platform, profileId, gameId, title, image refs, completion stats (achievementsTotal, achievementsUnlocked).
- `achievements`: Platform, profileId, gameId, achievementId, name, description, unlockedAt.
- `sync_runs`: Timestamp, platform, profileId, status, counts, errors; used for observability and audit.

### Backend Sync & Endpoints
- MUST provide endpoints:
	- `GET /api/profiles` / `POST /api/profiles` / `PATCH /api/profiles/{id}` / `DELETE /api/profiles/{id}`
	- `POST /api/sync/{platform}?profileId=...` to trigger a manual sync for a profile.
	- `GET /api/games?platform=...&profileId=...&onlyCompleted=bool` (default `true`).
	- `GET /api/achievements?gameId=...&profileId=...` list achievements.
	- `GET /api/images?gameId=...` returns image URLs/metadata from cache or SteamGridDB.
- Sync operations MUST respect `SYNC_RATE_LIMIT_PER_MIN` and platform rate limits.
- Scheduler MUST run sync daily when enabled; manual triggers MUST be available.

### Frontend Views
- MUST present three categories: Steam, Xbox, PlayStation.
- Each category page MUST default to filtering games with 100% achievements; user MAY toggle to show all with any achievements.
- Each category page SHOULD use platform-consistent theming (colors/brand accents).

### Image Integration
- SHOULD use SteamGridDB (or best available alternative) to fetch game images; requires `STEAMGRID_API_KEY`.
- MUST cache image metadata locally; image files MAY be cached for performance.
- MUST gracefully fallback to platform-provided images if none available via SteamGridDB.

### Settings & Scheduling
- MUST provide a settings page to configure platform credentials, add/remove profiles, set `SCHEDULER_ENABLED` and `SCHEDULER_CRON`.
- MUST allow multiple accounts per platform.
- MUST allow manual sync per platform/profile.

### Export/Backup
- SHOULD provide JSON export/import of profiles, games, and achievements to support personal archival.

### Privacy & Security
- MUST avoid transmitting user data to third parties beyond platform APIs and image providers explicitly configured.
- MUST store credentials encrypted; MUST not log secrets.

## Governance
- This constitution supersedes other practices for deployment and runtime scope.
- Amendments MUST maintain self-hostability and keep dependencies minimal.
- PRs MUST verify endpoints, configuration, and routing comply with this document.

**Version**: 0.1.0 | **Ratified**: 2026-01-24 | **Last Amended**: 2026-01-24
