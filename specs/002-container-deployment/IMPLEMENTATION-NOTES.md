# Foundational Implementation Notes
# Phase 2: Technical Strategy Definitions

## T007: supervisord Installation & Configuration

**Installation in Alpine**:
```dockerfile
RUN apk add --no-cache supervisor
```

**Configuration Location**: `/config/supervisord/supervisord.conf`

**Key Features**:
- Multi-process management (MongoDB, backend, Caddy)
- Automatic restart on failure
- Priority-based startup (MongoDB first, then backend, then Caddy)
- Proper signal handling for graceful shutdown
- All logs to stdout/stderr for container log aggregation

**Service Definitions**:
1. **mongodb** (priority=1): Starts first, binds to all interfaces
2. **backend** (priority=2): Starts after MongoDB, connects to localhost:27017
3. **caddy** (priority=3): Starts last, proxies to backend and frontend

**Health Monitoring**: Each service configured with `startsecs` and `startretries` for resilience

---

## T008: Volume Mount Detection Logic

**Strategy**: Auto-detect unified vs split volume mode at container startup

**Detection Logic**:
```bash
#!/bin/sh
# In docker-entrypoint.sh

# Check if both specific volumes are mounted
if mountpoint -q /data/db && mountpoint -q /data/images; then
    echo "Split volume mode detected"
    DB_PATH=/data/db
    IMAGES_PATH=/data/images
else
    echo "Unified volume mode (default)"
    DB_PATH=/data/db
    IMAGES_PATH=/data/images
    mkdir -p /data/db /data/images
fi
```

**Supported Configurations**:

1. **Unified Volume (Recommended)**:
   - Single mount: `-v cpak_data:/data`
   - Creates subdirectories: `/data/db`, `/data/images`
   - Benefits: Simplest setup, atomic backups, single volume management

2. **Split Volumes (Advanced)**:
   - Separate mounts: `-v cpak_db:/data/db -v cpak_images:/data/images`
   - Benefits: Different storage backends, granular backup strategies

**Validation**:
- Check write permissions on all directories
- Log detected mode for troubleshooting
- Fail fast if volumes not writable

---

## T009: Database Mode Detection Strategy

**Strategy**: Disable bundled MongoDB service when external database is configured

**Detection Logic**:
```bash
#!/bin/sh
# In docker-entrypoint.sh

if [ -n "$EXTERNAL_DB" ] || [ -n "$MONGO_URI" ]; then
    echo "External database mode enabled"
    # Disable MongoDB service in supervisord config
    sed -i '/^\[program:mongodb\]/,/^$/d' /etc/supervisord.conf
    
    # Validate MONGO_URI is set
    if [ -z "$MONGO_URI" ]; then
        echo "ERROR: EXTERNAL_DB=true requires MONGO_URI to be set"
        exit 1
    fi
else
    echo "Bundled database mode (default)"
    # Ensure database directory exists
    mkdir -p /data/db
    # Set MONGO_URI for backend to connect to local MongoDB
    export MONGO_URI="mongodb://localhost:27017/cpak"
fi
```

**Environment Variable Priority**:
1. `MONGO_URI` explicitly set → Use it (external mode)
2. `EXTERNAL_DB=true` → Require MONGO_URI
3. Neither set → Use bundled MongoDB at `mongodb://localhost:27017/cpak`

**Bundled Mode Requirements**:
- `/data/db` volume must exist and be writable
- MongoDB starts before backend (priority=1 in supervisord)

**External Mode Requirements**:
- Valid MONGO_URI connection string
- MongoDB must be accessible from container
- No `/data/db` volume needed (only `/data/images`)

---

## T010: Configuration Precedence Framework

**Layered Configuration Strategy**: Database settings > Environment variables > Application defaults

### Precedence Levels (Highest to Lowest):

1. **Database Settings (via UI)** - Highest priority
   - Stored in `settings` collection
   - Encrypted for sensitive values (API keys)
   - Managed through Settings UI
   - Takes effect immediately (no restart needed)

2. **Environment Variables**
   - Set at container deployment
   - Used as fallback when no database setting exists
   - Good for initial configuration

3. **Application Defaults** - Lowest priority
   - Hardcoded in backend
   - Used when no database or environment config exists

### Configuration Categories:

**Essential (Deployment-time only)**:
- `ENCRYPTION_KEY`: Required before database can be accessed
- `MONGO_URI`: Required if using external database
- `EXTERNAL_DB`: Flag to disable bundled MongoDB

**UI-Configurable (Database-backed)**:
- Platform API keys (Steam, Xbox, PlayStation, SteamGridDB)
- Scheduler settings (enabled, cron expression)
- Sync parameters (batch size, concurrency limits)

**Removed/Internal**:
- `API_PORT`: Fixed to 8080 internally
- `API_BASE_PATH`: Fixed to `/api`
- `ALLOWED_ORIGINS`: Auto-detected from request headers
- `IMAGES_DIR`: Fixed to `/data/images`

### Implementation Pattern:

```typescript
// Backend configuration service
class ConfigService {
  async get(key: string): Promise<string | undefined> {
    // 1. Check database first
    const dbSetting = await Settings.findOne({ key });
    if (dbSetting) {
      return this.decrypt(dbSetting.value);
    }
    
    // 2. Check environment variables
    const envValue = process.env[key.toUpperCase()];
    if (envValue) {
      return envValue;
    }
    
    // 3. Return default
    return this.defaults[key];
  }
}
```

---

## T011: Container Image Metadata (OCI Annotations)

**Standard OCI Labels** (to be added to Dockerfile):

```dockerfile
LABEL org.opencontainers.image.title="CPAK" \
      org.opencontainers.image.description="Cross-Platform Achievement Keeper - Unified container with backend, frontend, web server, and database" \
      org.opencontainers.image.vendor="ghsvilela" \
      org.opencontainers.image.url="https://github.com/ghsvilela/cpak" \
      org.opencontainers.image.source="https://github.com/ghsvilela/cpak" \
      org.opencontainers.image.documentation="https://github.com/ghsvilela/cpak/blob/main/README.md" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_SHA}"
```

**Custom Application Labels**:

```dockerfile
LABEL cpak.components="caddy,nextjs,fastify,mongodb" \
      cpak.database.bundled="true" \
      cpak.database.external="supported" \
      cpak.ports.http="80" \
      cpak.ports.api="8080" \
      cpak.ports.frontend="3000" \
      cpak.optional.env="ENCRYPTION_KEY" \
      cpak.optional.env="MONGO_URI,EXTERNAL_DB"
```

**Benefits**:
- Container registry metadata display
- Image inspection reveals deployment requirements
- Automated tooling can read labels for configuration hints
- Documentation embedded in image

**Build-time Variables**:
```dockerfile
ARG VERSION=dev
ARG BUILD_DATE
ARG GIT_SHA

# Labels use these ARGs
LABEL org.opencontainers.image.version="${VERSION}"
```

**GitHub Actions Integration**:
```yaml
- name: Docker meta
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: |
      ghcr.io/ghsvilela/cpak
    labels: |
      org.opencontainers.image.title=CPAK
      org.opencontainers.image.description=Cross-Platform Achievement Keeper
```

---

## Checkpoint Validation

Phase 2 complete when:
- ✅ supervisord installation strategy documented
- ✅ Volume detection logic defined
- ✅ Database mode detection strategy defined
- ✅ Configuration precedence framework documented
- ✅ OCI labels specified

**Next Phase**: Proceed to Phase 3 (User Story 1 implementation) - Docker build infrastructure
