# cpak — Cross Platform Achievement Keeper

[![Docker Hub](https://img.shields.io/docker/v/ghsvilela/cpak?label=Docker%20Hub&logo=docker)](https://hub.docker.com/r/ghsvilela/cpak)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-cpak-blue?logo=github)](https://ghcr.io/ghsvilela/cpak)
[![Docker Image Size](https://img.shields.io/docker/image-size/ghsvilela/cpak/latest?label=image%20size)](https://hub.docker.com/r/ghsvilela/cpak)
[![License](https://img.shields.io/github/license/ghsvilela/cpak)](LICENSE)

Achievements are not just achievements, they are also a memory, welcome to CPAK, a s elf-hosted cross platform achievement keeper for Steam, Xbox, and PlayStation, keep all of your memories locally, forever! But, don't forget to always backup everything.

## Features

- **Multi-Platform Support**: Save achievements from Steam, Xbox, and PlayStation (Steam MVP ready)
- **Self-Hosted**: Run on your own infrastructure with Docker
- **Unified Container**: All-in-one image with web server, backend, frontend, and MongoDB
- **UI-Based Configuration**: Configure API keys and all other settings through the web interface (no environment variables needed)
- **Responsive Design**: Mobile-ready UI with Tailwind CSS
- **Automatic Sync**: Scheduler to keep your achievements up to date
- **Image Integration**: SteamGridDB support for game artwork
- **Backup and Restore**: Backups all profiles, games, achievements and images to a zip file

## Quick Start

### Prerequisites

- Docker and Docker Compose installed

### Deployment with Bundled Database (Recommended)

The simplest way to get started is with the unified container that includes everything:

2. **[Option 1] Start the container**:
   ```bash
   docker run -d \
  -p 8000:80 \
  -v cpak_data:/data \
  docker.io/ghsvilela/cpak:latest
   ```

3. **[Option 2] Start the container with docker compose**:
   ```yaml
services:
  cpak:
    container_name: cpak
    hostname: cpak
    image: docker.io/ghsvilela/cpak:latest
    ports:
      - '8000:80'
    restart: unless-stopped
    volumes:
      - cpak_data:/data
volumes:
  cpak_data:
    driver: local
   ```

4. **Access the application**:
   ```
   http://localhost:8000
   ```

5. **Complete setup**:
   - Navigate to Settings page in the UI
   - Add your first profile (Steam, Xbox or Playstation)
   - (Optional) Add SteamGridDB API key for game images
   - Sync will start automatically after adding profile

### Deployment with External Database

Using another MongoDB instance:

2. **[Option 1] Start the container**:
   ```bash
   docker run -d \
  -p 8000:80 \
  -e EXTERNAL_DB=true \
  -e MONGO_URI=mongodb://your-mongo-host:27017/cpak \
  -v cpak_data:/data \
  docker.io/ghsvilela/cpak:latest
   ```

3. **[Option 2] Start the container with docker compose**:
   ```yaml
services:
  cpak:
    container_name: cpak
    hostname: cpak
    image: docker.io/ghsvilela/cpak:latest
    ports:
      - '8000:80'
    environment:
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb://your-mongo-host:27017/cpak
    restart: unless-stopped
    volumes:
      - cpak_data:/data
volumes:
  cpak_data:
    driver: local
   ```

### Optional: Custom Encryption Key

For enhanced security of API keys stored in the database, if no key is set, API keys are stored on database without any encryption.

```bash
# Generate a secure encryption key
openssl rand -base64 32

# Add to docker-compose file
environment:
  - ENCRYPTION_KEY=your-generated-key-here
```

### Environment Variables (Container Configuration)

These variables configure the container infrastructure (not application settings):

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENCRYPTION_KEY` | Encryption key for secret settings | Auto-generated (insecure) | Recommended |
| `EXTERNAL_DB` | Use external MongoDB | (empty = bundled) | No |
| `MONGO_URI` | MongoDB connection (external mode) | `mongodb://mongo:27017/cpak` | External DB mode only |

### Volume Configuration

**Unified mode** (default):
```yaml
volumes:
  - cpak_data:/data  # Contains both database / images and backups
```

**Split volumes** (optional):
```yaml
volumes:
  - cpak_db:/data/db
  - cpak_images:/data/images
  - cpak_backups:/data/backups
```

**External database mode**:
```yaml
volumes:
  - cpak_images:/data/images  # Only images and backup, no database
  - cpak_backups:/data/backups
```

**Bind mode with different ssds/hdds**:
```yaml
volumes:
  - /mnt/fast-ssd/cpak-db:/data/db
  - /mnt/large-storage-1/cpak-images:/data/images
  - /mnt/large-storage-2/cpak-backups:/data/backups
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
- Size: ~300 MB (includes MongoDB + all dependencies)
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
docker run -d -p 27017:27017 --name mongo mongo:8
```

### Local Development (With Docker)

```bash
# Build container
docker compose build

# Test locally
docker compose up -d
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
├── Dockerfile                # Multi-stage unified container build
└── docker-compose.yml        # Development: separate services
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
- `image_provider` - Image providers like SteamGridDB
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

## Contributing

1. Follow the speckit workflow (see `https://github.com/github/spec-kit`)
2. Update tasks as you go
3. Ensure all build/tests pass before submitting
4. Follow constitution principles (see `.specify/memory/constitution.md`)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.