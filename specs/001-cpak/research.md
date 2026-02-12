# Research — cpak (Cross Platform Achievement Keeper)

## Decisions

- Decision: Next.js (static export) + Fastify backend + MongoDB
  - Rationale: Aligns with constitution’s static frontend; Fastify is performant, common with Node/Next stacks; MongoDB suits document-style achievements, self-hostable.
  - Alternatives considered: Next.js API routes (tightly coupled), Express (simpler but slower), PostgreSQL (relational; less flexible for documents).

- Decision: Image provider = SteamGridDB by default
  - Rationale: High-quality community artwork with available API; improves UX.
  - Alternatives considered: Platform-native images only (lower coverage/quality), user-local uploads (manual overhead).

- Decision: Multi-profile behavior = Per-profile views by default with aggregate toggle
  - Rationale: Clear scoping avoids conflation; aggregate is useful for overview.
  - Alternatives considered: Always aggregate (confusing ownership), strictly per-profile (less flexible).

- Decision: Xbox/PlayStation authentication approach = Device Code flow where available; fallback to manual token entry
  - Rationale: Self-hosted friendliness (no public redirect required); uses standardized OAuth 2.0 device flow when supported.
  - Alternatives considered: Hosted OAuth redirect (requires public URL), proprietary APIs (availability uncertain).

## Best Practices

- Next.js static export: externalize runtime config via `config.json` or `window.__CONFIG__` to avoid rebuilds.
- Fastify API: versioned base path `/api`; health `/health`; version `/version`; structured logging to stdout.
- MongoDB: Use unique composite indexes `(platform, profileId, gameId)`; store achievement documents with minimal nesting; paginate queries.
- Scheduling: Cron-like scheduler in backend; record sync runs; respect rate limits and backoff.
- CORS: Restrict to configured origin; preflight caching; avoid wildcard in production.
- Secrets: Env-only; never log; encrypt tokens at rest (e.g., libsodium or AES-GCM with key from env).

## Resolved Clarifications

- FR-010: Authentication method → Device Code flow for self-hosted; fallback to manual token entry.
- FR-011: Multi-profile aggregation → Default per-profile view; toggle to aggregate.
- FR-012: Image provider → SteamGridDB (user-provided API key), with platform-native fallback.
