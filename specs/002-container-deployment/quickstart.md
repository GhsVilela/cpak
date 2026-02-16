# Quickstart Guide: CPAK Unified Container Deployment

**Version**: 1.0.0  
**Date**: February 12, 2026  
**Target Audience**: Users deploying CPAK on self-hosted container platforms

## Overview

This guide covers deploying the unified CPAK container image on various self-hosted platforms. The unified image includes everything needed: web server, frontend, backend API, and optionally MongoDB database.

**Deployment Time**: < 5 minutes from start to finish

---

## Prerequisites

- Container runtime (Docker, Podman, or container-compatible platform)
- 4GB+ RAM recommended
- 10GB+ storage for container image and data
- Open port (default: 8000, configurable)

**Supported Platforms**:
- Docker / Docker Compose
- Portainer
- TrueNAS SCALE
- Kubernetes (advanced)
- Any OCI-compatible container platform

---

## Quick Start (Recommended: Bundled Database)

The simplest deployment uses the bundled MongoDB database and requires only volume configuration.

### Step 1: Create docker-compose.yml

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    # Alternative: docker.io/ghsvilela/cpak:latest
    container_name: cpak
    hostname: cpak
    ports:
      - "8000:80"  # Change 8000 to any available port
    environment:
      # Optional: Custom encryption key for securing API keys in database
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
    volumes:
      # All persistent data (database + images) in one volume
      - cpak_data:/data
    restart: unless-stopped

volumes:
  cpak_data:
```

### Step 2: Deploy

```bash
# Start the container
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 3: Access Application

1. Open browser: `http://localhost:8000` (or your configured port)
2. Initial setup wizard will guide you through first-time configuration
3. Configure platform API keys in Settings → Platform APIs

**That's it!** You now have a fully functional CPAK instance.

---

## Advanced Deployment Scenarios

### Scenario 1: External MongoDB Database

Use this if you already have a MongoDB server or want to separate database management.

**docker-compose.yml**:
```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    container_name: cpak
    environment:
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb://mongo:27017/cpak
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      # Only images volume needed (database is external)
      - cpak_images:/app/data/images
    ports:
      - "8000:80"
    restart: unless-stopped
  
  mongo:
    image: mongo:6
    container_name: cpak-mongo
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped
    # Optional: Add authentication
    # environment:
    #   - MONGO_INITDB_ROOT_USERNAME=admin
    #   - MONGO_INITDB_ROOT_PASSWORD=secret

volumes:
  cpak_images:
  mongo_data:
```

**With External Managed MongoDB**:
```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/cpak?retryWrites=true&w=majority
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      - cpak_images:/app/data/images
    ports:
      - "8000:80"

volumes:
  cpak_images:
```

---

### Scenario 2: Split Volumes (Advanced)

Separate database and images for different storage backends or backup strategies.

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    volumes:
      # Database on fast SSD
      - cpak_db:/app/data/db
      # Images on slower bulk storage
      - cpak_images:/app/data/images
    ports:
      - "8000:80"
    restart: unless-stopped

volumes:
  cpak_db:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/ssd/cpak/db
  
  cpak_images:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/storage/cpak/images
```

---

### Scenario 3: Portainer Deployment

1. **Navigate**: Stacks → Add Stack
2. **Name**: `cpak`
3. **Web editor**: Paste the Quick Start docker-compose.yml
4. **Environment variables** (optional):
   - Name: `ENCRYPTION_KEY`
   - Value: (generate with: `openssl rand -hex 32`)
5. **Deploy**: Click "Deploy the stack"
6. **Access**: Containers → cpak → Published Ports → click port link

---

### Scenario 4: TrueNAS SCALE Deployment

1. **Apps → Discover Apps → Custom App**
2. **Application Name**: `cpak`
3. **Image Repository**: `ghcr.io/ghsvilela/cpak`
4. **Image Tag**: `latest`
5. **Container Environment Variables**:
   - Variable Name: `ENCRYPTION_KEY`
   - Value: (generate random string)
6. **Networking**:
   - **Port Forwarding**:
     - Container Port: `80`
     - Node Port: `8000` (or your preference)
7. **Storage**:
   - **Host Path Volumes**:
     - Host Path: `/mnt/pool/cpak/data`
     - Mount Path: `/data`
   - Click "Add" for volume
8. **Deploy**
9. **Access**: `http://truenas-ip:8000`

---

## Configuration

### Essential Configuration (Deployment Time)

**ENCRYPTION_KEY** (recommended):
```bash
# Generate a secure key
openssl rand -hex 32

# Add to docker-compose.yml or .env file
ENCRYPTION_KEY=<generated-key>
```

**Why needed**: Encrypts sensitive data (API keys, credentials) in database. Without it, default key is used (weak security).

### Platform API Keys (After Deployment)

Configure through the web UI:

1. **Access**: `http://your-server:8000/settings`
2. **Navigate**: Settings → Platform APIs
3. **Configure**:
   - Steam: [Get Steam API Key](https://steamcommunity.com/dev/apikey)
   - Xbox: [Register Xbox App](https://developer.microsoft.com/xbox)
   - PlayStation: [Create PlayStation App](https://ca.account.sony.com/)
   - SteamGridDB: [Get API Key](https://www.steamgriddb.com/profile/preferences/api)
4. **Save**: API keys are encrypted and stored in database

**No container restart required** after configuring API keys!

---

## Backup & Restore

### Backup

**Bundled Database Mode** (single volume):
```bash
# Stop container
docker compose stop

# Backup entire data volume
docker run --rm -v cpak_data:/data -v $(pwd):/backup ubuntu tar czf /backup/cpak-backup-$(date +%Y%m%d).tar.gz /data

# Restart container
docker compose start
```

**External Database Mode** (images only):
```bash
# Backup images volume
docker run --rm -v cpak_images:/app/data/images -v $(pwd):/backup ubuntu tar czf /backup/cpak-images-$(date +%Y%m%d).tar.gz /app/data/images

# Backup MongoDB separately using mongodump
docker exec cpak-mongo mongodump --out /tmp/backup
docker cp cpak-mongo:/tmp/backup ./mongo-backup-$(date +%Y%m%d)
```

### Restore

```bash
# Stop container
docker compose stop

# Remove old volume (WARNING: destructive)
docker volume rm cpak_data

# Create new volume
docker volume create cpak_data

# Restore backup
docker run --rm -v cpak_data:/data -v $(pwd):/backup ubuntu tar xzf /backup/cpak-backup-YYYYMMDD.tar.gz -C /

# Start container
docker compose start
```

---

## Upgrading

### To New Version

```bash
# Pull latest image
docker compose pull

# Recreate container with new image
docker compose up -d

# Verify upgrade
docker compose logs -f
```

**Data persistence**: Your data volumes are preserved. Database migrations run automatically on startup.

**Version pinning** (recommended for production):
```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:1.2.3  # Pin to specific version
```

---

## Troubleshooting

### Container won't start

**Check logs**:
```bash
docker compose logs cpak
```

**Common issues**:
- **Port conflict**: Change port mapping `"8001:80"` to an available port
- **Volume permissions**: Ensure volume mount is writable
- **Database connection failed**: Verify MONGO_URI in external DB mode

### Database connection errors

**Bundled mode**:
```bash
# Check MongoDB is running inside container
docker exec cpak ps aux | grep mongod

# Check database directory permissions
docker exec cpak ls -la /app/data/db
```

**External mode**:
```bash
# Test connection from container
docker exec cpak mongosh $MONGO_URI --eval "db.adminCommand('ping')"
```

### Can't access web interface

1. **Check container status**: `docker compose ps` (should show "healthy")
2. **Verify port**: `docker compose port cpak 80`
3. **Check firewall**: Ensure port is open on host
4. **Test health endpoint**: `curl http://localhost:8000/api/health`

### Reset to defaults

**Nuclear option** (deletes all data):
```bash
docker compose down -v  # Removes containers AND volumes
docker compose up -d    # Fresh start
```

---

## Security Best Practices

1. **Use custom ENCRYPTION_KEY**: Never use default
2. **Use strong MongoDB passwords**: When using external database with auth
3. **Restrict network access**: Use firewall or reverse proxy
4. **Regular backups**: Automate backup process
5. **Keep updated**: Monitor for security updates
6. **Use HTTPS**: Deploy behind reverse proxy with TLS

### Example: HTTPS with Reverse Proxy

**Caddy (automatic HTTPS)**:
```caddyfile
cpak.yourdomain.com {
    reverse_proxy localhost:8000
}
```

**Nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name cpak.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Resource Requirements

### Minimum

- **CPU**: 1 core
- **RAM**: 2GB
- **Storage**: 5GB (container + minimal data)
- **Network**: Internet for game API sync

### Recommended

- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB+ (depends on image cache size)
- **Network**: Stable broadband

### Performance Tuning

**For large libraries** (10,000+ games):
- Increase container memory limit
- Use SSD for database volume
- Adjust sync batch size in UI settings

---

## Getting Help

- **Documentation**: [Project README](https://github.com/ghsvilela/cpak)
- **Issues**: [GitHub Issues](https://github.com/ghsvilela/cpak/issues)
- **Logs**: Always include `docker compose logs` output when reporting issues

---

## Next Steps

After successful deployment:

1. **Add profiles**: Settings → Profiles → Add Platform Profile
2. **Configure sync**: Settings → Scheduler → Enable automatic sync
3. **Sync achievements**: Dashboard → Select Platform → Sync Now
4. **Browse library**: Explore your 100% completed games!

Enjoy your cross-platform achievement tracking! 🏆
