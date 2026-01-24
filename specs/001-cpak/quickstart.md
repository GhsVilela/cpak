# Quickstart — cpak (Cross Platform Achievement Keeper)

## Prerequisites
- Docker (recommended) or Node.js 20 LTS
- MongoDB (Docker container or local service)
- SteamGridDB API key (optional but recommended)

## Environment
Create `.env` files for backend and frontend runtime config.

Backend `.env`:
```
API_PORT=8080
API_BASE_PATH=/api
MONGO_URI=mongodb://mongo:27017
MONGO_DB=cpak
ALLOWED_ORIGINS=http://localhost:3000
JWT_SECRET=change-me
SCHEDULER_ENABLED=false
SCHEDULER_CRON=0 3 * * *
STEAM_API_KEY=
XBOX_CLIENT_ID=
XBOX_CLIENT_SECRET=
XBOX_REDIRECT_URI=
PLAYSTATION_CLIENT_ID=
PLAYSTATION_CLIENT_SECRET=
PLAYSTATION_REDIRECT_URI=
STEAMGRID_API_KEY=
```

Frontend runtime `dist/config.json` (copied at deploy):
```
{
  "API_BASE_URL": "http://localhost:8080/api"
}
```

## Docker Compose
Create `docker-compose.yml`:
```
version: "3.9"
services:
  web:
    image: caddy:2
    volumes:
      - ./frontend/dist:/usr/share/caddy
      - ./ops/Caddyfile:/etc/caddy/Caddyfile
    ports:
      - "80:80"
      - "443:443"
    environment:
      - API_BASE_URL=http://localhost:8080/api

  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
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
      - ALLOWED_ORIGINS=http://localhost:80
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - mongo
    ports:
      - "8080:8080"
```

## Development
- Frontend: `frontend/` Next.js app; build with `npm run build` and export static assets to `frontend/dist`.
- Backend: `backend/` Fastify API; run `npm run dev` for local; `npm test` for unit/integration.

## Try It
- Start services: `docker compose up -d`
- Open `http://localhost` to load the frontend; complete setup; run initial sync.
- Visit `http://localhost:8080/api/health` and `/version` to verify backend.
