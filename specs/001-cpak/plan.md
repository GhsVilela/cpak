# Implementation Plan: cpak — Cross Platform Achievement Keeper

**Branch**: `001-cpak` | **Date**: 2026-01-24 | **Spec**: `./spec.md`
**Input**: Feature specification from `/specs/001-cpak/spec.md`

## Summary

Self-hosted web app to track achievements from Steam, Xbox, and PlayStation. Frontend in Next.js (static export) consuming a REST backend (Node.js + Fastify) that persists data in local MongoDB. Image integration via SteamGridDB. Multi-profile per platform with daily scheduler.

## Technical Context

**Language/Version**: TypeScript (Node.js 20 LTS), Next.js 14
**Primary Dependencies**: Fastify, Mongoose, Zod, OpenAPI (Swagger UI), Next.js
**Storage**: MongoDB (local), ODM via Mongoose
**Testing**: Jest (frontend), Vitest + Supertest (backend)
**Target Platform**: Self-hosted Linux/Windows with Docker or bare metal; TLS via proxy (Caddy/NGINX)
**Project Type**: Web (frontend + backend)
**Performance Goals**: <2s page load from local cache for up to 500 games
**Constraints**: Static frontend build; REST backend with health/version; HTTPS in production; CORS locked to host; tokens encrypted at rest
**Scale/Scope**: Single/household use; multiple profiles; typical libraries up to thousands of games

## Constitution Check

- Static Frontend Minimalism: PASS (Next.js static export to `dist/`)
- REST Backend Simplicity: PASS (Fastify JSON, `/health`, `/version`, CRUD under `/api`)
- Self-Hosting First: PASS (Docker Compose; local MongoDB; proxy routing `/` and `/api`)
- Security Baseline: PASS (HTTPS at proxy, CORS, secrets via env, JWT optional)
- Observability & Operations: PASS (structured logs, health/readiness, optional `/metrics`)

## Project Structure

### Documentation (this feature)

```text
specs/001-cpak/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/          # Mongoose schemas
│   ├── services/        # platform adapters, sync logic
│   ├── api/             # Fastify routes
│   └── utils/           # config, logging
└── tests/
    ├── unit/
    ├── integration/
    └── contract/

frontend/
├── src/
│   ├── app/             # Next.js App Router pages
│   ├── components/
│   ├── styles/
│   └── services/        # API client, config loader
└── tests/
    └── unit/
```

**Structure Decision**: Two-project web app: `frontend` (Next.js static export) and `backend` (Fastify REST API), aligned with constitution’s static frontend + separate REST service.

## Complexity Tracking

N/A — No constitution violations.
