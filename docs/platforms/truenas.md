# CPAK Deployment on TrueNAS SCALE

Complete guide for deploying CPAK on TrueNAS SCALE using the built-in Apps system.

## Overview

TrueNAS SCALE has a built-in app system powered by Kubernetes (k3s). This guide shows how to deploy CPAK as a custom app.

**Deployment Time**: ~5 minutes  
**Difficulty**: Beginner  
**TrueNAS Version**: SCALE 22.12+ (Bluefin or newer)

---

## Prerequisites

- TrueNAS SCALE installed and configured
- Available storage pool
- Internet connectivity for image download
- Port 8000 available (or choose different port)

---

## Deployment Steps

### Step 1: Access Apps Section

1. Log in to TrueNAS SCALE web interface
2. Navigate to **Apps** in the left sidebar
3. Click **Discover Apps** button
4. Click **Custom App** button

### Step 2: Application Configuration

#### Application Name
- **Application Name**: `cpak`
- **Version**: `1.0.0` (or latest)

#### Image Configuration

**Image Repository**: 
```
ghcr.io/ghsvilela/cpak
```

**Alternative (Docker Hub)**:
```
docker.io/ghsvilela/cpak
```

**Image Tag**: 
```
latest
```

**Image Pull Policy**: 
- Select: `IfNotPresent` (recommended)
- Or: `Always` (always pull latest)

#### Container Configuration

**Container Environment Variables**:

Click **Add** to add environment variable:

| Variable Name | Value | Description |
|---------------|-------|-------------|
| `ENCRYPTION_KEY` | (generate below) | Encryption key for API keys |

**Generate Encryption Key**:

Open a shell on TrueNAS (System → Shell) and run:
```bash
openssl rand -base64 32
```

Copy the output and use it as the `ENCRYPTION_KEY` value.

> ⚠️  **Important**: Save this key! You'll need it to access encrypted settings after container restarts or backups.

**Optional: Leave blank for testing** (random key will be generated, but settings won't persist across restarts)

#### Networking Configuration

**Port Forwarding**:

Click **Add** to add a port mapping:

| Container Port | Node Port | Protocol |
|----------------|-----------|----------|
| `80` | `8000` | TCP |

> 💡 Change Node Port to any available port on your TrueNAS system (e.g., 8001, 9000, etc.)

**DNS Policy**: `ClusterFirst` (default)

**Host Network**: ❌ Disabled (default)

#### Storage Configuration

**Host Path Volumes**:

Click **Add** for Host Path Volume:

**Volume 1: Application Data**

| Setting | Value |
|---------|-------|
| Host Path | `/mnt/pool/cpak/data` |
| Mount Path | `/data` |
| Type | Create if not exists |
| ACL Enable | ❌ Disabled |

> 📝 Replace `/mnt/pool/` with your actual pool name (e.g., `/mnt/main/cpak/data`)

This volume stores:
- MongoDB database files
- Downloaded game images
- Application configuration

**Optional: Split Storage**

If you want to separate database and images on different storage:

**Volume 2: Database**
- Host Path: `/mnt/fast-pool/cpak/db`
- Mount Path: `/data/db`

**Volume 3: Images**
- Host Path: `/mnt/slow-pool/cpak/images`
- Mount Path: `/data/images`

#### Resource Configuration (Optional)

**Resource Limits** (recommended for production):

| Resource | Limit | Reservation |
|----------|-------|-------------|
| CPU | 2 cores | 0.5 cores |
| Memory | 2 Gi | 512 Mi |

**For minimal systems**: Set Memory limit to 1 Gi

### Step 3: Deploy Application

1. Review all settings
2. Click **Install** button at bottom
3. Wait for deployment (2-5 minutes)

**Deployment Progress**:
- TrueNAS will download the image (~1.2 GB)
- Create storage directories
- Start the container
- Run health checks

### Step 4: Verify Deployment

1. Go to **Apps → Installed Applications**
2. Find `cpak` in the list
3. Check status: Should show **ACTIVE** (green)
4. Click on the app name to see details

**Check Logs** (if issues):
- Click **Shell** button
- Run: `supervisorctl status`
- Expected output:
  ```
  backend    RUNNING   pid 15, uptime 0:05:23
  caddy      RUNNING   pid 17, uptime 0:05:23
  frontend   RUNNING   pid 16, uptime 0:05:23
  mongodb    RUNNING   pid 14, uptime 0:05:23
  ```

### Step 5: Access Application

1. In the app details, find **Web Portal** button
2. Or navigate to: `http://truenas-ip:8000`

   Replace `truenas-ip` with your TrueNAS IP address
   Replace `8000` with your chosen Node Port

---

## Post-Deployment Configuration

### 1. Configure Platform API Keys

1. Open CPAK in browser
2. Navigate to **Settings** page
3. Go to **Platform APIs** section
4. Add your API keys:
   - **Steam API Key**: https://steamcommunity.com/dev/apikey
   - **SteamGridDB API Key**: https://www.steamgriddb.com/profile/preferences/api

### 2. Create Profile

1. Navigate to home page
2. Click **Add Profile**
3. Enter:
   - Platform: Steam
   - Steam ID: Your 17-digit Steam ID64
   - Display Name: Your preferred name

### 3. First Sync

1. Select your profile
2. Click **Sync Now**
3. Wait for synchronization to complete
4. View your achievements!

---

## Troubleshooting

### App Shows "Stopped" or "Failed"

**Check Logs**:
1. Apps → Installed → cpak → Logs
2. Look for error messages

**Common Issues**:

1. **Port Already in Use**:
   - Change Node Port to different number
   - Edit app → Networking → Change port

2. **Storage Path Invalid**:
   - Verify pool name is correct
   - Check path exists and has permissions
   - Edit app → Storage → Fix host path

3. **Image Pull Failed**:
   - Check internet connectivity
   - Verify image name is correct
   - Try Docker Hub image instead of GHCR

### Container Starts But Can't Access

**Check Firewall**:
- TrueNAS → Network → Firewall (if enabled)
- Ensure port 8000 (or your port) is allowed

**Check Network**:
```bash
# From TrueNAS shell
curl http://localhost:8000/api/health
```

Expected output: `{"status":"ok"}`

### Services Not Running

**Access Shell**:
1. Apps → Installed → cpak → Shell
2. Run: `supervisorctl status`
3. If service is stopped: `supervisorctl restart <service>`

**Example**:
```bash
supervisorctl restart backend
supervisorctl restart all
```

### MongoDB Won't Start

**Check Storage Permissions**:
```bash
# From TrueNAS shell
ls -la /mnt/pool/cpak/data/db
chown -R 999:999 /mnt/pool/cpak/data/db
```

**Reset Database** (⚠️ LOSES ALL DATA):
```bash
rm -rf /mnt/pool/cpak/data/db/*
# Restart app in TrueNAS UI
```

---

## Upgrading CPAK

### Update to New Version

1. **Backup Data** (recommended):
   ```bash
   # From TrueNAS shell
   cd /mnt/pool/cpak
   tar czf cpak-backup-$(date +%Y%m%d).tar.gz data/
   ```

2. **Update App**:
   - Apps → Installed → cpak → Edit
   - Change Image Tag to new version or keep `latest`
   - Click **Update**

3. **Verify After Update**:
   - Check app status is ACTIVE
   - Access web interface
   - Verify data is intact

### Rollback if Needed

1. Apps → Installed → cpak → Roll Back
2. Select previous version
3. Confirm rollback

---

## Backup and Restore

### Manual Backup

**Method 1: Via TrueNAS Shell**

```bash
# Full backup (database + images)
cd /mnt/pool/cpak
tar czf /mnt/pool/backups/cpak-full-$(date +%Y%m%d).tar.gz data/

# Database only
tar czf /mnt/pool/backups/cpak-db-$(date +%Y%m%d).tar.gz data/db/

# Images only (may be large)
tar czf /mnt/pool/backups/cpak-images-$(date +%Y%m%d).tar.gz data/images/
```

**Method 2: Via CPAK UI**

1. Settings → Backup & Restore
2. Click **Create Backup**
3. Download backup file
4. Store safely off-system

### Restore from Backup

**Method 1: TrueNAS Shell**

```bash
# Stop app first (in TrueNAS UI: Apps → cpak → Stop)

# Restore backup
cd /mnt/pool/cpak
rm -rf data/*
tar xzf /mnt/pool/backups/cpak-full-YYYYMMDD.tar.gz

# Start app (in TrueNAS UI: Apps → cpak → Start)
```

**Method 2: CPAK UI**

1. Settings → Backup & Restore
2. Click **Upload & Restore**
3. Select backup file
4. Confirm restore

---

## Advanced Configuration

### Custom Domain with TrueNAS Reverse Proxy

If you have a domain pointed to TrueNAS:

1. **Set up reverse proxy** (via TrueNAS or external like Nginx Proxy Manager)
2. **Point to**: `http://truenas-ip:8000`
3. **Configure SSL/TLS** as needed

### External MongoDB

To use external MongoDB instead of bundled:

1. Deploy CPAK with external DB configuration
2. Edit app → Environment Variables
3. Add:
   - `EXTERNAL_DB=true`
   - `MONGO_URI=mongodb://your-mongo-server:27017/cpak`
4. Update app

### Resource Scaling

For large game libraries or multiple users:

1. Edit app → Resource Configuration
2. Increase:
   - Memory: 4 Gi
   - CPU: 4 cores
3. Update app

---

## Performance Optimization

### Storage Performance

**Best Practices**:
- Database on SSD pool for faster queries
- Images on HDD pool (less performance critical)
- Use ZFS compression (lz4 recommended)

**Example Dataset**:
```bash
# Create optimized datasets
zfs create -o compression=lz4 pool/cpak
zfs create -o compression=lz4 -o primarycache=all pool/cpak/db
zfs create -o compression=lz4 -o primarycache=metadata pool/cpak/images
```

### Network Performance

- Use wired connection for TrueNAS
- Place TrueNAS and clients on same network/VLAN
- Consider jumbo frames if supported (MTU 9000)

---

## Migration from Docker Compose

If you're migrating from a Docker Compose deployment:

1. **Backup current data**:
   ```bash
   docker run --rm -v cpak_data:/data -v $(pwd):/backup alpine \
     tar czf /backup/cpak-migration.tar.gz /data
   ```

2. **Copy to TrueNAS**:
   ```bash
   scp cpak-migration.tar.gz root@truenas-ip:/mnt/pool/cpak/
   ```

3. **Extract on TrueNAS**:
   ```bash
   cd /mnt/pool/cpak
   tar xzf cpak-migration.tar.gz --strip-components=1
   ```

4. **Deploy CPAK app** (follow steps above)

5. **Verify data** appears in UI

---

## Security Considerations

### Encryption Key Management

**Best Practices**:
- Generate strong random key (32+ bytes)
- Store key in TrueNAS Credentials (System → Credentials)
- Never commit key to version control
- Rotate key periodically (requires re-encrypting settings)

### Network Security

**Recommendations**:
- Use TrueNAS firewall to restrict access
- Consider VPN for remote access
- Use reverse proxy with SSL for external access
- Don't expose MongoDB port (27017) externally

### Updates

- Enable automatic updates for security patches
- Review changelog before major updates
- Always backup before updating

---

## Uninstalling CPAK

1. **Backup if needed** (see Backup section)
2. **Stop app**: Apps → cpak → Stop
3. **Delete app**: Apps → cpak → Delete
4. **Choose data handling**:
   - ❌ Delete storage: Removes all data permanently
   - ✅ Keep storage: Preserves data for reinstall

**Clean up manually** (if needed):
```bash
# Remove data (⚠️ permanent)
rm -rf /mnt/pool/cpak/
```

---

## Additional Resources

- **CPAK Documentation**: [README.md](../../README.md)
- **Troubleshooting Guide**: [troubleshooting.md](../troubleshooting.md)
- **TrueNAS SCALE Apps**: https://www.truenas.com/docs/scale/scaleuireference/apps/
- **Support**: [GitHub Issues](https://github.com/ghsvilela/cpak/issues)

---

## Notes

- TrueNAS SCALE uses Kubernetes under the hood
- Apps are deployed as Helm charts
- Storage paths are mounted from the host
- App lifecycle managed by TrueNAS middleware
