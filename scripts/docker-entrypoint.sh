#!/bin/bash
# CPAK Container Entrypoint Script
# Handles: Database mode detection, volume validation, supervisord startup

set -e

echo "=== CPAK Container Starting ==="
echo "Timestamp: $(date)"

# ============================================================================
# Environment Variables Validation
# ============================================================================

# Warn if using default/missing encryption key
if [ -z "$ENCRYPTION_KEY" ]; then
    echo "⚠️  WARNING: ENCRYPTION_KEY not set. Using default key (INSECURE for production)."
    echo "    Generate a secure key: openssl rand -base64 32"
    export ENCRYPTION_KEY="default-insecure-key-change-me"
fi

# ============================================================================
# Database Mode Detection
# ============================================================================

if [ -n "$EXTERNAL_DB" ] || [ -n "$MONGO_URI" ]; then
    echo "📦 External database mode enabled"
    
    # Validate MONGO_URI is set
    if [ -z "$MONGO_URI" ]; then
        echo "❌ ERROR: EXTERNAL_DB=true requires MONGO_URI to be set"
        exit 1
    fi
    
    # Disable MongoDB service in supervisord by commenting it out
    echo "   Disabling bundled MongoDB service..."
    sed -i '/^\[program:mongodb\]/,/^startretries=/s/^/; /' /etc/supervisor/conf.d/cpak.conf
    
    echo "   Using external MongoDB: $MONGO_URI"
else
    echo "📦 Bundled database mode (default)"
    
    # Ensure database directory exists
    mkdir -p /data/db
    
    # Set MONGO_URI for backend to connect to bundled MongoDB
    export MONGO_URI="mongodb://localhost:27017/cpak"
    
    echo "   MongoDB will start at: mongodb://localhost:27017"
    
    # Initialize MongoDB data directory if empty
    if [ ! -d "/data/db/journal" ] && [ ! -f "/data/db/WiredTiger" ]; then
        echo "   Initializing MongoDB database directory..."
        chown -R mongodb:mongodb /data/db
    fi
fi

# ============================================================================
# Volume Detection & Validation
# ============================================================================

echo ""
echo "📁 Checking volume configuration..."

# Check if split volumes are mounted
if mountpoint -q /data/db && mountpoint -q /data/images 2>/dev/null; then
    echo "   Split volume mode detected:"
    echo "     - Database: /data/db"
    echo "     - Images:   /data/images"
    DB_PATH="/data/db"
    IMAGES_PATH="/data/images"
    BACKUP_PATH="/data/backups"
else
    echo "   Unified volume mode (default):"
    echo "     - All data: /data"
    DB_PATH="/data/db"
    IMAGES_PATH="/data/images"
    BACKUP_PATH="/data/backups"
    
    # Create subdirectories if they don't exist
    mkdir -p "$DB_PATH" "$IMAGES_PATH" "$BACKUP_PATH"
fi

# Validate write permissions
echo ""
echo "🔐 Validating volume permissions..."

# Test images directory (required for all modes)
if [ ! -w "$IMAGES_PATH" ]; then
    echo "❌ ERROR: Images directory is not writable: $IMAGES_PATH"
    exit 1
fi
echo "   ✓ Images directory writable: $IMAGES_PATH"

# Test database directory (only in bundled mode)
if [ -z "$EXTERNAL_DB" ]; then
    if [ ! -w "$DB_PATH" ]; then
        echo "❌ ERROR: Database directory is not writable: $DB_PATH"
        exit 1
    fi
    echo "   ✓ Database directory writable: $DB_PATH"
    
    # Set ownership for MongoDB user
    chown -R mongodb:mongodb "$DB_PATH"
    echo "   ✓ Database directory owned by mongodb user"
fi

# Update backend environment with correct paths
export IMAGES_DIR="$IMAGES_PATH"
export BACKUP_DIR="$BACKUP_PATH"

# ============================================================================
# MongoDB Health Check (Bundled Mode)
# ============================================================================

if [ -z "$EXTERNAL_DB" ]; then
    echo ""
    echo "🔍 MongoDB health check will be performed after startup"
    echo "   (supervisord will manage MongoDB process)"
fi

# ============================================================================
# Configuration Summary
# ============================================================================

echo ""
echo "📋 Configuration Summary:"
echo "   Database Mode:    ${EXTERNAL_DB:+External}${EXTERNAL_DB:-Bundled}"
echo "   Volume Mode:      $(mountpoint -q /data/db 2>/dev/null && echo 'Split' || echo 'Unified')"
echo "   Images Path:      $IMAGES_PATH"
echo "   MongoDB URI:      ${MONGO_URI}"
echo "   Encryption Key:   ${ENCRYPTION_KEY:0:8}... (${#ENCRYPTION_KEY} chars)"
echo ""

# ============================================================================
# Start supervisord
# ============================================================================

echo "🚀 Starting services via supervisord..."
echo "   - Caddy (web server + reverse proxy)"
echo "   - Backend API (Fastify)"
if [ -z "$EXTERNAL_DB" ]; then
    echo "   - MongoDB (database)"
fi
echo ""

# Execute supervisord (replaces this process)
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf

# Execute supervisord (replaces this process)
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
