# Docker Deployment Guide

This guide covers deploying the Achievement Keeper application using Docker and Docker Compose, including deployment on NAS systems like TrueNAS Scale.

## Table of Contents
- [Quick Start](#quick-start)
- [Docker Compose Setup](#docker-compose-setup)
- [TrueNAS Scale Deployment](#truenas-scale-deployment)
- [Configuration](#configuration)
- [Maintenance](#maintenance)

## Quick Start

### Prerequisites
- Docker Engine 20.10 or later
- Docker Compose v2.0 or later
- At least 512MB available RAM
- 1GB available disk space

### One-Command Start

```bash
docker-compose up -d
```

That's it! The application will be available at:
- **Frontend UI**: http://localhost:8081 ⭐ (Main access point)
- **Backend API**: http://localhost:8080 (Optional, for direct API access)

### First Time Setup

1. **Clone the repository**:
```bash
git clone https://github.com/GhsVilela/cpak.git
cd cpak
```

2. **Start the application**:
```bash
docker-compose up -d
```

3. **Check status**:
```bash
docker-compose ps
```

4. **View logs**:
```bash
docker-compose logs -f cpak
```

5. **Open in browser**:
Navigate to http://your-server-ip:8081

## Docker Compose Setup

### Services Included

The `docker-compose.yml` includes:

1. **MongoDB** (port 27017, internal only)
   - Persistent data storage
   - Automatic health checks
   - Not exposed to outside network

2. **CPAK Application** (ports 8080, 8081)
   - Backend API on port 8080
   - Frontend UI on port 8081
   - Automatic restart
   - Health monitoring

### Architecture

```
┌─────────────────────────────────────────┐
│          Docker Host (NAS)              │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │   MongoDB    │◄───│  CPAK App    │  │
│  │  (Internal)  │    │              │  │
│  └──────────────┘    │  Backend:8080│  │
│                      │ Frontend:8081│  │
│  ┌──────────────┐    └───────┬──────┘  │
│  │ Persistent   │            │         │
│  │   Volume     │            │         │
│  └──────────────┘            │         │
└──────────────────────────────┼─────────┘
                               │
                          Port 8081
                               │
                     ┌─────────▼──────────┐
                     │  User's Browser    │
                     └────────────────────┘
```

### Data Persistence

Data is automatically persisted in a Docker volume:
```bash
# View volumes
docker volume ls | grep cpak

# Backup database
docker-compose exec mongodb mongodump --out /data/backup

# Restore database
docker-compose exec mongodb mongorestore /data/backup
```

## TrueNAS Scale Deployment

### Method 1: Docker Compose (Recommended)

TrueNAS Scale has built-in Docker Compose support:

1. **Navigate to Apps**:
   - Go to TrueNAS Scale web interface
   - Navigate to "Apps" → "Available Applications"
   - Click "Launch Docker Image" or "Custom App"

2. **Configure Application**:
   - **Name**: `cpak-achievement-keeper`
   - **Repository**: `ghcr.io/ghsvilela/cpak` (or your registry)
   - **Tag**: `latest`

3. **Port Configuration**:
   - Container Port 8080 → Host Port 8080 (Backend API)
   - Container Port 8081 → Host Port 8081 (Frontend UI)

4. **Environment Variables**:
   ```
   MONGODB_URI=mongodb://mongodb:27017
   TZ=Your/Timezone
   ```

5. **Storage**:
   - Add a Host Path for MongoDB data
   - Mount to: `/data/db`
   - Type: Host Path (recommended for NAS)

### Method 2: Manual Docker Setup

If TrueNAS doesn't have the built-in app:

1. **Enable Docker/SSH**:
   - Enable SSH access in TrueNAS
   - Connect via SSH

2. **Clone and Deploy**:
```bash
cd /mnt/your-pool/apps
git clone https://github.com/GhsVilela/cpak.git
cd cpak
docker-compose up -d
```

3. **Auto-start on Boot**:
Create a systemd service or use TrueNAS "Init/Shutdown Scripts":
```bash
#!/bin/bash
cd /mnt/your-pool/apps/cpak
docker-compose up -d
```

### Method 3: TrueNAS Scale Custom Chart

For advanced users, create a Helm chart:

1. **Create Chart Structure**:
```
cpak-chart/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    └── pvc.yaml
```

2. **Deploy via TrueNAS**:
   - Add as custom catalog
   - Install from catalog UI

## Configuration

### Environment Variables

Create a `.env` file or set in docker-compose.yml:

```env
# Database
MONGODB_URI=mongodb://mongodb:27017

# Timezone
TZ=America/New_York

# Optional: Custom ports
BACKEND_PORT=8080
FRONTEND_PORT=8081
```

### Custom Ports

To change the default ports, edit `docker-compose.yml`:

```yaml
services:
  cpak:
    ports:
      - "9090:8080"  # Custom backend port
      - "9091:8081"  # Custom frontend port
```

### Resource Limits

Add resource constraints for NAS deployment:

```yaml
services:
  cpak:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M
```

## Maintenance

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f cpak
docker-compose logs -f mongodb
```

### Update Application

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Backup Data

```bash
# Backup MongoDB data
docker-compose exec mongodb mongodump --out /data/backup
docker cp cpak-mongodb:/data/backup ./mongodb-backup-$(date +%Y%m%d)

# Backup Docker volume
docker run --rm -v cpak_mongodb_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/mongodb-backup-$(date +%Y%m%d).tar.gz /data
```

### Restore Data

```bash
# Restore from mongodump
docker cp ./mongodb-backup-20231115 cpak-mongodb:/data/restore
docker-compose exec mongodb mongorestore /data/restore

# Restore from volume backup
docker run --rm -v cpak_mongodb_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/mongodb-backup-20231115.tar.gz -C /
```

### Stop and Remove

```bash
# Stop services
docker-compose stop

# Stop and remove containers (keeps data)
docker-compose down

# Remove everything including volumes (⚠️ DELETES DATA)
docker-compose down -v
```

### Monitoring

Check application health:

```bash
# Check container health
docker-compose ps

# Check API health
curl http://localhost:8080/api/health

# Check frontend accessibility
curl -I http://localhost:8081
```

### Troubleshooting

**Container won't start:**
```bash
docker-compose logs cpak
docker-compose logs mongodb
```

**Can't connect to MongoDB:**
```bash
docker-compose exec cpak ping mongodb
docker-compose exec mongodb mongosh --eval "db.runCommand('ping')"
```

**Port already in use:**
```bash
# Check what's using the port
sudo lsof -i :8081
# Or change port in docker-compose.yml
```

**Reset everything:**
```bash
docker-compose down -v
docker-compose up -d --build
```

## Security Recommendations

1. **Reverse Proxy**: Use nginx or traefik for HTTPS
2. **Firewall**: Only expose port 8081 externally
3. **Updates**: Regularly update the containers
4. **Backups**: Schedule regular database backups
5. **Monitoring**: Set up health check alerts

## Performance Tuning

For better performance on NAS:

1. **Use SSD for Docker volumes**
2. **Allocate sufficient RAM** (minimum 512MB)
3. **Enable Docker log rotation**:
```yaml
services:
  cpak:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/GhsVilela/cpak/issues
- Documentation: https://github.com/GhsVilela/cpak/blob/main/README.md
