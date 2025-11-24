#!/bin/bash
# Startup script for NAS systems (TrueNAS Scale, Synology, etc.)
# This script can be added to init/startup scripts to auto-start the application

set -e

# Configuration - Adjust these paths for your NAS
APP_DIR="/mnt/your-pool/apps/cpak"
LOG_FILE="/var/log/cpak-startup.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "Starting Achievement Keeper (CPAK) application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log "ERROR: Docker is not running or not accessible"
    exit 1
fi

# Navigate to application directory
if [ ! -d "$APP_DIR" ]; then
    log "ERROR: Application directory not found: $APP_DIR"
    log "Please clone the repository first:"
    log "  git clone https://github.com/GhsVilela/cpak.git $APP_DIR"
    exit 1
fi

cd "$APP_DIR" || exit 1

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    log "ERROR: docker-compose.yml not found in $APP_DIR"
    exit 1
fi

# Pull latest images (optional - comment out if you want to use cached images)
# log "Pulling latest images..."
# docker-compose pull

# Start the application
log "Starting containers..."
if docker-compose up -d; then
    log "Application started successfully"
    
    # Wait a bit for services to be ready
    sleep 10
    
    # Check if services are running
    if docker-compose ps | grep -q "Up"; then
        log "Services are running"
        
        # Get the server IP
        SERVER_IP=$(hostname -I | awk '{print $1}')
        log "Access the application at: http://${SERVER_IP}:8081"
    else
        log "WARNING: Services may not have started correctly"
        log "Check logs with: docker-compose -f $APP_DIR/docker-compose.yml logs"
    fi
else
    log "ERROR: Failed to start application"
    exit 1
fi

log "Startup complete"
