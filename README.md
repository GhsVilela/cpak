# cpak - Cross Platform Achievement Keeper

[![Build](https://github.com/ghsvilela/cpak/actions/workflows/build.yml/badge.svg)](https://github.com/ghsvilela/cpak/actions/workflows/build.yml)
[![Release](https://github.com/ghsvilela/cpak/actions/workflows/release.yml/badge.svg)](https://github.com/ghsvilela/cpak/actions/workflows/release.yml)
[![Docker Hub](https://img.shields.io/docker/v/ghsvilela/cpak?label=Docker%20Hub&logo=docker&sort=semver&filter=^[0-9]+\.[0-9]+\.[0-9]+$)](https://hub.docker.com/r/ghsvilela/cpak)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-cpak-blue?logo=github)](https://ghcr.io/ghsvilela/cpak)
[![Docker Image Size](https://img.shields.io/docker/image-size/ghsvilela/cpak/latest?label=image%20size)](https://hub.docker.com/r/ghsvilela/cpak)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Achievements are more than just a game feature, they're memories. CPAK is a self-hosted, cross-platform achievement keeper for Steam, Xbox, and PlayStation that lets you preserve your gaming memories locally, forever. Remember to backup regularly to keep them safe.

> **Note on Development Approach**: This project started as a self-learning journey to improve my skills in AI-assisted development, exploring how AI tools can be used effectively in real-world software projects, with the goal of bringing that knowledge and experience to my daily professional work. It leverages AI-assisted "vibe coding" with [Speckit](https://github.com/github/spec-kit) for spec-driven development. While AI helps accelerate development, all code is reviewed, tested, and refined with my technical knowledge and creative vision to ensure quality and alignment with the project's goals.

## Features

- **Multi-Platform Support**: Save achievements from Steam, Xbox, and PlayStation (Steam and Xbox fully supported; PlayStation in progress)
- **Self-Hosted**: Run on your own infrastructure with Docker
- **Unified Container**: All-in-one image with web server, backend, frontend, and MongoDB
- **UI-Based Configuration**: Configure API keys and all other settings through the web interface (no environment variables needed)
- **Responsive Design**: Mobile-ready UI with Tailwind CSS
- **Automatic Sync**: Scheduler to keep your achievements up to date
- **Image Integration**: SteamGridDB support for game artwork
- **Backup and Restore**: Backup and restore all profiles, games, achievements, and images to a zip file
- **Steam Profile Showcase**: Displays your total achievement count from your Steam profile showcase alongside tracked and untracked stats
- **Xbox Gamerscore Tracking**: Shows total Gamerscore and Xbox 360 Gamerscore separately

## Quick Start

### Prerequisites

- Docker and Docker Compose installed

### Deployment with Bundled Database (Recommended)

The simplest way to get started is with the unified container that includes everything:

1. **[Option 1] Start the container**:
   ```bash
   docker run -d \
     -p 8000:80 \
     -v cpak_data:/app/data \
     docker.io/ghsvilela/cpak:latest
   ```

2. **[Option 2] Start the container with docker compose**:
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
         - cpak_data:/app/data
   volumes:
     cpak_data:
       driver: local
   ```

3. **Access the application**:
   ```
   http://localhost:8000
   ```

4. **Complete setup**:
   - Navigate to Settings page in the UI
   - Add your first profile (Steam, Xbox or Playstation)
   - (Optional) Add SteamGridDB API key for game images
   - Sync will start automatically after adding profile

### Deployment with External Database

Using another MongoDB instance:

1. **[Option 1] Start the container**:
   ```bash
   docker run -d \
     -p 8000:80 \
     -e EXTERNAL_DB=true \
     -e MONGO_URI=mongodb://your-mongo-host:27017/cpak \
     -v cpak_data:/app/data \
     docker.io/ghsvilela/cpak:latest
   ```

2. **[Option 2] Start the container with docker compose**:
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
         - MONGO_URI=mongodb://your-user:your-pass@your-host:27017/cpak?authSource=admin
       restart: unless-stopped
       volumes:
         - cpak_data:/app/data
   volumes:
     cpak_data:
       driver: local
   ```

### Optional: Encryption for API Keys and Tokens

By default, API keys and tokens are stored as **plain text** in the database. For enhanced security, set an encryption key:

```bash
# Generate a secure encryption key
openssl rand -base64 32

# Add to docker-compose file
environment:
  - ENCRYPTION_KEY=your-generated-key-here
```

When `ENCRYPTION_KEY` is set, all credentials are encrypted using AES-256-GCM before storage. Without it, credentials are stored in plain text (suitable for testing/development or trusted environments).

### Optional: HTTPS with Self-Signed Certificate

By default, cpak serves over plain HTTP (port 80). If you need HTTPS, for example, to register a non-localhost Xbox OAuth redirect URI, set `HTTPS_MODE=self-signed`. Caddy will automatically generate a self-signed certificate via its built-in CA.

Only a single port needs to be mapped. Caddy detects whether an incoming connection is plain HTTP or TLS on the same port, plain HTTP requests are automatically redirected to HTTPS, preserving the host and port. For example, with `-p 30151:443`, both `http://host:30151` and `https://host:30151` work; the former redirects to the latter.

```bash
docker run -d \
  -p 443:443 \
  -e HTTPS_MODE=self-signed \
  -v cpak_data:/app/data \
  docker.io/ghsvilela/cpak:latest
```

Or with docker compose on a custom host port (e.g. NAS on port 30052):

```yaml
services:
  cpak:
    image: docker.io/ghsvilela/cpak:latest
    ports:
      - '30151:443'   # HTTPS - access via https://<nas-ip>:30151
    environment:
      - HTTPS_MODE=self-signed
    volumes:
      - cpak_data:/app/data
```

Access cpak at `https://<your-host>:30151`. Your browser will show an **untrusted certificate** warning the first time, click **Advanced → Proceed** to accept it. After that everything works normally, including the Xbox OAuth sign-in flow (Microsoft accepts HTTPS with self-signed certs as a valid redirect URI target once the browser has the exception).

> **Xbox redirect URI**: Register `https://<your-host>:<port>/api/auth/xbox/callback` in your Azure app registration. See the in-app Xbox OAuth Setup Guide (Settings → Xbox OAuth Settings → Setup Guide) for full instructions.

### Optional: HTTPS with Your Own Certificate

If you already have a certificate (e.g. from Let's Encrypt, ZeroSSL, or issued by your own CA), set `HTTPS_MODE=custom-cert` and mount your certificate and private key into the container at the fixed paths Caddy expects:

```bash
docker run -d \
  -p 443:443 \
  -e HTTPS_MODE=custom-cert \
  -v /path/to/cert.pem:/etc/caddy/tls/cert.pem:ro \
  -v /path/to/key.pem:/etc/caddy/tls/key.pem:ro \
  -v cpak_data:/app/data \
  docker.io/ghsvilela/cpak:latest
```

Or with docker compose:

```yaml
services:
  cpak:
    image: docker.io/ghsvilela/cpak:latest
    ports:
      - '30151:443'   # HTTPS - access via https://<nas-ip>:30151
    environment:
      - HTTPS_MODE=custom-cert
    volumes:
      - cpak_data:/app/data
      - /path/to/cert.pem:/etc/caddy/tls/cert.pem:ro
      - /path/to/key.pem:/etc/caddy/tls/key.pem:ro
```

Both files must be PEM-encoded. The container will fail to start if either file is missing.

### Environment Variables (Container Configuration)

These variables configure the container infrastructure (not application settings):

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENCRYPTION_KEY` | Encryption key for secret settings (API keys, tokens) | Plain text storage | Optional (recommended) |
| `HTTPS_MODE` | `self-signed` - Caddy-issued self-signed cert; `custom-cert` - user-provided cert | HTTP only | Optional |
| `EXTERNAL_DB` | Use external MongoDB | (empty = bundled) | No |
| `MONGO_URI` | MongoDB connection (external mode) | `mongodb://mongo:27017/cpak` | External DB mode only |

### Volume Configuration

**Unified mode** (default):
```yaml
volumes:
  - cpak_data:/app/data  # Contains database, images and backups
```

**Split volumes** (optional):
```yaml
volumes:
  - cpak_db:/app/data/db
  - cpak_images:/app/data/images
  - cpak_backups:/app/data/backups
```

**External database mode**:
```yaml
volumes:
  - cpak_images:/app/data/images  # Only images and backup, no database
  - cpak_backups:/app/data/backups
```

**Bind mode with different ssds/hdds**:
```yaml
volumes:
  - /mnt/fast-ssd/cpak-db:/app/data/db
  - /mnt/large-storage-1/cpak-images:/app/data/images
  - /mnt/large-storage-2/cpak-backups:/app/data/backups
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

Contributions are welcome in any form, with or without AI assistance.

- If you'd like to follow the spec-driven workflow used in this project, see [Speckit](https://github.com/github/spec-kit). It's a great way to keep changes aligned with documented specs and tasks, but it is entirely optional.
- Traditional contributions (bug fixes, features, tests, docs) are just as welcome, open an issue or a pull request and we'll take it from there.
- Ensure all builds and tests pass before submitting.
- Where relevant, follow the existing code conventions in the repo.

## Legal Disclaimer

This project is not affiliated with, endorsed by, or associated with Valve Corporation, Microsoft, or Sony Interactive Entertainment in any way. All trademarks and registered trademarks are the property of their respective owners.

cpak uses publicly available APIs to retrieve achievement and game data on behalf of users, using credentials and API keys that users provide themselves. All data is fetched and stored locally on the user's own infrastructure. No data is sent to any third-party service by this application.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.