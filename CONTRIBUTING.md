# Contributing to CPAK

Thank you for your interest in contributing to CPAK! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Development Workflows](#development-workflows)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)

---

## Development Setup

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development without Docker)
- Git

### Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ghsvilela/cpak.git
   cd cpak
   ```

2. **Choose your development approach**:

   - **Option A: Unified Container (Recommended for testing)**
   - **Option B: Separate Services (Recommended for development)**
   - **Option C: Local Development (No Docker)**

---

## Development Workflows

### Option A: Unified Container Development

Use this when testing the full production experience or debugging container-specific issues.

```bash
# Build and run unified container
docker compose up -d

# View logs
docker logs cpak -f

# Check service status
docker exec cpak supervisorctl status

# Rebuild after changes
docker compose build --no-cache
docker compose up -d
```

**Pros**: 
- Matches production environment exactly
- Tests full integration
- Single command deployment

**Cons**:
- Slower rebuild cycles (2-3 minutes)
- Harder to debug individual services
- Must rebuild container for each change

**Best for**:
- Final testing before PR
- Container configuration changes
- Deployment script modifications

---

### Option B: Separate Services Development (Recommended)

Use this for day-to-day development with faster iteration cycles.

```bash
# Run with separate services
docker compose -f docker-compose.dev.yml up -d

# View individual service logs
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml logs -f frontend

# Restart specific service after code changes
docker compose -f docker-compose.dev.yml restart api

# Rebuild specific service
docker compose -f docker-compose.dev.yml build api
docker compose -f docker-compose.dev.yml up -d api
```

**Services**:
- `mongo`: MongoDB 6 database
- `api`: Fastify backend (port 8080)
- `frontend`: Next.js frontend (port 3000)
- `web`: Caddy reverse proxy (port 8000)

**Pros**:
- Faster rebuild cycles (30-60 seconds per service)
- Easy debugging (separate logs per service)
- Can restart individual services
- Better for incremental development

**Cons**:
- Doesn't test unified container deployment
- Multiple containers to manage

**Best for**:
- Backend API development
- Frontend UI development
- Feature implementation
- Debugging

---

### Option C: Local Development (No Docker)

For maximum iteration speed when working on a single component.

#### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start MongoDB separately (or use Docker)
docker run -d -p 27017:27017 --name mongo-dev mongo:6

# Run in development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test
```

**Backend runs on**: http://localhost:8080

#### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Set up environment
# Backend API must be running (docker or locally)

# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

**Frontend runs on**: http://localhost:3000

**Pros**:
- Instant hot reload
- Native debugging tools
- Fastest iteration cycle
- No Docker overhead

**Cons**:
- Requires Node.js and MongoDB installed locally
- Environment setup more complex
- May not catch container-specific issues

**Best for**:
- Rapid prototyping
- UI component development
- Backend logic debugging
- Unit test development

---

## Project Structure

```
cpak/
├── backend/              # Fastify API server
│   ├── src/
│   │   ├── api/          # API routes and middleware
│   │   ├── models/       # Mongoose schemas
│   │   ├── services/     # Business logic
│   │   └── utils/        # Utilities (config, db, crypto, logger)
│   ├── package.json
│   └── tsconfig.json
├── frontend/             # Next.js application
│   ├── app/              # App router pages
│   ├── components/       # React components
│   ├── services/         # API client
│   ├── package.json
│   └── tailwind.config.ts
├── config/               # Container configuration
│   └── supervisord/      # Process management
├── scripts/              # Utility scripts
│   └── docker-entrypoint.sh
├── Dockerfile            # Unified container build
├── docker-compose.yml    # Default deployment
└── docker-compose.dev.yml # Development setup
```

---

## Testing

### Backend Tests

```bash
cd backend

# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test src/services/syncService.test.ts
```

### Frontend Tests

```bash
cd frontend

# Run tests (when implemented)
npm test
```

### Integration Tests

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up -d

# Test API endpoints
curl http://localhost:8000/api/health
curl http://localhost:8000/api/profiles

# Test frontend
open http://localhost:8000
```

### Container Tests

```bash
# Build and test unified container
docker compose build
docker compose up -d

# Verify services
docker exec cpak supervisorctl status

# Test health endpoint
curl http://localhost:8000/api/health

# Cleanup
docker compose down -v
```

---

## Code Style

### General Guidelines

- **TypeScript**: Use strict mode
- **Formatting**: Prettier (run `npm run format`)
- **Linting**: ESLint (run `npm run lint`)
- **Commits**: Conventional commits format

### Backend Code Style

- Use async/await (no callbacks)
- Use Zod for validation schemas
- Use dependency injection for services
- Log with winston logger (not console.log)
- Follow REST API conventions

**Example**:
```typescript
// Good
import { logger } from '../utils/logger.js';

export const getProfile = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      return reply.status(404).send({ error: 'Profile not found' });
    }
    return reply.send(profile);
  } catch (error) {
    logger.error('Error fetching profile:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
};
```

### Frontend Code Style

- Use React hooks (no class components)
- Use TypeScript for all components
- Use Tailwind CSS for styling
- Follow Next.js app router conventions

**Example**:
```tsx
// Good
'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/services/apiClient';

export default function ProfileSelector() {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    apiClient.getProfiles().then(setProfiles);
  }, []);

  return (
    <div className="space-y-4">
      {profiles.map(profile => (
        <div key={profile._id} className="card">
          {profile.displayName}
        </div>
      ))}
    </div>
  );
}
```

---

## Pull Request Process

### Before Submitting

1. **Test your changes**:
   ```bash
   # Run backend tests
   cd backend && npm test
   
   # Test unified container build
   docker compose build
   docker compose up -d
   docker exec cpak supervisorctl status
   ```

2. **Check code style**:
   ```bash
   cd backend && npm run lint
   cd frontend && npm run lint
   ```

3. **Update documentation**:
   - Update README if adding features
   - Update API docs if changing endpoints
   - Add comments for complex logic

### Submitting a PR

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Commit with conventional commits**:
   ```bash
   git commit -m "feat: add Xbox profile synchronization"
   git commit -m "fix: handle Steam API rate limiting"
   git commit -m "docs: update deployment guide"
   ```

3. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

4. **PR Description should include**:
   - Clear description of changes
   - Screenshots for UI changes
   - Testing steps
   - Related issue numbers

### PR Review Checklist

- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] Docker build succeeds
- [ ] Documentation updated
- [ ] No console.log statements (use logger)
- [ ] TypeScript compiles without errors
- [ ] Commits follow conventional format

---

## Common Development Tasks

### Adding a New API Endpoint

1. Create route handler in `backend/src/api/routes/`
2. Add Zod validation schema
3. Update OpenAPI/Swagger docs (if implemented)
4. Add tests
5. Update frontend apiClient if needed

### Adding a New Frontend Component

1. Create component in `frontend/components/`
2. Use TypeScript for props interface
3. Use Tailwind for styling
4. Add to Storybook (if implemented)
5. Use in page

### Modifying Database Schema

1. Update Mongoose model in `backend/src/models/`
2. Create migration script if needed
3. Update API responses
4. Update frontend types

### Debugging Container Issues

```bash
# View container logs
docker logs cpak

# Check service status
docker exec cpak supervisorctl status

# View individual service logs
docker exec cpak supervisorctl tail -f backend
docker exec cpak supervisorctl tail -f frontend

# Restart services
docker exec cpak supervisorctl restart backend

# Access container shell
docker exec -it cpak /bin/bash

# Check MongoDB connection
docker exec cpak mongosh --eval "db.adminCommand('ping')"
```

---

## Release Process

Releases are automated via GitHub Actions when a version tag is pushed.

```bash
# Update version in package.json files
npm version minor  # or major, patch

# Tag release
git tag v1.1.0
git push origin v1.1.0

# GitHub Actions will:
# 1. Build unified container
# 2. Run tests
# 3. Push to Docker Hub and GHCR
# 4. Create GitHub release
```

---

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/ghsvilela/cpak/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ghsvilela/cpak/discussions)
- **Documentation**: See `docs/` directory

---

## Code of Conduct

Be respectful and constructive. This is a community project.

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (see LICENSE file).
