# CPAK Troubleshooting Guide

This guide covers common issues and their solutions for CPAK deployment and operation.

## Table of Contents

- [Container Issues](#container-issues)
- [Database Problems](#database-problems)
- [Sync Failures](#sync-failures)
- [API Key Issues](#api-key-issues)
- [Performance Problems](#performance-problems)
- [Data Management](#data-management)

---

## Container Issues

### Container Won't Start

**Symptoms**: Container exits immediately after starting

**Diagnosis**:
```bash
# Check container logs
docker logs cpak

# Look for error messages in startup sequence
docker logs cpak 2>&1 | grep -i error
```

**Common Causes**:

1. **Missing ENCRYPTION_KEY Warning**
   - Not critical, but insecure for production
   - Solution: Generate and add encryption key:
     ```bash
     openssl rand -base64 32
     # Add to docker-compose.yml environment section
     ```

2. **Volume Permission Issues**
   - Error: "Permission denied: /data/db" or "/data/images"
   - Solution: Ensure volume has correct permissions:
     ```bash
     docker volume rm cpak_data
     docker compose up -d  # Recreate with correct permissions
     ```

3. **Port Already in Use**
   - Error: "address already in use"
   - Solution: Change host port in docker-compose.yml:
     ```yaml
     ports:
       - "8001:80"  # Changed from 8000
     ```

### Services Not Running

**Symptoms**: Container is running but services are down

**Diagnosis**:
```bash
# Check supervisord status
docker exec cpak supervisorctl status

# Expected output:
# backend    RUNNING   pid 15, uptime 0:05:23
# caddy      RUNNING   pid 17, uptime 0:05:23
# frontend   RUNNING   pid 16, uptime 0:05:23
# mongodb    RUNNING   pid 14, uptime 0:05:23  (unified mode only)
```

**Solutions by Service**:

1. **MongoDB Not Running** (Unified Mode)
   ```bash
   # Check MongoDB logs
   docker logs cpak 2>&1 | grep mongodb
   
   # Common issue: Database corruption
   # Solution: Remove volume and start fresh (LOSES DATA)
   docker compose down -v
   docker compose up -d
   ```

2. **Backend Not Running**
   ```bash
   # Check for MongoDB connection errors
   docker logs cpak 2>&1 | grep "MongoServerError"
   
   # Common issue: Cannot connect to MongoDB
   # Solution: Verify MONGO_URI is correct (external mode)
   docker exec cpak env | grep MONGO_URI
   ```

3. **Frontend Not Running**
   ```bash
   # Check frontend logs
   docker exec cpak cat /proc/$(docker exec cpak pgrep -f "node.*frontend")/fd/1
   
   # Common issue: Module not found
   # Solution: Rebuild container with --no-cache
   docker compose build --no-cache
   ```

4. **Caddy Not Running**
   ```bash
   # Check Caddy logs
   docker logs cpak 2>&1 | grep caddy
   
   # Common issue: Port 80 binding failed
   # Solution: Check if another process uses port 80 inside container
   ```

### Container Restarts Repeatedly

**Symptoms**: Container keeps restarting in a loop

**Diagnosis**:
```bash
# Check restart count
docker ps -a | grep cpak

# View crash logs
docker logs cpak --tail 100
```

**Common Causes**:

1. **Database Initialization Failure**
   - Look for: "Failed to start MongoDB"
   - Solution: Check volume permissions and disk space

2. **Backend Crash Loop**
   - Look for: "ECONNREFUSED", "MongooseServerSelectionError"
   - Solution: Verify MongoDB is accessible

3. **Out of Memory**
   - Look for: "Killed", "OOMKilled"
   - Solution: Increase Docker memory limit:
     ```yaml
     services:
       cpak:
         deploy:
           resources:
             limits:
               memory: 2G
     ```

---

## Database Problems

### External MongoDB Connection Failed

**Symptoms**: Backend cannot connect to external MongoDB

**Diagnosis**:
```bash
# Test MongoDB connectivity from container
docker exec cpak mongosh "$MONGO_URI" --eval "db.adminCommand('ping')"
```

**Solutions**:

1. **Wrong Connection String**
   ```bash
   # Verify MONGO_URI format:
   # mongodb://username:password@host:port/database
   
   # For Docker network:
   MONGO_URI=mongodb://mongo:27017/cpak
   
   # For external server:
   MONGO_URI=mongodb://admin:password@192.168.1.10:27017/cpak
   
   # For MongoDB Atlas:
   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/cpak
   ```

2. **Network Connectivity**
   ```bash
   # Test from container
   docker exec cpak ping -c 3 mongo
   docker exec cpak nc -zv mongo 27017
   ```

3. **Authentication Issues**
   ```bash
   # Check MongoDB user has correct permissions
   # In MongoDB shell:
   use admin
   db.createUser({
     user: "cpak",
     pwd: "yourpassword",
     roles: [{role: "readWrite", db: "cpak"}]
   })
   ```

### Database Corruption

**Symptoms**: MongoDB fails to start, data appears missing

**Diagnosis**:
```bash
# Check MongoDB logs for corruption errors
docker logs cpak 2>&1 | grep -i "corrupt\|damaged\|repair"
```

**Solutions**:

1. **Attempt Repair** (Unified Mode)
   ```bash
   docker exec cpak mongod --dbpath /data/db --repair
   ```

2. **Restore from Backup**
   ```bash
   # Stop container
   docker compose down
   
   # Restore backup
   docker run --rm -v cpak_data:/data -v $(pwd)/backup:/backup \
     mongo:8 mongorestore --db cpak /backup
   
   # Start container
   docker compose up -d
   ```

3. **Start Fresh** (LOSES ALL DATA)
   ```bash
   docker compose down -v
   docker compose up -d
   ```

---

## Sync Failures

### Steam Sync Not Working

**Symptoms**: Sync fails with error or returns no data

**Common Issues**:

1. **Invalid API Key**
   - Error: "403 Forbidden", "Invalid API key"
   - Solution: 
     - Verify key in Settings page
     - Get new key from https://steamcommunity.com/dev/apikey
     - Ensure key is for correct domain

2. **Private Profile**
   - Error: "Profile is private"
   - Solution:
     - Visit https://steamcommunity.com/my/edit/settings
     - Set "My profile" to Public
     - Set "Game details" to Public
     - Wait 5 minutes for Steam to update

3. **Invalid Steam ID**
   - Error: "User not found", "Invalid Steam ID"
   - Solution:
     - Verify Steam ID at https://steamid.io/
     - Use steamID64 format (17-digit number)
     - Example: 76561198012345678

4. **Rate Limiting**
   - Error: "429 Too Many Requests"
   - Solution: 
     - Wait 1-2 minutes
     - Reduce sync frequency in Settings
     - Check SYNC_RATE_LIMIT_PER_MIN setting

### Image Downloads Failing

**Symptoms**: Games appear but have no images

**Diagnosis**:
```bash
# Check image storage
docker exec cpak ls -lh /data/images/steam/

# Check download logs
docker logs cpak 2>&1 | grep -i "download\|image"
```

**Solutions**:

1. **SteamGridDB API Key Missing**
   - Add key in Settings → Platform APIs → SteamGridDB
   - Get key from https://www.steamgriddb.com/profile/preferences/api

2. **Network Issues**
   ```bash
   # Test external connectivity
   docker exec cpak curl -I https://cdn.cloudflare.steamstatic.com
   docker exec cpak curl -I https://cdn2.steamgriddb.com
   ```

3. **Disk Space Full**
   ```bash
   # Check available space
   docker exec cpak df -h /data/images
   
   # Clean up old images if needed
   docker exec cpak du -sh /data/images/*
   ```

4. **Permission Issues**
   ```bash
   # Verify write permissions
   docker exec cpak test -w /data/images && echo "Writable" || echo "Not writable"
   
   # Fix permissions
   docker exec cpak chown -R node:node /data/images
   ```

---

## API Key Issues

### Settings Not Persisting

**Symptoms**: API keys need to be re-entered after restart

**Cause**: Using default insecure encryption key (changes on restart)

**Solution**:
```bash
# Generate permanent encryption key
openssl rand -base64 32

# Add to docker-compose.yml
environment:
  - ENCRYPTION_KEY=YourGeneratedKeyHere

# Restart container
docker compose down
docker compose up -d
```

### Cannot Update Settings in UI

**Symptoms**: Settings page shows errors when saving

**Diagnosis**:
```bash
# Check API logs
docker logs cpak 2>&1 | grep "/api/settings"

# Test API directly
docker exec cpak curl -X GET http://localhost:8080/api/settings
```

**Solutions**:

1. **Backend Not Running**
   ```bash
   docker exec cpak supervisorctl status backend
   docker exec cpak supervisorctl restart backend
   ```

2. **Database Connection Lost**
   ```bash
   docker exec cpak supervisorctl restart mongodb  # Unified mode
   # Or check external MongoDB status
   ```

---

## Performance Problems

### Slow Sync Times

**Symptoms**: Sync takes very long to complete

**Optimization Steps**:

1. **Increase Icon Download Concurrency**
   - Settings → Sync Settings → Icon Concurrency
   - Increase from 5 to 10-20 (higher = faster but more resource intensive)

2. **Check Network Speed**
   ```bash
   # Test download speed
   docker exec cpak curl -o /dev/null -s -w '%{speed_download}\n' \
     https://cdn.cloudflare.steamstatic.com/test.jpg
   ```

3. **Disable Image Downloads Temporarily**
   - Remove SteamGridDB API key from Settings
   - Sync will skip image downloads

4. **Reduce Game Count**
   - Sync downloads all owned games
   - No current filtering option

### High Memory Usage

**Symptoms**: Container uses excessive memory (>2GB)

**Solutions**:

1. **Limit Container Memory**
   ```yaml
   services:
     cpak:
       deploy:
         resources:
           limits:
             memory: 1.5G
           reservations:
             memory: 512M
   ```

2. **Reduce Icon Concurrency**
   - Lower concurrent downloads in Settings
   - Default: 5, try reducing to 3

3. **Monitor Process Memory**
   ```bash
   docker exec cpak ps aux --sort=-%mem | head -10
   ```

### Disk Space Issues

**Symptoms**: Container fills up disk space

**Diagnosis**:
```bash
# Check disk usage
docker exec cpak df -h

# Find large directories
docker exec cpak du -sh /data/* | sort -hr

# Check image storage
docker exec cpak du -sh /data/images/*
```

**Solutions**:

1. **Clean Old Backups**
   ```bash
   docker exec cpak find /tmp -name "backup_*.tar.gz" -mtime +7 -delete
   ```

2. **Optimize Images**
   - Images are cached indefinitely
   - Consider cleaning games you no longer own

3. **Use External Storage**
   ```yaml
   volumes:
     - /mnt/large-disk/cpak-images:/data/images
   ```

---

## Data Management

### Backup Fails

**Symptoms**: Backup process fails or doesn't complete

**Diagnosis**:
```bash
# Check backup status
curl http://localhost:8000/api/backup/status

# Check backup logs
docker logs cpak 2>&1 | grep backup
```

**Solutions**:

1. **Insufficient Disk Space**
   ```bash
   # Check available space
   docker exec cpak df -h /tmp
   
   # Backups are created in /tmp first
   # Ensure at least 2x database size available
   ```

2. **Backup Process Killed**
   - Memory limit too low
   - Increase container memory or reduce concurrency

3. **Cannot Write to /tmp**
   ```bash
   docker exec cpak test -w /tmp && echo "OK" || echo "Not writable"
   ```

### Restore Fails

**Symptoms**: Restore process errors or data not appearing

**Common Issues**:

1. **Incompatible Backup Format**
   - Ensure backup was created with same or older version
   - Check backup file integrity:
     ```bash
     tar -tzf backup_20260212.tar.gz
     ```

2. **Database Already Has Data**
   - Restore will not overwrite unless explicitly stated
   - Consider backup current data first

3. **Corrupted Backup File**
   - Re-download or recreate backup
   - Verify file size matches expected

### Migration Between Modes

**Unified → External DB**:
```bash
# 1. Create backup in unified mode
# Use Settings → Backup & Restore

# 2. Stop unified container
docker compose -f docker-compose.unified.yml down

# 3. Start external DB setup
docker compose -f docker-compose.external-db.yml up -d

# 4. Restore backup via UI
# Settings → Backup & Restore → Upload & Restore
```

**External DB → Unified**:
```bash
# 1. Export database
docker exec mongo mongodump --db cpak --out /tmp/export

# 2. Switch compose files
docker compose -f docker-compose.external-db.yml down
docker compose -f docker-compose.unified.yml up -d

# 3. Import data
docker cp /tmp/export cpak:/tmp/
docker exec cpak mongorestore /tmp/export
```

---

## Getting Help

If you encounter an issue not covered here:

1. **Check Logs**:
   ```bash
   docker logs cpak --tail 200 > cpak-logs.txt
   ```

2. **Check Service Status**:
   ```bash
   docker exec cpak supervisorctl status > cpak-status.txt
   ```

3. **System Information**:
   ```bash
   docker info > docker-info.txt
   docker version > docker-version.txt
   ```

4. **Create Issue** on GitHub with:
   - Log files (remove sensitive data!)
   - Docker compose file (remove secrets!)
   - Steps to reproduce
   - Expected vs actual behavior

---

## Prevention Best Practices

1. **Regular Backups**
   - Schedule weekly backups via Settings
   - Download and store externally

2. **Monitor Resources**
   - Check disk space monthly
   - Monitor memory usage

3. **Keep Encryption Key Safe**
   - Store in password manager
   - Required to decrypt settings after restore

4. **Update Regularly**
   - Pull latest image monthly
   - Check release notes for breaking changes

5. **Test Restores**
   - Verify backups work before disaster strikes
   - Test restore in development environment
