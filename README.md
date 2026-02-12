# cpak — Cross Platform Achievement Keeper

[![Docker Hub](https://img.shields.io/docker/v/ghsvilela/cpak?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/ghsvilela/cpak)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-cpak-blue?logo=github)](https://ghcr.io/ghsvilela/cpak)
[![Docker Image Size](https://img.shields.io/docker/image-size/ghsvilela/cpak/latest?label=image%20size)](https://hub.docker.com/r/ghsvilela/cpak)
[![License](https://img.shields.io/github/license/ghsvilela/cpak)](LICENSE)

Self-hosted trophy hunter for Steam, Xbox, and PlayStation achievements.

## Features

- **Multi-Platform Support**: Track achievements from Steam, Xbox, and PlayStation (Steam MVP ready)
- **Self-Hosted**: Run on your own infrastructure with Docker
- **Unified Container**: All-in-one image with web server, backend, frontend, and optional MongoDB
- **UI-Based Configuration**: Configure API keys and settings through the web interface (no environment variables needed)
- **100% Filter**: Default view shows only completed games
- **Responsive Design**: Mobile-ready UI with Tailwind CSS
- **Automatic Sync**: Daily scheduler updates your achievements
- **Image Integration**: SteamGridDB support for game artwork

## Quick Start (Unified Container)

### Prerequisites

- Docker and Docker Compose installed
- Steam API key (get from https://steamcommunity.com/dev/apikey)
- (Optional) SteamGridDB API key for enhanced game images

### Deployment with Bundled Database (Recommended)

The simplest way to get started is with the unified container that includes everything:

1. **Download the docker-compose file**:
   ```bash
   curl -O https://raw.githubusercontent.com/ghsvilela/cpak/main/docker-compose.yml
   ```

2. **Start the container**:
   ```bash
   docker compose up -d
   ```

   This single container includes:
   - MongoDB 8.0 (bundled)
   - Fastify backend API
   - Next.js frontend
   - Caddy web server

3. **Access the application**:
   ```
   http://localhost:8000
   ```

4. **Complete setup**:
   - Navigate to Settings page in the UI
   - Enter your Steam API key
   - (Optional) Add SteamGridDB API key for game images
   - Go to Setup wizard to add your first profile
   - Enter your Steam ID and start syncing

### Deployment with External Database

For production or when you already have a MongoDB instance:

1. **Download the external-db compose file**:
   ```bash
   curl -O https://raw.githubusercontent.com/ghsvilela/cpak/main/docker-compose.external-db.yml
   ```

2. **Start the containers**:
   ```bash
   docker compose -f docker-compose.external-db.yml up -d
   ```

   This setup includes:
   - Separate MongoDB container (or use your existing MongoDB server)
   - CPAK application container (backend + frontend + Caddy)

3. **Custom MongoDB connection**:
   Edit `docker-compose.external-db.yml` and set:
   ```yaml
   environment:
     - MONGO_URI=mongodb://your-mongo-host:27017/cpak
   ```

### Optional: Custom Encryption Key

For enhanced security of API keys stored in the database:

```bash
# Generate a secure encryption key
openssl rand -base64 32

# Add to docker-compose file
environment:
  - ENCRYPTION_KEY=your-generated-key-here
```

## Configuration

### UI-Based Settings (Recommended)

All configuration is now done through the **Settings** page in the web interface:

- **Platform API Keys**: Steam, Xbox, PlayStation, SteamGridDB
- **Scheduler**: Enable/disable automatic sync and set cron schedule
- **Sync Settings**: Icon download concurrency and batch sizes

Settings are stored in the database and can be updated without restarting the container.

### Environment Variables (Container Configuration)

### Environment Variables (Container Configuration)

These variables configure the container infrastructure (not application settings):

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENCRYPTION_KEY` | Encryption key for secret settings | Auto-generated (insecure) | Recommended |
| `EXTERNAL_DB` | Use external MongoDB | (empty = bundled) | No |
| `MONGO_URI` | MongoDB connection (external mode) | `mongodb://mongo:27017/cpak` | External DB mode only |

**Deprecated** (configure via UI Settings instead):
- ~~`STEAM_API_KEY`~~ → Configure in Settings page
- ~~`STEAMGRID_API_KEY`~~ → Configure in Settings page  
- ~~`SCHEDULER_ENABLED`~~ → Configure in Settings page
- ~~`SCHEDULER_CRON`~~ → Configure in Settings page
- ~~`ICON_DOWNLOAD_CONCURRENCY`~~ → Configure in Settings page

**Internal (Fixed for Container)**:
- `API_PORT=8080` (internal, do not change)
- `API_BASE_PATH=/api` (internal, do not change)
- `IMAGES_DIR=/data/images` (internal, do not change)
- `ALLOWED_ORIGINS=*` (validated by Caddy reverse proxy)

### Volume Configuration

**Unified mode** (default):
```yaml
volumes:
  - cpak_data:/data  # Contains both database and images
```

**Split volumes** (optional):
```yaml
volumes:
  - cpak_db:/data/db
  - cpak_images:/data/images
```

**External database mode**:
```yaml
volumes:
  - cpak_images:/data/images  # Only images, no database
```

## Architecture

**Unified Container**:
- **Frontend**: Next.js 15 (standalone mode), TypeScript, Tailwind CSS, React 19
- **Backend**: Fastify 5, Mongoose, Zod validation
- **Database**: MongoDB 8.0 (bundled or external)
- **Web Server**: Caddy 2 (reverse proxy)
- **Process Manager**: supervisord (manages all services)

**Container Image**:
- Base: Debian slim (Node.js 20)
- Size: ~1.2 GB (includes MongoDB + all dependencies)
- Registries: `ghcr.io/ghsvilela/cpak` and `docker.io/ghsvilela/cpak`

## Development

### Local Development (Without Docker)

**Backend**:
```bash
cd backend
npm install
npm run dev  # Starts on port 8080
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev  # Development server on port 3000
```

**MongoDB**: 
```bash

**MongoDB**: 
```bash
docker run -d -p 27017:27017 --name mongo mongo:8
```

### Building the Container Image

```bash
# Build unified container
docker build -t cpak:local .

# Test locally
docker run -d -p 8000:80 -v cpak_data:/data cpak:local
```

## Project Structure

```
cpak/
├── backend/              # Fastify REST API
│   ├── src/
│   │   ├── api/          # Routes, middleware, server
│   │   ├── models/       # Mongoose schemas
│   │   ├── services/     # Business logic, sync adapters
│   │   └── utils/        # Config, logging, DB, crypto
│   └── package.json
├── frontend/             # Next.js standalone frontend
│   ├── app/              # Pages (setup, steam, xbox, playstation, settings)
│   ├── components/       # Reusable UI components
│   ├── services/         # API client, config loader
│   └── package.json
├── config/
│   ├── caddy/            # Caddyfile for reverse proxy
│   └── supervisord/      # Process management config
├── scripts/
│   └── docker-entrypoint.sh  # Container startup orchestration
├── Dockerfile            # Multi-stage unified container build
├── docker-compose.yml             # Default deployment (unified container)
├── docker-compose.unified.yml     # Alias for default (kept for docs)
├── docker-compose.external-db.yml # External database deployment
├── docker-compose.split-volumes.yml # Advanced: split DB/images
└── docker-compose.dev.yml         # Development: separate services
```
```

## API Endpoints

### System
- `GET /api/health` - Health check
- `GET /api/version` - API version

### Profiles
- `GET /api/profiles` - List all profiles
- `POST /api/profiles` - Create new profile
- `PATCH /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile

### Sync
- `POST /api/sync/:platform` - Trigger sync for platform (requires `?profileId=`)
- `GET /api/sync/runs` - List sync history

### Games & Achievements
- `GET /api/games` - List games (supports `?platform=steam&profileId=&onlyCompleted=true&limit=50&offset=0`)
- `GET /api/achievements` - List achievements (supports `?gameId=&profileId=`)

### Settings (UI Configuration)
- `GET /api/settings` - Get all settings (secrets masked)
- `GET /api/settings/:key` - Get specific setting
- `PUT /api/settings/:key` - Update setting (auto-encrypts secrets)
- `DELETE /api/settings/:key` - Delete setting

**Setting Categories**:
- `platform` - API keys for Steam, Xbox, PlayStation, SteamGridDB
- `scheduler` - Automatic sync configuration
- `sync` - Performance and concurrency settings

### Data Management
- `POST /api/backup` - Start async backup (returns jobId)
- `GET /api/backup/status` - Get backup/restore status
- `GET /api/backup/download/:filename` - Download backup file
- `POST /api/backup/restore` - Start async restore from uploaded file
- `DELETE /api/backup/cancel/:jobId` - Cancel active backup
- `DELETE /api/backup/restore/cancel/:jobId` - Cancel active restore
- `GET /api/export` - Export all data as JSON
- `POST /api/import` - Import data from JSON

## Implementation Status

### ✅ US1: First-Time Setup & Initial Sync (MVP - P1)
- ✅ Setup wizard for Steam/Xbox/PlayStation credentials
- ✅ Initial sync of games and achievements
- ✅ Platform pages with 100% completion filter default
- ✅ Profile privacy warnings and validation
- ✅ Error handling and progress feedback

### ✅ US2: Multi-Profile Management & Scheduling (P2)
- ✅ Multiple profiles per platform
- ✅ Daily automatic sync scheduler (configurable via UI)
- ✅ Manual sync per profile
- ✅ Rate limiting and concurrency control
- ✅ Sync run history tracking

### ✅ US3: Game Images & Themed Views (P3)
- ✅ SteamGridDB integration for game artwork
- ✅ Steam CDN fallback for grid images
- ✅ Platform-themed UI colors (Steam/Xbox/PlayStation)
- ✅ Responsive grid layouts (mobile-first)
- ✅ Achievement icon downloads with progress tracking

## Obtaining API Keys

**Steam API Key**:
1. Visit [https://steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
2. Login with your Steam account
3. Enter domain name (can be `localhost` for development)
4. Copy the generated key
5. Add in Settings page: Settings → Platform APIs → Steam API Key

**Steam ID**:
1. Visit [https://steamid.io/](https://steamid.io/)
2. Enter your Steam profile URL
3. Copy your Steam ID 64 (17-digit number)
4. Use in Setup wizard when creating your Steam profile

**SteamGridDB API Key** (Optional - for enhanced game artwork):
1. Visit [https://www.steamgriddb.com/](https://www.steamgriddb.com/)
2. Create an account and login
3. Go to Preferences → API
4. Generate a new API key
5. Add in Settings page: Settings → Platform APIs → SteamGridDB API Key

**Profile Privacy**:
Your Steam profile must be set to **Public** for syncing to work:
1. Visit [Privacy Settings](https://steamcommunity.com/my/edit/settings)
2. Set "My profile" to Public
3. Set "Game details" to Public

## Deployment Scenarios

### Home Server (TrueNAS SCALE, Unraid, etc.)
Use the default `docker-compose.yml` for a simple single-container deployment with all data in one volume:
```bash
docker compose up -d
```

### Production with Managed Database
Use `docker-compose.external-db.yml` and point to:
- MongoDB Atlas
- AWS DocumentDB  
- Azure Cosmos DB
- Your own managed MongoDB instance

```bash
docker compose -f docker-compose.external-db.yml up -d
```

### Split Database and Images
Use `docker-compose.split-volumes.yml` to mount separate volumes for better management:
```bash
docker compose -f docker-compose.split-volumes.yml up -d
```

Example volume configuration:
```yaml
volumes:
  - /mnt/fast-ssd/cpak-db:/data/db
  - /mnt/large-storage/cpak-images:/data/images
```

## Troubleshooting

### Container Not Starting
```bash
# Check logs
docker logs cpak

# Verify MongoDB is starting (unified mode)
docker exec cpak supervisorctl status
```

### Database Connection Issues (External Mode)
```bash
# Test MongoDB connectivity
docker exec cpak mongosh $MONGO_URI --eval "db.adminCommand('ping')"
```

### Frontend Not Loading
```bash
# Check if all services are running
docker exec cpak supervisorctl status

# Should show:
# mongodb   RUNNING (unified mode only)
# backend   RUNNING  
# frontend  RUNNING
# caddy     RUNNING
```

### API Keys Not Working
- Verify keys are entered in Settings page (not environment variables)
- Check encryption key is consistent across container restarts
- Settings are stored in database, not in container environment

## Performance Tuning

All performance settings are now configurable via the Settings UI:

- **Sync Icon Concurrency**: Number of simultaneous icon downloads (default: 5)
- **Scheduler Cron**: When to run automatic syncs (default: `0 3 * * *` = 3am daily)

## Backup and Restore

### Automated Backups
Use the Settings page to create backups:
1. Navigate to Settings → Backup & Restore
2. Click "Create Backup"
3. Monitor progress
4. Download backup file when complete

Backups include:
- All profiles, games, and achievements
- Settings and configuration
- Images directory (optional)

### Manual Database Backup
```bash
# Unified mode
docker exec cpak mongodump --out=/tmp/backup

# External mode
docker exec mongo mongodump --out=/backup
```

## Contributing

1. Follow the speckit workflow (see `.specify/scripts/`)
2. Update tasks in `specs/001-cpak/tasks.md` as you go
3. Ensure all tests pass before submitting
4. Follow constitution principles (see `.specify/memory/constitution.md`)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues or questions, see the specification in `specs/001-cpak/spec.md`.
