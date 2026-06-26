# cpak Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-24

## Active Technologies
- Node.js 20 (Alpine base), TypeScript 5.7+ (002-container-deployment)
- MongoDB (document store), filesystem (achievement images) (002-container-deployment)
- TypeScript 5.x with Node.js 20+ (Next.js 15+, Fastify 5+) + Next.js 15 (frontend), Fastify 5 (backend), MongoDB 8 (database), node-cron, p-limit (concurrency control) (003-performance-optimization)
- MongoDB 8+ with collections: profiles, games, achievements, settings, sync_runs, backupMetadata (003-performance-optimization)
- TypeScript 5.9 (backend ESM, `"type": "module"`); TypeScript 5.9 (frontend Next.js 15) + Backend — Fastify 5, Mongoose 8, node-cron 4, Zod 3; Frontend — Next.js 15, React 19, Tailwind CSS 3 (004-regression-tests)
- MongoDB 8 (bundled or external); `mongodb-memory-server` 10 for test isolation (004-regression-tests)
- TypeScript 5.7+, Node.js 20+ + Fastify 5, Mongoose 8, Next.js 15, React 19, `@xboxreplay/xboxlive-auth` 5.x (new) (005-xbox-integration)
- MongoDB 8+ (existing collections: profiles, games, achievements, settings, syncoperations, syncruns) (005-xbox-integration)
- TypeScript (Node 20) + Fastify 5+ (backend), Next.js 15+ (frontend), Mongoose (ODM), `psn-api` npm package (for PSN API access), Vitest (testing) (006-playstation-integration)
- MongoDB (bundled or external) — existing collections: profiles, games, achievements, sync_operations, settings (006-playstation-integration)
- TypeScript 5.x (Node 20), React 19 + Fastify 5.2, Next.js 15.1, Mongoose 8.9, Sharp 0.32, Tailwind CSS 3.4 (007-game-visualization-modes)
- MongoDB 8+ (bundled in unified container), file system for images (`/app/data/images/`) (007-game-visualization-modes)

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
- 007-game-visualization-modes: Added TypeScript 5.x (Node 20), React 19 + Fastify 5.2, Next.js 15.1, Mongoose 8.9, Sharp 0.32, Tailwind CSS 3.4
- 006-playstation-integration: Added TypeScript (Node 20) + Fastify 5+ (backend), Next.js 15+ (frontend), Mongoose (ODM), `psn-api` npm package (for PSN API access), Vitest (testing)
- 005-xbox-integration: Added TypeScript 5.7+, Node.js 20+ + Fastify 5, Mongoose 8, Next.js 15, React 19, `@xboxreplay/xboxlive-auth` 5.x (new)


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
