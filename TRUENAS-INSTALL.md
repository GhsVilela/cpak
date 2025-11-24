# TrueNAS Scale Installation Guide

Quick guide to install Achievement Keeper on TrueNAS Scale in under 5 minutes.

## Prerequisites

- TrueNAS Scale 22.02 or later
- SSH access enabled (for command-line method)
- At least 1GB free space

## Installation Methods

### Method 1: Command Line (Recommended - Easiest)

This is the fastest and most reliable method.

#### Step 1: Enable SSH
1. In TrueNAS web interface, go to **System Settings** → **Services**
2. Find **SSH** and click the toggle to enable it
3. Click the pencil icon to configure (optional: allow root login)

#### Step 2: Connect via SSH
```bash
ssh admin@your-truenas-ip
# Or if using root:
ssh root@your-truenas-ip
```

#### Step 3: Navigate to Apps Directory
```bash
# Create directory for applications if it doesn't exist
sudo mkdir -p /mnt/your-pool/apps
cd /mnt/your-pool/apps
```
> Replace `your-pool` with your actual pool name (e.g., `main-pool`, `tank`, etc.)

#### Step 4: Clone Repository
```bash
sudo git clone https://github.com/GhsVilela/cpak.git
cd cpak
```

#### Step 5: Start the Application
```bash
sudo docker-compose up -d
```

#### Step 6: Verify Installation
```bash
# Check if containers are running
sudo docker-compose ps

# View logs
sudo docker-compose logs -f
```

#### Step 7: Access the Application
Open your browser and go to:
```
http://your-truenas-ip:8081
```

That's it! 🎉

### Method 2: TrueNAS Custom App (Alternative)

If you prefer using the TrueNAS web interface:

#### Step 1: Prepare Files
1. Follow Steps 1-4 from Method 1 to get the files on your NAS

#### Step 2: Create Custom App
1. Go to **Apps** in TrueNAS web interface
2. Click **Discover Apps** → **Custom App**
3. Fill in the details:

**Application Name**: `achievement-keeper`

**Container Images**:
- Image Repository: `mongo`
- Image Tag: `7`

**Container Settings**:
- Add additional containers manually or use Docker Compose

> Note: TrueNAS Scale UI for custom apps is evolving. For complex setups with multiple containers, the command-line method (Method 1) is more reliable.

### Method 3: Docker Compose File Upload

Some TrueNAS Scale versions support direct docker-compose.yml upload:

1. Download the repository as ZIP
2. Extract `docker-compose.yml`
3. Go to **Apps** → **Docker Compose**
4. Upload the `docker-compose.yml` file
5. Configure volumes and ports
6. Launch

## Post-Installation

### Auto-Start on Boot

To make the application start automatically when TrueNAS boots:

#### Option A: Using Init Scripts
1. Go to **System Settings** → **Advanced** → **Init/Shutdown Scripts**
2. Click **Add**
3. Configure:
   - **Description**: Start Achievement Keeper
   - **Type**: Command
   - **Command**: 
     ```bash
     cd /mnt/your-pool/apps/cpak && docker-compose up -d
     ```
   - **When**: Post Init
   - **Enabled**: ✓ (checked)
4. Save

#### Option B: Using Startup Script
1. Copy the provided startup script:
   ```bash
   sudo cp scripts/nas-startup.sh /usr/local/bin/cpak-startup
   sudo chmod +x /usr/local/bin/cpak-startup
   ```

2. Edit the script to set your paths:
   ```bash
   sudo nano /usr/local/bin/cpak-startup
   # Change APP_DIR to your installation path
   ```

3. Add to Init Scripts (as in Option A) with command:
   ```bash
   /usr/local/bin/cpak-startup
   ```

### Configure Ports

If ports 8080 or 8081 are already in use:

1. Edit `docker-compose.yml`:
   ```bash
   cd /mnt/your-pool/apps/cpak
   sudo nano docker-compose.yml
   ```

2. Change the ports section:
   ```yaml
   ports:
     - "9090:8080"  # Backend API (optional)
     - "9091:8081"  # Frontend UI (required)
   ```

3. Restart:
   ```bash
   sudo docker-compose down
   sudo docker-compose up -d
   ```

### Set Up Reverse Proxy (Optional)

For HTTPS access:

1. Install nginx or use TrueNAS reverse proxy
2. Configure proxy to forward to `http://localhost:8081`
3. Add SSL certificate
4. Access via `https://achievements.yourdomain.com`

## Updating

To update to the latest version:

```bash
cd /mnt/your-pool/apps/cpak
sudo git pull origin main
sudo docker-compose down
sudo docker-compose build --no-cache
sudo docker-compose up -d
```

## Backup

### Backup Data
```bash
cd /mnt/your-pool/apps/cpak

# Backup database
sudo docker-compose exec mongodb mongodump --out /data/backup
sudo docker cp cpak-mongodb:/data/backup ./backup-$(date +%Y%m%d)

# Or backup the entire volume
sudo docker run --rm -v cpak_mongodb_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/mongodb-backup-$(date +%Y%m%d).tar.gz /data
```

### Automated Backups
Add a cron job:

```bash
sudo crontab -e
```

Add this line for daily backups at 2 AM:
```
0 2 * * * cd /mnt/your-pool/apps/cpak && docker-compose exec -T mongodb mongodump --out /data/backup
```

## Troubleshooting

### Application Not Starting
```bash
# Check logs
cd /mnt/your-pool/apps/cpak
sudo docker-compose logs

# Check if Docker is running
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker
```

### Can't Access Web Interface
```bash
# Check if containers are running
sudo docker-compose ps

# Check port availability
sudo netstat -tuln | grep 8081

# Check firewall
sudo iptables -L | grep 8081
```

### MongoDB Connection Issues
```bash
# Test MongoDB connection
sudo docker-compose exec cpak ping mongodb

# Check MongoDB logs
sudo docker-compose logs mongodb

# Restart MongoDB
sudo docker-compose restart mongodb
```

### Reset Everything
```bash
cd /mnt/your-pool/apps/cpak
sudo docker-compose down -v  # ⚠️ This deletes all data!
sudo docker-compose up -d
```

## Uninstallation

To completely remove the application:

```bash
cd /mnt/your-pool/apps/cpak

# Stop and remove containers
sudo docker-compose down

# Remove volumes (⚠️ deletes all data)
sudo docker-compose down -v

# Remove application files
cd ..
sudo rm -rf cpak

# Optional: Remove Docker images
sudo docker image prune -a
```

## Performance Tips

1. **Use SSD Pool**: Install on SSD pool for better performance
2. **Allocate RAM**: Ensure TrueNAS has enough free RAM (min 1GB for this app)
3. **Monitor Resources**: Use TrueNAS dashboard to monitor CPU/RAM usage
4. **Regular Maintenance**: Run `docker system prune` occasionally to clean up

## Support

- **Documentation**: [Main README](README.md) | [Docker Guide](DOCKER.md)
- **Issues**: [GitHub Issues](https://github.com/GhsVilela/cpak/issues)
- **TrueNAS Forums**: Search for "custom app" or "docker compose"

## Quick Reference

```bash
# Start
cd /mnt/your-pool/apps/cpak && sudo docker-compose up -d

# Stop
sudo docker-compose stop

# Restart
sudo docker-compose restart

# View logs
sudo docker-compose logs -f

# Update
git pull && docker-compose up -d --build

# Backup
docker-compose exec mongodb mongodump --out /data/backup

# Access URLs
# Frontend: http://your-truenas-ip:8081
# Backend API: http://your-truenas-ip:8080
```
