# Quickstart — cpak (Cross Platform Achievement Keeper)

## Prerequisites
- Docker and Docker Compose (recommended)
- Node.js 20 LTS (for local development)
- Steam API key from https://steamcommunity.com/dev/apikey
- Steam ID (find at https://steamid.io/)
- SteamGridDB API key (optional but recommended for enhanced images)

## Production Setup with Docker

### 1. Clone and Configure

```bash
git clone <repository-url>
cd cpak
```

### 2. Start All Services

```bash
docker-compose up -d
```

This starts:
- **web**: Caddy reverse proxy on port 8000
- **api**: Fastify backend on port 8080
- **mongo**: MongoDB on port 27017

### 3. Access Application

- Frontend: http://localhost:8000
- Setup Wizard: http://localhost:8000/setup
- Settings: http://localhost:8000/settings
- Steam Games: http://localhost:8000/steam
- API Health: http://localhost:8000/api/health
- API Version: http://localhost:8000/api/version

### 4. Complete Setup Wizard

1. Navigate to http://localhost:8000/setup
2. Enter your Steam API key
3. Enter your Steam ID (17-digit number)
4. (Optional) Add SteamGridDB API key for game artwork
5. Click "Create Profile & Sync"
6. Wait for initial sync to complete

### 5. Configure Scheduler (Optional)

1. Go to http://localhost:8000/settings
2. Enable "Automatic Sync Scheduler"
3. Set cron expression (default: `0 3 * * *` = daily at 3 AM)
4. Save settings

## Environment Configuration
Backend `.env` (or set in docker-compose.yml):
```bash
# API Configuration
API_PORT=8080
API_BASE_PATH=/api

# Database
MONGO_URI=mongodb://mongo:27017
MONGO_DB=cpak

# CORS
ALLOWED_ORIGINS=http://localhost:8000

# Scheduler
SCHEDULER_ENABLED=false
SCHEDULER_CRON=0 3 * * *

# Platform Credentials (configure via UI or environment)
STEAM_API_KEY=
STEAMGRID_API_KEY=
XBOX_CLIENT_ID=
XBOX_CLIENT_SECRET=
XBOX_REDIRECT_URI=
PLAYSTATION_CLIENT_ID=
PLAYSTATION_CLIENT_SECRET=
PLAYSTATION_REDIRECT_URI=

# Performance Tuning
ICON_DOWNLOAD_CONCURRENCY=5
IMAGES_DIR=/app/data/images
```

Frontend runtime `public/config.json` (auto-generated during build):
```json
{
  "API_BASE_URL": "http://localhost:8000/api"
}
```

## Docker Compose Reference

Current `docker-compose.yml` structure:

```yaml
version: "3.9"
services:
  web:
    image: caddy:2
    volumes:
      - ./ops/Caddyfile:/etc/caddy/Caddyfile
    ports:
      - "8000:80"
    depends_on:
      - api

  mongo:
    image: mongo:6
    volumes:
      - ./data/mongo:/data/db
    environment:
      - MONGO_INITDB_DATABASE=cpak

  api:
    build: ./backend
    environment:
      - API_PORT=8080
      - API_BASE_PATH=/api
      - MONGO_URI=mongodb://mongo:27017
      - MONGO_DB=cpak
      - ALLOWED_ORIGINS=http://localhost:8000
      - IMAGES_DIR=/app/data/images
      - ICON_DOWNLOAD_CONCURRENCY=5
    volumes:
      - ./data/images:/app/data/images
    depends_on:
      - mongo

  frontend:
    build:
      context: ./frontend
      target: builder
    command: tail -f /dev/null
```

## Development Workflow

### Backend Development
```bash
cd backend
npm install
npm run dev  # Starts on port 8080 with hot reload
npm test     # Run tests
npm run build  # TypeScript compilation
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev    # Development server on port 3000
npm run build  # Static export to dist/
npm run lint   # ESLint check
```

### Database Management
```bash
# Connect to MongoDB
docker exec -it cpak-mongo-1 mongosh cpak

# Backup database
docker exec cpak-mongo-1 mongodump --db=cpak --out=/tmp/backup
docker cp cpak-mongo-1:/tmp/backup ./backup

# Restore database
docker cp ./backup cpak-mongo-1:/tmp/backup
docker exec cpak-mongo-1 mongorestore /tmp/backup

# Clean database (remove all data)
docker exec cpak-mongo-1 mongosh cpak --eval "db.dropDatabase()"
```

## Troubleshooting

### Sync Issues

**Problem**: Games not appearing after sync
- Verify Steam profile is set to **Public** (not Private/Friends Only)
- Check Steam API key is valid
- Review API logs: `docker logs cpak-api-1`

**Problem**: Free-to-play games missing
- Steam API may not return F2P games if profile is Private
- Set profile to Public in Steam Privacy Settings

### Image Download Issues

**Problem**: Game images not loading
- Check if SteamGridDB API key is configured
- Verify IMAGES_DIR volume mount is correct
- Check logs for download errors: `docker logs cpak-api-1 | grep -i image`

**Problem**: Achievement icons failing to download
- Reduce ICON_DOWNLOAD_CONCURRENCY (default: 5)
- Check rate limiting status in logs
- Verify Steam CDN accessibility

### Performance Issues

**Problem**: Slow page loads
- Enable pagination in Games API calls (use `limit` and `offset`)
- Check MongoDB indexes are created
- Review browser console for API errors

**Problem**: Sync taking too long
- Normal for first sync with many games (26,000+ achievements)
- Progress logged every 1,000 achievements
- Subsequent syncs are incremental and faster

## Tips & Best Practices

1. **First Sync**: Allow 5-15 minutes for large libraries (500+ games)
2. **Scheduler**: Enable after first successful sync to keep data current
3. **Privacy**: Keep Steam profile Public for reliable syncing
4. **Backups**: Use export/import API endpoints for data portability
5. **Images**: Configure SteamGridDB key for best visual experience
6. **Monitoring**: Check `/api/health` and `/api/sync/runs` regularly
