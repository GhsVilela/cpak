# Environment Variables Contract

**Feature**: Containerization Improvements  
**Version**: 1.0.0  
**Date**: February 12, 2026

## Overview

This contract defines the environment variables supported by the unified CPAK container image. The goal is to minimize required variables to ≤3 essential settings, with all optional configuration moved to UI-based management.

## Essential Variables (Deployment-Time)

These variables MUST or SHOULD be set when deploying the container. They cannot be managed through the UI.

### ENCRYPTION_KEY

**Status**: RECOMMENDED  
**Type**: String (32+ characters recommended)  
**Default**: Built-in default key (weak security)  
**Purpose**: Encryption key for securing sensitive data (API keys, credentials) stored in database

**Usage**:
```yaml
environment:
  - ENCRYPTION_KEY=your-strong-random-key-here
```

**Security Notes**:
- If not provided, container uses a default key with security warning logged
- Without custom key, sensitive data is weakly encrypted
- Generate with: `openssl rand -hex 32`
- DO NOT commit to version control
- Use Docker secrets or environment file management

**Validation**:
- No format validation (any string accepted)
- Minimum 16 characters recommended
- Unique per deployment recommended

---

### MONGO_URI (External Database Mode Only)

**Status**: REQUIRED when `EXTERNAL_DB=true` or `USE_EXTERNAL_DB=true`  
**Type**: MongoDB connection string  
**Default**: `mongodb://localhost:27017` (bundled mode)  
**Purpose**: Connection string for external MongoDB database

**Usage**:
```yaml
environment:
  - EXTERNAL_DB=true
  - MONGO_URI=mongodb://mongo.example.com:27017/cpak
```

**Format**: Standard MongoDB connection string
```
mongodb://[username:password@]host[:port][/database][?options]
```

**Examples**:
- Simple: `mongodb://mongo-host:27017`
- With auth: `mongodb://user:pass@mongo-host:27017/cpak`
- With options: `mongodb://mongo-host:27017/cpak?authSource=admin`
- Replica set: `mongodb://host1:27017,host2:27017,host3:27017/cpak?replicaSet=rs0`

**Validation**:
- Must start with `mongodb://` or `mongodb+srv://`
- Connection tested on startup
- Container exits with error if connection fails

---

### EXTERNAL_DB / USE_EXTERNAL_DB

**Status**: OPTIONAL  
**Type**: Boolean (string "true" or "false")  
**Default**: `false` (bundled database mode)  
**Purpose**: Flag to disable bundled MongoDB and use external database

**Usage**:
```yaml
environment:
  - EXTERNAL_DB=true
  - MONGO_URI=mongodb://external-mongo:27017/cpak
```

**Behavior**:
- `false` or not set: Start bundled MongoDB (default)
- `true` or `"true"`: Skip MongoDB startup, require MONGO_URI

**Validation**:
- Accepts: "true", "false", "1", "0", "yes", "no" (case insensitive)
- Any other value treated as `false`

---

## Optional Variables (Backward Compatibility)

These variables are supported for backward compatibility but SHOULD be configured through the UI instead.

### Platform API Keys

**Status**: DEPRECATED - Use UI instead  
**Purpose**: API credentials for game platforms  
**Current Behavior**: Read if settings not in database

| Variable | Description | UI Setting Key |
|----------|-------------|----------------|
| `STEAM_API_KEY` | Steam Web API key | `steam_api_key` |
| `XBOX_CLIENT_ID` | Xbox OAuth client ID | `xbox_client_id` |
| `XBOX_CLIENT_SECRET` | Xbox OAuth secret | `xbox_client_secret` |
| `PLAYSTATION_CLIENT_ID` | PlayStation OAuth client ID | `playstation_client_id` |
| `PLAYSTATION_CLIENT_SECRET` | PlayStation OAuth secret | `playstation_client_secret` |
| `STEAMGRID_API_KEY` | SteamGridDB API key | `steamgrid_api_key` |

**Migration Path**: 
1. Set via environment initially (works)
2. Configure in UI Settings page
3. Remove from docker-compose/environment
4. Container uses UI-configured values

---

### Scheduler Settings

**Status**: DEPRECATED - Use UI instead  
**Purpose**: Automated sync scheduling configuration

| Variable | Description | Default | UI Setting Key |
|----------|-------------|---------|----------------|
| `SCHEDULER_ENABLED` | Enable automatic sync | `false` | `scheduler_enabled` |
| `SCHEDULER_CRON` | Cron expression for sync | `0 3 * * *` | `scheduler_cron` |

**Migration Path**: Configure in UI Settings → Scheduler section

---

### Sync Settings

**Status**: DEPRECATED - Use UI instead  
**Purpose**: Sync behavior configuration

| Variable | Description | Default | UI Setting Key |
|----------|-------------|---------|----------------|
| `SYNC_BATCH_SIZE` | Items per sync batch | `10` | `sync_batch_size` |
| `ICON_DOWNLOAD_CONCURRENCY` | Parallel image downloads | `5` | `icon_download_concurrency` |

**Migration Path**: Configure in UI Settings → Sync section

---

## Removed Variables (No Longer Configurable)

These variables were removed as they are now fixed internally for the unified container.

| Variable | Previous Use | New Behavior |
|----------|--------------|--------------|
| `API_PORT` | Backend listen port | Fixed: 8080 (internal, not exposed) |
| `API_BASE_PATH` | API path prefix | Fixed: /api |
| `ALLOWED_ORIGINS` | CORS origins | Auto-detected from request headers |
| `IMAGES_DIR` | Image storage path | Fixed: /data/images |
| `NODE_ENV` | Runtime environment | Fixed: production |

**Rationale**: These settings are implementation details that don't need user configuration in unified container architecture.

---

## Volume Mounts (Required)

While not environment variables, these mount points are essential configuration.

### /data (Unified Mode - Default)

**Status**: REQUIRED for data persistence  
**Purpose**: Single volume for all persistent data

**Usage**:
```yaml
volumes:
  - cpak_data:/data
```

**Contains**:
- `/data/db` - MongoDB database files (bundled mode)
- `/data/images` - Achievement image cache

**Permissions**: Container user needs read/write access

---

### /data/db and /data/images (Split Mode - Advanced)

**Status**: OPTIONAL - for advanced users wanting separate volumes

**Usage**:
```yaml
volumes:
  - cpak_db:/data/db
  - cpak_images:/data/images
```

**Behavior**: Container detects separate mount points and uses split mode automatically

---

## Configuration Precedence

The application reads configuration in this order (highest priority first):

1. **Database settings** (configured via UI)
2. **Environment variables** (deployment-time)
3. **Built-in defaults** (hardcoded fallbacks)

**Example**: If `steam_api_key` exists in database, it's used. Otherwise, `STEAM_API_KEY` environment variable is checked. If neither exists, Steam sync functionality is disabled.

---

## Validation & Health Checks

### Startup Validation

On container start, the following checks are performed:

1. **Database connectivity**:
   - Bundled mode: MongoDB starts, health checked
   - External mode: MONGO_URI connection tested
   - Exit with error if database unavailable

2. **Volume mounts**:
   - Check `/data` or `/data/db` is writable
   - Check `/data/images` is writable
   - Log warning if not writable, exit if critical

3. **Encryption key**:
   - Check ENCRYPTION_KEY length
   - Log warning if using default key
   - DO NOT exit (allow weak encryption rather than fail)

### Health Endpoint

**URL**: `GET /health`

**Response** (healthy):
```json
{
  "status": "healthy",
  "database": "connected",
  "encryption": "custom_key",
  "volumes": {
    "db": "writable",
    "images": "writable"
  },
  "timestamp": "2026-02-12T10:30:00Z"
}
```

**Response** (unhealthy):
```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "MongoDB connection failed",
  "timestamp": "2026-02-12T10:30:00Z"
}
```

---

## Example Configurations

### Minimal (Bundled Database)

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - cpak_data:/data
    ports:
      - "8000:80"

volumes:
  cpak_data:
```

### External Database

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb://mongo:27017/cpak
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - cpak_images:/data/images
    ports:
      - "8000:80"

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db

volumes:
  cpak_images:
  mongo_data:
```

### Split Volumes (Advanced)

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - cpak_db:/data/db
      - cpak_images:/data/images
    ports:
      - "8000:80"

volumes:
  cpak_db:
  cpak_images:
```

---

## Container Labels (Metadata)

The container image includes these labels for metadata:

- `org.opencontainers.image.title=CPAK`
- `org.opencontainers.image.description=Cross-Platform Achievement Keeper`
- `org.opencontainers.image.version=<semver>`
- `org.opencontainers.image.source=https://github.com/ghsvilela/cpak`
- `org.opencontainers.image.licenses=<license>`

---

## Version Compatibility

| Container Version | Env Var Changes | Breaking Changes |
|-------------------|----------------|------------------|
| 1.0.0+ | Initial unified container spec | N/A (first unified version) |
| Future | To be documented | Deprecated vars may be removed with major version bump |

**Deprecation Policy**: Optional variables marked DEPRECATED will continue to work for at least one major version before removal.
