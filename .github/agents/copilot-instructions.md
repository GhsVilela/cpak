# cpak Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-24

## Active Technologies
- Node.js 20 (Alpine base), TypeScript 5.7+ (002-container-deployment)
- MongoDB (document store), filesystem (achievement images) (002-container-deployment)
- TypeScript 5.x with Node.js 20+ (Next.js 15+, Fastify 5+) + Next.js 15 (frontend), Fastify 5 (backend), MongoDB 8 (database), node-cron, p-limit (concurrency control) (003-performance-optimization)
- MongoDB 8+ with collections: profiles, games, achievements, settings, sync_runs, backupMetadata (003-performance-optimization)

- TypeScript (Node.js 20 LTS), Next.js 14 + Fastify, Mongoose, Zod, OpenAPI (Swagger UI), Next.js (001-trophy-hunter)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript (Node.js 20 LTS), Next.js 14: Follow standard conventions

## Recent Changes
- 003-performance-optimization: Added TypeScript 5.x with Node.js 20+ (Next.js 15+, Fastify 5+) + Next.js 15 (frontend), Fastify 5 (backend), MongoDB 8 (database), node-cron, p-limit (concurrency control)
- 002-container-deployment: Added Node.js 20 (Alpine base), TypeScript 5.7+

- 001-trophy-hunter: Added TypeScript (Node.js 20 LTS), Next.js 14 + Fastify, Mongoose, Zod, OpenAPI (Swagger UI), Next.js

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
