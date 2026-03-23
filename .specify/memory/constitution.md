<!--
SYNC IMPACT REPORT
==================
Version Change: 0.3.0 → 0.4.0 (MINOR)

Modified Principles:
- Principle VI: "Test Coverage by Default" — materially expanded with two new
  non-negotiable rules: (a) 60% minimum line coverage enforced by Vitest + istanbul
  thresholds in CI; (b) mandatory run-and-fix of affected tests whenever an existing
  source file is changed.

Added Sections:
- None

Removed Sections:
- None

Templates Requiring Updates:
✅ tasks-template.md — Tests note updated to reference 60% coverage floor and
   run-on-change validation requirement (.specify/templates/tasks-template.md)
✅ spec-template.md — No hardcoded constitutional gates (dynamically generated)
✅ plan-template.md — No hardcoded constitutional gates (dynamically generated)
✅ checklist-template.md — Architecture-agnostic, no updates needed

Follow-up TODOs:
- None; all placeholders filled.

Rationale for MINOR Version Bump (0.3.0 → 0.4.0):
- Principle VI materially expanded with new mandatory, measurable obligations:
  coverage floor (≥60% lines, enforced by vitest.config.ts thresholds) and
  run-and-fix discipline for changes to existing files. These are non-trivial
  additions to governance, warranting MINOR. No principles removed or redefined
  → not MAJOR.
-->

# cpak Constitution

## Core Principles

### I. Unified Container Frontend
The frontend MUST be a Next.js application built in standalone server mode and integrated into a unified container image. The Next.js server MUST serve the application and static assets without requiring separate web server processes. Runtime configuration (e.g., API base URL) MUST be managed through internal routing within the unified container; external configuration MUST be minimized to deployment-essential variables only (database connection, encryption key).

**Rationale**: Standalone mode produces a self-contained Node.js server with minimal dependencies, enabling deployment in a single unified container without orchestrating multiple services. This simplifies deployment, reduces surface area for configuration errors, and maintains self-hostability without sacrificing modern framework capabilities.

### II. REST Backend with Database-Backed Settings
The backend MUST be a single REST service exposing JSON endpoints, with minimal dependencies. It MUST provide `GET /health` (200 OK) and `GET /version` (returns semantic version string). Business resources SHOULD expose CRUD under a single base path (e.g., `/api/items`). A locally hosted MongoDB instance is REQUIRED by default (bundled in unified container); external database mode MAY be enabled via configuration for advanced deployments.

**Application settings** (API keys, sync schedules, feature toggles) MUST be stored in a dedicated MongoDB `settings` collection and MUST be configurable exclusively through the web UI. The backend MUST NOT read application settings from environment variables; environment variables MUST be reserved for deployment-essential infrastructure configuration only.

**Rationale**: Database-backed settings enable dynamic configuration changes without container restarts or environment variable management. This reduces operational complexity, improves security (encrypted secrets in database), and provides a consistent user experience across deployment environments.

### III. Self-Hosting via Unified Container
The system MUST be deployable as a single unified container image that includes all required components: frontend server (Next.js standalone), backend API (Fastify), reverse proxy (Caddy), bundled database (MongoDB), and process manager (supervisord). Deployment MUST require no more than three optional environment variables: `ENCRYPTION_KEY` (for settings encryption), `EXTERNAL_DB` (flag to disable bundled database), and `MONGO_URI` (external database connection string when `EXTERNAL_DB=true`).

The unified container MUST support flexible volume configurations: single unified `/app/data` volume (default), split volumes (`/app/data/db` for database, `/app/data/images` and `/app/data/backups` for application data), or fully external database mode with application data volumes only.

**Rationale**: Unified container deployment eliminates orchestration complexity, reduces deployment failure points, and provides a consistent deployment experience across platforms (Docker, TrueNAS, Portainer, etc.). Flexible volume configuration accommodates different user needs from simple single-volume deployments to advanced split-storage scenarios.

### IV. Security with Encrypted Settings
Traffic MUST be served over HTTP internally within the container with external HTTPS termination handled by user's infrastructure or optional TLS configuration. CORS MUST be explicitly configured to restrict origins to known hosts. Secrets MUST NOT be hardcoded or passed via environment variables (except deployment-time `ENCRYPTION_KEY`).

Application secrets (API keys, OAuth tokens) MUST be stored in the MongoDB `settings` collection. If `ENCRYPTION_KEY` environment variable is provided at deployment time, secrets MUST be encrypted using AES-256-GCM encryption. If `ENCRYPTION_KEY` is not provided, secrets MUST be stored as plain text in the database. Encryption keys MUST NOT be configurable via the web UI.

**Rationale**: Database-backed settings provide secret storage without requiring external secret management systems. Optional encryption via deployment-time key allows users to choose between simplicity (plain text) and security (encrypted) based on their threat model and deployment environment.

### V. Observability & Operations
The backend MUST log structured events to stdout/stderr (JSON or key-value). Health and readiness endpoints MUST be present. Basic request logging SHOULD be enabled at the reverse proxy. Metrics MAY be exposed (e.g., `/metrics`) but are not required.

The system MUST support dynamic configuration reloads for non-deployment settings without requiring container restarts. Specifically, scheduler configuration changes (cron expressions, enabled state) MUST take effect immediately upon saving via the web UI.

**Rationale**: Dynamic configuration reload improves operational experience by eliminating restart downtime for routine configuration changes. Structured logging and health endpoints enable integration with monitoring systems without imposing specific monitoring tooling.

### VI. Test Coverage by Default
Every new frontend page (`app/**/page.tsx`) MUST ship with a corresponding test file
under `frontend/tests/pages/`. Every new backend route module (files under
`backend/src/api/routes/`) and every new service (files under `backend/src/services/`)
MUST ship with a corresponding test file under `backend/tests/integration/routes/` or
`backend/tests/unit/` respectively. Test files MUST be committed in the same PR or
commit as the feature implementation — a page or route MUST NOT be merged without its
accompanying test file.

**Coverage Threshold**: Both `frontend/` and `backend/` MUST maintain a minimum of
60% line coverage at all times. This threshold is enforced by the `lines: 60` entry
in each workspace's `vitest.config.ts` (istanbul provider). If any change causes line
coverage to drop below 60%, additional tests MUST be added to restore coverage before
that change is merged. The CI `npm run test --coverage` command MUST exit with code 0
(threshold met) for both workspaces before a PR may be merged.

**Validation on Change**: Whenever an existing source file is modified — whether to
implement a new feature, fix a bug, or refactor — the developer MUST run the tests that
exercise that file and verify they still pass. If the change alters the observable
behavior of the file, the affected tests MUST be updated to reflect the new behavior;
leaving tests broken or silently skipped is not permitted. Implementation change and
test update MUST be treated as a single atomic unit of work committed together.

Frontend tests MUST use Vitest + Testing Library + MSW (no real network calls, no
running server required). Backend tests MUST use Vitest + mongodb-memory-server (no
external database required). All tests MUST pass via `npm run test` in CI (Node 20)
before any PR is merged. Tests MUST cover the primary render / happy-path API
interaction for each new page or route; exhaustive edge-case coverage is encouraged
but not required beyond the happy path.

**Rationale**: Mandating tests at the time a feature lands prevents regression debt from
accumulating. Enforcing a 60% line coverage floor ensures that every feature area
remains exercised as the codebase grows, and the vitest.config.ts threshold makes
coverage enforcement automatic rather than manual. The run-and-fix obligation for
existing-file changes ensures that refactors and feature extensions do not silently
break previously validated behavior. The Testing Library + MSW stack has already been
established and all existing pages are covered; this principle locks in that standard
going forward.

## Minimal Requirements

### Unified Container Components
The production deployment MUST use a single unified container image (`docker.io/ghsvilela/cpak:latest` or `ghcr.io/ghsvilela/cpak:latest`) that includes:
- **Frontend**: Next.js 15+ standalone server serving the React application and static assets
- **Backend**: Fastify 5+ REST API with MongoDB integration
- **Reverse Proxy**: Caddy 2+ for internal routing (`/` → frontend, `/api` → backend)
- **Database**: MongoDB 8+ bundled by default (can be disabled for external database mode)
- **Process Manager**: supervisord managing all processes within the container

The container image MUST be built via multi-stage Docker build with target size <500MB. The image MUST support both x86_64 and arm64 architectures.

### Frontend (Next.js Standalone)
- MUST build using Next.js standalone output mode, producing a self-contained Node.js server in `.next/standalone/`
- MUST serve the application on a configurable internal port (managed by supervisord)
- MUST be routed by Caddy from `/` to the Next.js server
- MUST be mobile-responsive with layouts that adapt to small screens (stacked layouts, full-width controls)
- SHOULD use Tailwind CSS for styling consistency

### Backend (Fastify + MongoDB)
- MUST listen on configurable internal port (managed by supervisord)
- MUST be routed by Caddy from `/api/` to the backend service
- MUST expose:
  - `GET /health` → `200 { status: "ok" }`
  - `GET /version` → `200 { version: "x.y.z" }`
  - Resource CRUD endpoints under `/api/` (games, profiles, achievements, settings)
- MUST use MongoDB for all persistent data storage:
  - `profiles` collection: User profiles for Steam/Xbox/PlayStation
  - `games` collection: Game library data with completion stats
  - `achievements` collection: Achievement data per game/profile
  - `settings` collection: **Application configuration (API keys, scheduler, feature toggles)**
  - `sync_runs` collection: Sync operation audit logs
  - `backupMetadata` collection: Backup/restore metadata
- MUST enable CORS for all origins by default (user may configure via settings if needed)
- MUST provide a `configService` that reads settings exclusively from the `settings` collection with no environment variable fallback for application settings

### Reverse Proxy & Routing (Caddy)
- MUST route `/` to the Next.js frontend server
- MUST route `/api` to the Fastify backend service, preserving paths
- SHOULD enable gzip compression for responses
- SHOULD include basic request logging
- MUST listen on port 80 internally (exposed as container port 80)
- TLS termination is OPTIONAL; users may configure via external proxy or Caddy configuration

### Configuration (Environment Variables - Infrastructure Only)

**CRITICAL**: Application settings (API keys, sync schedules, feature toggles) MUST NOT be configured via environment variables. These MUST be configured exclusively through the web UI and stored in the MongoDB `settings` collection.

Environment variables are LIMITED to deployment infrastructure configuration:

- `ENCRYPTION_KEY` (optional): AES-256 encryption key for settings database secrets. If provided, credentials are encrypted. If not provided, credentials are stored as plain text. Format: 64-character hex string. Generate with: `openssl rand -base64 32`
- `EXTERNAL_DB` (optional): Boolean flag (`true`/`false`, default `false`). When `true`, disables bundled MongoDB and requires `MONGO_URI`.
- `MONGO_URI` (conditional): MongoDB connection string, required when `EXTERNAL_DB=true`. Default (bundled mode): `mongodb://localhost:27017/cpak`.

**Removed Variables** (now UI-configured):
- ~~`STEAM_API_KEY`~~ → Configured in Settings UI
- ~~`XBOX_CLIENT_ID`~~ / ~~`XBOX_CLIENT_SECRET`~~ / ~~`XBOX_REDIRECT_URI`~~ → Configured in Settings UI
- ~~`PLAYSTATION_CLIENT_ID`~~ / ~~`PLAYSTATION_CLIENT_SECRET`~~ / ~~`PLAYSTATION_REDIRECT_URI`~~ → Configured in Settings UI
- ~~`STEAMGRID_API_KEY`~~ → Configured in Settings UI
- ~~`SCHEDULER_ENABLED`~~ / ~~`SCHEDULER_CRON`~~ → Configured in Settings UI
- ~~`SYNC_RATE_LIMIT_PER_MIN`~~ → Configured in Settings UI
- ~~`API_PORT`~~ / ~~`API_BASE_PATH`~~ → Managed internally by supervisord/Caddy
- ~~`ALLOWED_ORIGINS`~~ → Configured in Settings UI (defaults to allow all)

### Deployment Examples

#### Single Container Deployment (Default - Recommended)
```bash
# Pull and run with default bundled database and unified volume
docker run -d \
  --name cpak \
  -p 8080:80 \
  -v cpak_data:/data \
  -e ENCRYPTION_KEY=your-64-char-hex-key \
  docker.io/ghsvilela/cpak:latest

# Access at http://localhost:8080
# Configure API keys and settings via web UI at /settings
```

#### Split Volumes Deployment
```bash
# Run with separate volumes for database and application data
docker run -d \
  --name cpak \
  -p 8080:80 \
  -v cpak_db:/app/data/db \
  -v cpak_images:/app/data/images \
  -e ENCRYPTION_KEY=your-64-char-hex-key \
  docker.io/ghsvilela/cpak:latest
```

#### External Database Deployment
```bash
# Run with external MongoDB instance
docker run -d \
  --name cpak \
  -p 8080:80 \
  -v cpak_images:/app/data/images \
  -e EXTERNAL_DB=true \
  -e MONGO_URI=mongodb://external-host:27017/cpak \
  -e ENCRYPTION_KEY=your-64-char-hex-key \
  docker.io/ghsvilela/cpak:latest
```

#### Docker Compose (Development)
```yaml
services:
  cpak:
    image: docker.io/ghsvilela/cpak:latest
    ports:
      - "8080:80"
    volumes:
      - cpak_data:/data
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-default-insecure-key-change-in-production}

volumes:
  cpak_data:
```

**Note**: For production deployments on platforms like TrueNAS, Portainer, or Kubernetes, use the single unified container with volume mounts appropriate for your platform. External TLS termination is recommended via reverse proxy (Traefik, nginx-proxy, Caddy external instance, etc.).

## Trophy Hunter Domain

### Platforms & Profiles
- MUST support Steam, Xbox, and PlayStation as distinct platforms.
- MUST allow multiple user profiles per platform. Profiles MUST store identifiers and tokens required to fetch achievements.
- Tokens and sensitive fields MUST be encrypted at rest in the database using the encryption key provided at deployment time.
- Profile management (add, edit, delete) MUST be available through the web UI.

### Settings & Configuration Management
- MUST provide a `/settings` page in the web UI for managing all application configuration.
- MUST store all application settings in the MongoDB `settings` collection with the following schema:
  ```typescript
  {
    key: string,           // Setting identifier (e.g., 'steam_api_key', 'scheduler_enabled')
    value: any,            // Setting value (encrypted for secrets)
    encrypted: boolean,    // Whether value is encrypted
    updatedAt: Date        // Last modification timestamp
  }
  ```
- Settings MUST be categorized as:
  - **API Keys & Credentials**: Steam API key, Xbox OAuth, PlayStation OAuth, SteamGridDB API key (encrypted)
  - **Scheduler Configuration**: Enabled state, cron expression, sync batch size (plaintext)
  - **Application Behavior**: Rate limits, sync options, feature flags (plaintext)
- Changes to scheduler settings (`scheduler_enabled`, `scheduler_cron`, `sync_batch_size`) MUST trigger automatic scheduler reload via the backend `schedulerService.reload()` method without requiring container restart.
- The backend `configService` MUST provide:
  - `getSetting(key, defaultValue)`: Retrieve setting from database, return default if not found
  - `setSetting(key, value, encrypted)`: Create or update setting, encrypt if marked as secret
  - `initializeDefaults()`: Populate default values for non-secret settings on first run
- Secret values MUST NOT be displayed in the UI; the settings form MUST omit the value field entirely for encrypted settings, showing only a "key is configured" indicator.

### Data Storage (MongoDB Collections)
- `profiles`: Platform (`steam|xbox|playstation`), display name, identifiers, encrypted tokens.
- `games`: Platform, profileId, gameId, title, image refs, completion stats (achievementsTotal, achievementsUnlocked).
- `achievements`: Platform, profileId, gameId, achievementId, name, description, unlockedAt.
- `sync_runs`: Timestamp, platform, profileId, status, counts, errors; used for observability and audit.
- `settings`: **Key-value store for application configuration**, with encryption support for secrets.
- `backupMetadata`: Backup operation metadata (timestamp, collections included, record counts).

### Backend Sync & Endpoints
- MUST provide endpoints:
  - `GET /api/profiles` / `POST /api/profiles` / `PATCH /api/profiles/{id}` / `DELETE /api/profiles/{id}`
  - `POST /api/sync/{platform}?profileId=...` to trigger a manual sync for a profile.
  - `GET /api/games?platform=...&profileId=...&onlyCompleted=bool` (default `true`).
  - `GET /api/achievements?gameId=...&profileId=...` list achievements.
  - `GET /api/images?gameId=...` returns image URLs/metadata from cache or SteamGridDB.
  - `GET /api/settings` / `GET /api/settings/{key}` / `PUT /api/settings/{key}` / `DELETE /api/settings/{key}` for settings management.
  - `POST /api/backup` / `GET /api/backup/download` / `POST /api/backup/restore` for data export/import.
- Sync operations MUST respect rate limits configured via settings and platform-specific rate limits.
- Scheduler MUST run sync based on cron expression when enabled; manual triggers MUST be available via UI.
- Scheduler MUST reload configuration dynamically when settings change without requiring restart.

### Frontend Views
- MUST present three platform categories: Steam, Xbox, PlayStation.
- Each category page MUST default to filtering games with 100% achievements; user MAY toggle to show all with any achievements.
- Each category page SHOULD use platform-consistent theming (colors/brand accents).
- MUST provide a `/settings` page for:
  - Configuring platform API keys and OAuth credentials
  - Adding, editing, and deleting profiles
  - Configuring scheduler (enable/disable, cron expression, batch size)
  - Managing SteamGridDB API key
- MUST provide profile management UI with sync controls (manual sync button, sync status indicators).
- MUST use toast notifications for user feedback (sync started, errors, success messages).
- MUST be mobile-responsive:
  - Profile cards stack vertically on small screens
  - Buttons expand to full width on mobile
  - Input placeholders shortened for mobile display
  - Sync controls stack vertically in mobile layout

### Image Integration
- SHOULD use SteamGridDB (or best available alternative) to fetch game images; requires `steamgrid_api_key` configured via settings UI.
- MUST cache image metadata locally in database; image files MUST be stored in `/app/data/images/{platform}/{gameId}/` directory structure.
- MUST gracefully fallback to platform-provided images if none available via SteamGridDB.
- Image storage path MUST be configurable via volume mounts (unified `/app/data`, split `/app/data/images`, or custom path).

### Scheduler & Automation
- Scheduler MUST be implemented using `node-cron` with configurable cron expressions via settings UI.
- Scheduler MUST check `scheduler_enabled` setting before starting at container startup.
- Scheduler MUST support dynamic reload via `schedulerService.reload()` method:
  - Stop existing scheduler if running
  - Re-read settings from database (`scheduler_enabled`, `scheduler_cron`, `sync_batch_size`)
  - Start new scheduler with updated configuration
  - Log reload operation for observability
- Settings API (`PUT /api/settings/{key}`) MUST automatically trigger scheduler reload when scheduler-related keys are modified.
- Scheduler MUST respect `sync_batch_size` setting to control number of concurrent profile syncs.
- Default cron expression: `0 3 * * *` (daily at 3 AM).
- Default batch size: `5` profiles per sync run.

### Export/Backup
- MUST provide database-backed backup/restore functionality via `/api/backup` endpoints.
- Backup MUST export the following collections to JSON:
  - `profiles` (with encrypted credentials intact)
  - `games`
  - `achievements`
  - `settings` (with encrypted secrets intact)
  - `backupMetadata` (backup operation metadata)
- Backup file format MUST be gzipped JSON with structure:
  ```json
  {
    "version": "1.0",
    "timestamp": "2026-02-13T12:00:00Z",
    "collections": {
      "profiles": [...],
      "games": [...],
      "achievements": [...],
      "settings": [...],
      "backupMetadata": [...]
    }
  }
  ```
- Restore MUST validate backup file structure before importing.
- Restore MUST support merge mode (add new records, skip duplicates) or replace mode (clear and import).
- Backup metadata MUST be stored in `backupMetadata` collection for audit trail.

### Privacy & Security
- MUST avoid transmitting user data to third parties beyond platform APIs and image providers explicitly configured.
- If `ENCRYPTION_KEY` is set: MUST store credentials encrypted using AES-256-GCM. If not set: credentials stored as plain text.
- MUST NOT log secrets (API keys, tokens, encryption keys) in application logs.
- MUST use HTTPS for all external API calls to platform providers.
- SHOULD recommend users set `ENCRYPTION_KEY` for production deployments in documentation.

## Governance

### Amendment Process
- This constitution supersedes other practices for deployment architecture, configuration management, and runtime scope.
- Amendments MUST maintain self-hostability as a core requirement and keep deployment dependencies minimal (≤3 optional environment variables).
- Amendments that introduce new external service dependencies or managed cloud requirements MUST be rejected unless they provide opt-in functionality that preserves self-hosted operation as default.
- Amendments that add environment variables for application settings (vs. deployment infrastructure) MUST be rejected in favor of UI-based configuration.

### Compliance & Review
- Pull requests MUST verify that:
  - Endpoints follow REST conventions and return JSON
  - Configuration changes preserve UI-first configuration approach
  - New secrets are stored encrypted in settings database, not environment variables
  - Routing complies with unified container architecture (Caddy internal routing)
  - No hardcoded secrets or credentials exist in code
  - Mobile responsiveness is maintained for UI changes
  - Every new frontend page (`app/**/page.tsx`) has a matching test file in
    `frontend/tests/pages/` (Principle VI)
  - Every new backend route module or service has a matching test file in
    `backend/tests/integration/routes/` or `backend/tests/unit/` (Principle VI)
  - All tests pass via `npm run test` in CI before merge (Principle VI)
  - Line coverage meets or exceeds 60% for both `frontend/` and `backend/` after the
    change — verified by `npm run test --coverage` (Principle VI)
  - When modifying an existing source file, the tests for that file have been run
    locally to confirm no regressions, and any tests affected by behavior changes
    have been updated in the same commit (Principle VI)
- Feature specifications MUST include a "Constitution Check" section validating alignment with principles.
- Breaking changes to deployment model (e.g., splitting unified container) require constitution amendment before implementation.

### Version History
- **0.1.0** (2026-01-24): Initial ratification with multi-service architecture and environment variable configuration
- **0.2.0** (2026-02-13): Major update reflecting unified container deployment, UI-first configuration, minimal environment variables (≤3), settings database with encryption, dynamic scheduler reload, backup/restore system, and mobile-responsive design
- **0.3.0** (2026-07-10): Added Principle VI (Test Coverage by Default) mandating test files for every new frontend page and backend route/service; updated Compliance & Review checklist; updated tasks-template.md to reflect mandatory testing
- **0.4.0** (2026-03-08): Expanded Principle VI with 60% line coverage floor enforced by vitest.config.ts thresholds and mandatory run-and-fix validation when modifying existing source files; updated Compliance & Review checklist with coverage and change-validation bullets; updated tasks-template.md

---

**Version**: 0.4.0 | **Ratified**: 2026-01-24 | **Last Amended**: 2026-03-08
