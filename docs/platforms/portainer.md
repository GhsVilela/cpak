# CPAK Deployment on Portainer

Complete guide for deploying CPAK using Portainer's Stack feature.

## Overview

Portainer is a popular Docker management UI that simplifies container deployment. This guide shows how to deploy CPAK as a Portainer Stack using Docker Compose syntax.

**Deployment Time**: ~3 minutes  
**Difficulty**: Beginner  
**Portainer Version**: CE 2.0+ or Business

---

## Prerequisites

- Portainer installed and accessible
- Docker or Docker Swarm environment configured in Portainer
- Internet connectivity for image download
- Port 8000 available (or choose different port)

---

## Deployment Steps

### Step 1: Access Portainer Stacks

1. Log in to Portainer web interface
2. Select your **Environment** (Docker host)
3. Navigate to **Stacks** in the left sidebar
4. Click **+ Add stack** button

### Step 2: Create Stack

#### Stack Configuration

**Name**: `cpak`

**Build method**: Select **Web editor**

**Web editor content**: Copy and paste the following:

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    # Alternative: docker.io/ghsvilela/cpak:latest
    container_name: cpak
    hostname: cpak
    ports:
      - "8000:80"
    environment:
      # Optional: Custom encryption key for securing API keys
      # Generate with: openssl rand -base64 32
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
    volumes:
      # All persistent data in one volume
      - cpak_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

volumes:
  cpak_data:
    driver: local
```

### Step 3: Configure Environment Variables (Optional)

Scroll down to **Environment variables** section.

**Add Environment Variable**:

Click **+ add environment variable**:

| Name | Value |
|------|-------|
| `ENCRYPTION_KEY` | (your generated key) |

**Generate the key**:

Open a terminal and run:
```bash
openssl rand -base64 32
```

Or use Portainer's Console feature:
1. Portainer → Containers → any running container → Console
2. Connect
3. Run: `openssl rand -base64 32`

Copy the output and use it as the `ENCRYPTION_KEY` value.

> 💡 **Optional**: You can leave this blank for testing. A random key will be generated automatically, but settings won't persist across container restarts.

### Step 4: Deploy Stack

1. Scroll to bottom of page
2. Click **Deploy the stack** button
3. Wait for deployment (1-3 minutes)

**Deployment Progress**:

Portainer will show:
- ⏳ Pulling image
- ⏳ Creating volume
- ⏳ Starting container
- ✅ Running

### Step 5: Verify Deployment

1. Navigate to **Stacks → cpak**
2. Check **Stack Status**: Should show ✅ Running (1/1)
3. Click on the stack name to see details

**View Logs**:
- Stacks → cpak → Containers
- Click **cpak** container
- Click **Logs** button
- Look for: "All services running successfully"

**Check Services**:
- Click **Console** button
- Connect with: `/bin/bash`
- Run: `supervisorctl status`
- Expected output:
  ```
  backend    RUNNING   pid 15, uptime 0:05:23
  caddy      RUNNING   pid 17, uptime 0:05:23
  frontend   RUNNING   pid 16, uptime 0:05:23
  mongodb    RUNNING   pid 14, uptime 0:05:23
  ```

### Step 6: Access Application

**Option 1: Via Portainer Published Ports**

1. Stacks → cpak → Containers
2. Find **cpak** container
3. Look at **Published Ports** column
4. Click the link (usually `0.0.0.0:8000`)

**Option 2: Direct Browser Access**

```
http://portainer-host-ip:8000
```

Replace `portainer-host-ip` with your Docker host IP address.

---

##  Alternative Deployment Scenarios

### Scenario 1: External MongoDB Database

Use this if you have a separate MongoDB server or container.

**Stack YAML**:

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    container_name: cpak
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb://mongo:27017/cpak
    ports:
      - "8000:80"
    volumes:
      - cpak_images:/data/images
    restart: unless-stopped
    depends_on:
      mongo:
        condition: service_healthy

  mongo:
    image: mongo:8
    container_name: cpak-mongo
    hostname: mongo
    ports:
      - "27017:27017"
    volumes:
      - cpak_db:/data/db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  cpak_images:
  cpak_db:
```

**When to use**:
- You need to manage MongoDB separately
- You have existing MongoDB infrastructure
- You want to scale MongoDB independently

### Scenario 2: Split Volumes

Separate database and images on different storage locations.

**Stack YAML**:

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    container_name: cpak
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
    ports:
      - "8000:80"
    volumes:
      # Database on fast storage (SSD)
      - /mnt/ssd/cpak/db:/data/db
      # Images on bulk storage (HDD)
      - /mnt/storage/cpak/images:/data/images
    restart: unless-stopped

# No named volumes needed - using host paths
```

**When to use**:
- Database on fast SSD for performance
- Images on slower bulk storage for cost savings
- You have specific host paths for storage

### Scenario 3: Docker Swarm Mode

For high availability and load balancing across multiple nodes.

**Stack YAML**:

```yaml
version: '3.8'

services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
      - EXTERNAL_DB=true
      - MONGO_URI=mongodb://mongo:27017/cpak
    ports:
      - target: 80
        published: 8000
        protocol: tcp
        mode: ingress
    volumes:
      - cpak_images:/data/images
    networks:
      - cpak_network
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
    depends_on:
      - mongo

  mongo:
    image: mongo:8
    volumes:
      - cpak_db:/data/db
    networks:
      - cpak_network
    deploy:
      replicas: 1
      placement:
        constraints:
          - node.role == manager

volumes:
  cpak_images:
  cpak_db:

networks:
  cpak_network:
    driver: overlay
```

**When to use**:
- High availability requirements
- Load balancing across multiple nodes
- Production environments with Swarm

---

## Post-Deployment Configuration

### 1. Configure API Keys

1. Open CPAK: `http://your-host:8000`
2. Navigate to **Settings** page
3. Go to **Platform APIs** section
4. Add your keys:
   - **Steam API Key**: https://steamcommunity.com/dev/apikey
   - **SteamGridDB API Key**: https://www.steamgriddb.com/profile/preferences/api

### 2. Create Profile

1. Navigate to home page
2. Click **Add Profile**
3. Select platform: **Steam**
4. Enter your Steam ID64
5. Enter display name
6. Save

### 3. Sync Games

1. Select your profile
2. Click **Sync Now**
3. Wait for sync to complete
4. Enjoy your achievement tracker!

---

## Troubleshooting

### Stack Won't Deploy

**Check Stack Logs**:
- Stacks → cpak → Editor
- Look for validation errors in red

**Common Issues**:

1. **Invalid YAML Syntax**:
   - Ensure proper indentation (use spaces, not tabs)
   - Check for missing colons or quotes
   - Use a YAML validator

2. **Port Already in Use**:
   ```yaml
   ports:
     - "8001:80"  # Changed from 8000
   ```

3. **Volume Mount Permission**:
   - Ensure host paths exist and have correct permissions
   - Try using named volumes instead of host paths

### Container Keeps Restarting

**View Container Logs**:
1. Containers → cpak → Logs
2. Look for error messages

**Check Health Status**:
1. Containers → cpak → Inspect
2. Look at **Health** section
3. View health check logs

**Common Causes**:
- MongoDB initialization failure
- Insufficient memory
- Network issues

**Solutions**:
```bash
# Increase memory limit (in stack YAML)
deploy:
  resources:
    limits:
      memory: 2G

# Or restart container
# Containers → cpak → Restart
```

### Can't Access Web Interface

**Check Published Ports**:
1. Containers → cpak → Inspect
2. Look at **Ports** section
3. Ensure port 8000 is listed

**Check Firewall**:
- Ensure Docker host firewall allows port 8000
- Check cloud provider security groups

**Test from Portainer**:
1. Containers → cpak → Console
2. Connect with `/bin/bash`
3. Run: `curl http://localhost/api/health`
4. Should return: `{"status":"ok"}`

### Services Not Running

**Access Container Console**:
1. Containers → cpak → Console
2. Connect with `/bin/bash`
3. Check service status:
   ```bash
   supervisorctl status
   ```

**Restart Services**:
```bash
supervisorctl restart backend
supervisorctl restart frontend
supervisorctl restart all
```

**View Service Logs**:
```bash
supervisorctl tail -f backend
supervisorctl tail -f frontend
supervisorctl tail -f mongodb
```

---

## Managing the Stack

### Update to New Version

**Method 1: Via Portainer UI**

1. Stacks → cpak → Editor
2. No changes needed if using `latest` tag
3. Click **Update the stack**
4. Check **Re-pull image and redeploy**
5. Confirm update

**Method 2: Change Image Tag**

1. Stacks → cpak → Editor
2. Change:
   ```yaml
   image: ghcr.io/ghsvilela/cpak:latest
   ```
   To:
   ```yaml
   image: ghcr.io/ghsvilela/cpak:v1.1.0
   ```
3. Click **Update the stack**

### Rollback to Previous Version

Unfortunately, Portainer doesn't have built-in rollback. To rollback:

1. **Use specific version tag** instead of `latest`
2. **Keep backups** before updating
3. **Restore from backup** if needed

### Stop Stack

1. Stacks → cpak
2. Click **Stop this stack** button
3. Containers will stop but data persists

### Restart Stack

1. Stacks → cpak
2. Click **Start this stack** button

### Delete Stack

⚠️  **Warning**: This will delete containers but **NOT** volumes by default.

1. Stacks → cpak
2. Click **Delete this stack**
3. Confirm deletion
4. **Optional**: Manually delete volumes
   - Volumes → cpak_data → Remove

---

## Backup and Restore

### Backup via Portainer

**Method 1: Volume Export**

1. Volumes → cpak_data → Browse
2. Download files manually (tedious for large datasets)

**Method 2: Container Exec** (Recommended)

1. Containers → cpak → Console
2. Connect with `/bin/bash`
3. Run backup command:
   ```bash
   tar czf /tmp/cpak-backup.tar.gz /data
   ```
4. Copy file out:
   ```bash
   # From your machine
   docker cp cpak:/tmp/cpak-backup.tar.gz ./
   ```

**Method 3: Via Web UI**

1. Open CPAK: http://your-host:8000
2. Settings → Backup & Restore
3. Click **Create Backup**
4. Download file
5. Store safely off-site

### Restore from Backup

**Method 1: Via Container**

1. Stop stack: Stacks → cpak → Stop
2. Upload backup to host
3. Containers → cpak → Console (start container first if needed)
4. Restore:
   ```bash
   cd /
   tar xzf /tmp/cpak-backup.tar.gz
   ```
5. Restart stack

**Method 2: Via Web UI**

1. Open CPAK: http://your-host:8000
2. Settings → Backup & Restore
3. Click **Upload & Restore**
4. Select backup file
5. Confirm restore

---

## Advanced Configuration

### Custom Port

Change the host port to avoid conflicts:

```yaml
ports:
  - "9000:80"  # Access via http://host:9000
```

### Resource Limits

Add resource constraints:

```yaml
services:
  cpak:
    # ... other config
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Custom Network

Create isolated network:

```yaml
services:
  cpak:
    # ... other config
    networks:
      - cpak_network

networks:
  cpak_network:
    driver: bridge
```

### Logging Configuration

Configure Docker logging driver:

```yaml
services:
  cpak:
    # ... other config
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Security Best Practices

### Secret Management

**Use Portainer Secrets** (Swarm mode only):

1. Secrets → + Add secret
2. Name: `cpak_encryption_key`
3. Paste your encryption key
4. Save

**Update Stack YAML**:
```yaml
services:
  cpak:
    secrets:
      - cpak_encryption_key
    environment:
      - ENCRYPTION_KEY_FILE=/run/secrets/cpak_encryption_key

secrets:
  cpak_encryption_key:
    external: true
```

### Network Isolation

Create separate network for database:

```yaml
services:
  cpak:
    networks:
      - frontend
      - backend
  
  mongo:
    networks:
      - backend

networks:
  frontend:
  backend:
    internal: true  # No external access
```

### Reverse Proxy Integration

Use with Traefik, Nginx Proxy Manager, etc.:

```yaml
services:
  cpak:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.cpak.rule=Host(`cpak.yourdomain.com`)"
      - "traefik.http.routers.cpak.entrypoints=websecure"
      - "traefik.http.routers.cpak.tls.certresolver=letsencrypt"
      - "traefik.http.services.cpak.loadbalancer.server.port=80"
    networks:
      - traefik_network

networks:
  traefik_network:
    external: true
```

---

## Performance Tuning

### MongoDB Performance

Use external MongoDB with tuning:

```yaml
services:
  mongo:
    command:
      - --wiredTigerCacheSizeGB=0.5
      - --wiredTigerJournalCompressor=snappy
    deploy:
      resources:
        reservations:
          memory: 1G
```

### Image Sync Concurrency

Configure via Settings UI after deployment:
- Settings → Sync Settings → Icon Concurrency
- Increase from 5 to 10-20 for faster syncs

---

## Migration from Docker Compose

If you're already running CPAK with Docker Compose:

1. **Backup current data**:
   ```bash
   docker run --rm -v cpak_data:/data -v $(pwd):/backup alpine \
     tar czf /backup/cpak-migration.tar.gz /data
   ```

2. **Stop Docker Compose deployment**:
   ```bash
   docker compose down
   ```

3. **Copy volume to Portainer host** (if different machine):
   ```bash
   scp cpak-migration.tar.gz user@portainer-host:/tmp/
   ```

4. **Deploy stack in Portainer** (follow steps above)

5. **Restore data**:
   ```bash
   # On Portainer host
   docker run --rm -v cpak_data:/data -v /tmp:/backup alpine \
     tar xzf /backup/cpak-migration.tar.gz -C / --strip-components=1
   ```

6. **Restart stack** in Portainer

---

## Additional Resources

- **CPAK Documentation**: [README.md](../../README.md)
- **Troubleshooting Guide**: [troubleshooting.md](../troubleshooting.md)
- **Portainer Documentation**: https://docs.portainer.io/
- **Docker Compose Reference**: https://docs.docker.com/compose/compose-file/
- **Support**: [GitHub Issues](https://github.com/ghsvilela/cpak/issues)

---

## Quick Reference

### Stack Template (Copy-Paste Ready)

```yaml
services:
  cpak:
    image: ghcr.io/ghsvilela/cpak:latest
    container_name: cpak
    hostname: cpak
    ports:
      - "8000:80"
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY:-}
    volumes:
      - cpak_data:/data
    restart: unless-stopped

volumes:
  cpak_data:
    driver: local
```

### Useful Commands

```bash
# Check services
docker exec cpak supervisorctl status

# View logs
docker exec cpak supervisorctl tail -f backend

# Restart service
docker exec cpak supervisorctl restart backend

# Access MongoDB
docker exec cpak mongosh --eval "db.adminCommand('ping')"

# Create backup
docker exec cpak tar czf /tmp/backup.tar.gz /data
docker cp cpak:/tmp/backup.tar.gz ./
```
