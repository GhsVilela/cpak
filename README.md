# cpak — Cross Platform Achievement Keeper

Self-hosted trophy hunter for Steam, Xbox, and PlayStation achievements.

## Features

- **Multi-Platform Support**: Track achievements from Steam, Xbox, and PlayStation (Steam MVP ready)
- **Self-Hosted**: Run on your own infrastructure with Docker Compose
- **100% Filter**: Default view shows only completed games
- **Responsive Design**: Mobile-ready UI with Tailwind CSS
- **Automatic Sync**: Daily scheduler updates your achievements
- **Image Integration**: SteamGridDB support for game artwork

## Prerequisites

- Docker and Docker Compose
- Steam API key (get from https://steamcommunity.com/dev/apikey)
- (Optional) SteamGridDB API key for game images

## Quick Start

### Docker Deployment (Recommended)

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd cpak
   ```

2. **Start the services**:
   ```bash
   docker-compose up -d
   ```

   This will:
   - Build the Next.js frontend with Node 20 (static export to dist/)
   - Build and start the Fastify backend API
   - Start MongoDB database
   - Start Caddy web server on port 8000

3. **Access the application**:
   ```
   Frontend: http://localhost:8000
   Setup Wizard: http://localhost:8000/setup
   API Health: http://localhost:8000/api/health
   API Version: http://localhost:8000/api/version
   ```

4. **Complete setup wizard**:
   - Navigate to http://localhost:8000/setup
   - Enter your Steam API key and Steam ID
   - (Optional) Add SteamGridDB API key for game images
   - Click "Create Profile & Sync" to start syncing your achievements

### Configuration

Environment variables can be set in `docker-compose.yml`:

```yaml
environment:
  - API_PORT=8080
  - API_BASE_PATH=/api
  - MONGO_URI=mongodb://mongo:27017
  - MONGO_DB=cpak
  - ALLOWED_ORIGINS=http://localhost:8000
  - STEAM_API_KEY=${STEAM_API_KEY:-}
  - STEAMGRID_API_KEY=${STEAMGRID_API_KEY:-}
  - SCHEDULER_ENABLED=${SCHEDULER_ENABLED:-false}
  - SCHEDULER_CRON=${SCHEDULER_CRON:-0 3 * * *}
```

### Development Setup

If you want to develop locally without Docker:
   ```bash
   cd frontend
   npm run build
   ```

5. **Start with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

6. **Access the app**:
   - Web UI: http://localhost:8000
   - API: http://localhost:8000/api

7. **Setup wizard**:
   - Navigate to http://localhost:8000/setup
   - Enter your Steam API key (get from https://steamcommunity.com/dev/apikey)
   - Enter your Steam ID (find at https://steamid.io/)
   - Click "Continue" to start initial sync

## Development

### Backend (Fastify)
```bash
cd backend
npm run dev  # Starts on port 8080
```

### Frontend (Next.js)
```bash
cd frontend
npm run dev  # Development server on port 3000
npm run build  # Static export to dist/
```

## Architecture

- **Frontend**: Next.js 14 (static export), TypeScript, Tailwind CSS
- **Backend**: Fastify 5, Mongoose, Zod validation
- **Database**: MongoDB 6 (Docker container)
- **Proxy**: Caddy 2 (routes `/` → frontend, `/api` → backend)

## Project Structure

```
cpak/
├── backend/          # Fastify REST API
│   ├── src/
│   │   ├── api/      # Routes, middleware
│   │   ├── models/   # Mongoose schemas
│   │   ├── services/ # Business logic, adapters
│   │   └── utils/    # Config, logging, DB
│   ├── Dockerfile
│   └── package.json
├── frontend/         # Next.js static frontend
│   ├── app/          # Pages (setup, steam, xbox, playstation)
│   ├── components/   # Reusable components
│   ├── services/     # API client, config loader
│   ├── public/       # Static assets, runtime config
│   └── package.json
├── ops/              # Infrastructure
│   └── Caddyfile     # Reverse proxy config
└── docker-compose.yml
```

## API Endpoints

- `GET /health` - Health check
- `GET /version` - API version
- `GET /api/profiles` - List profiles
- `POST /api/profiles` - Create profile
- `PATCH /api/profiles/:id` - Update profile
- `DELETE /api/profiles/:id` - Delete profile
- `POST /api/sync/:platform` - Trigger sync
- `GET /api/games` - List games (supports `?platform=steam&onlyCompleted=true`)
- `GET /api/achievements` - List achievements (supports `?gameId=&profileId=`)

## User Stories

### ✅ US1: First-Time Setup & Initial Sync (MVP - P1)
- Setup wizard for Steam/Xbox/PlayStation credentials
- Initial sync of games and achievements
- Platform pages with 100% completion filter default

### ⏳ US2: Multi-Profile Management & Scheduling (P2)
- Multiple profiles per platform
- Daily automatic sync scheduler
- Manual sync per profile

### ⏳ US3: Game Images & Themed Views (P3)
- SteamGridDB integration for game artwork
- Platform-themed UI colors
- Responsive grid layouts

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Backend port | `8080` |
| `API_BASE_PATH` | API prefix | `/api` |
| `MONGO_URI` | MongoDB connection | `mongodb://localhost:27017` |
| `MONGO_DB` | Database name | `cpak` |
| `ALLOWED_ORIGINS` | CORS origins | `http://localhost:8000` |
| `STEAM_API_KEY` | Steam Web API key | Required |
| `SCHEDULER_CRON` | Sync schedule | `0 2 * * *` (2 AM daily) |

### Runtime Config (frontend/public/config.json)

```json
{
  "API_BASE_URL": "http://localhost:8000/api"
}
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
