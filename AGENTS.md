# AGENTS.md - cpak Development Guide

This document provides guidance for AI agents working on the cpak (Cross Platform Achievement Keeper) codebase. It is the primary source of truth for project structure, conventions, and development workflows.

## Project Overview

cpak is a self-hosted, cross-platform achievement keeper for Steam, Xbox, and PlayStation. It runs as a unified Docker container with:
- **Frontend**: Next.js 15 (standalone), React 19, TypeScript, Tailwind CSS
- **Backend**: Fastify 5, TypeScript (ESM), Mongoose, Zod validation
- **Database**: MongoDB 8 (bundled or external)
- **Web Server**: Caddy 2 (reverse proxy)
- **Process Manager**: supervisord

All data is stored locally; no data is sent to third parties.

## Quick Start

### Local Development (without Docker)
```bash
# Backend
cd backend
npm install
npm run dev  # port 8080

# Frontend  
cd frontend
npm install
npm run dev  # port 3000

# MongoDB
docker run -d -p 27017:27017 --name mongo mongo:8
```

### Local Development (with Docker)
```bash
docker compose build
docker compose up -d
```

## Project Structure

```
cpak/
├── backend/           # Fastify REST API (TypeScript ESM)
│   ├── src/
│   │   ├── api/       # Routes, middleware, server
│   │   ├── migrations/# DB migrations
│   │   ├── models/    # Mongoose schemas
│   │   ├── services/  # Business logic, platform adapters
│   │   └── utils/     # Config, logging, DB, crypto, storage
│   └── tests/
├── frontend/          # Next.js app
│   ├── app/           # App router pages
│   ├── components/    # React components
│   ├── services/      # API client
│   └── tests/
├── config/            # Caddy, supervisord configs
├── docker/            # Docker-related assets
├── scripts/           # Entrypoint scripts
└── Dockerfile         # Multi-stage unified container build
```

## Code Conventions

### TypeScript
- Use TypeScript strict mode
- Backend uses ESM (`"type": "module"`)
- Prefer explicit types; use Zod for runtime validation
- Follow existing patterns in neighboring files

### Backend (Fastify)
- Routes in `backend/src/api/routes/`
- Models in `backend/src/models/` (Mongoose schemas)
- Platform adapters in `backend/src/services/adapters/` (steam, xbox, playstation)
- Use async/await, proper error handling
- Validate requests with Zod schemas

### Frontend (Next.js 15)
- App Router structure in `frontend/app/`
- Use React 19 features appropriately
- Tailwind CSS for styling
- Client components marked with `'use client'` when needed
- API calls go through `frontend/services/`

### General
- Never commit secrets or API keys
- Follow security best practices
- Mimic existing code style and patterns
- Check if libraries exist before adding dependencies

## Testing

### Backend
```bash
cd backend
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Frontend
```bash
cd frontend
npm test
npm run test:watch
npm run test:coverage
```

Tests use Vitest. Backend tests may use mongodb-memory-server for isolation.

## Linting

```bash
# Backend
cd backend && npm run lint

# Frontend
cd frontend && npm run lint
```

Always run lint and typecheck before considering work complete.

## Git Workflow

- Create feature branches from main
- Make focused, atomic commits with clear messages
- Do not commit unless explicitly requested
- Never commit secrets, tokens, or credentials
- Review changes before committing

## Key Patterns

- **Profiles**: Each platform (Steam/Xbox/PlayStation) has profiles
- **Games & Achievements**: Stored per profile with sync tracking
- **Settings**: API keys stored in DB; auto-encrypted if `ENCRYPTION_KEY` env var is set
- **Sync**: Background sync via scheduler; supports cancellation
- **Images**: Custom game images stored in filesystem, served via API
- **Backup/Restore**: Async jobs with progress tracking

## API Structure

See README.md for full API endpoint documentation. Routes are under `/api/*`.

## Adding New Features

1. Understand existing patterns by reading related files
2. Follow the same architecture (models → services → routes for backend)
3. Add appropriate types and validation
4. Update API client if frontend needs new endpoints
5. Add tests when appropriate
6. Run lint and tests

## Common Tasks

- **New platform adapter**: Add to `backend/src/services/adapters/`, update routes/services
- **New API endpoint**: Add route in `backend/src/api/routes/`, update server registration if needed
- **UI component**: Add to `frontend/components/`, follow existing patterns
- **Database schema change**: Update model in `backend/src/models/`, consider migration needs
