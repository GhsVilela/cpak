#!/bin/bash
# CPAK Container Entrypoint Script
# Handles: Database mode detection, volume validation, supervisord startup

set -e

echo "=== CPAK Container Starting ==="
echo "Timestamp: $(date)"

# ============================================================================
# Environment Variables Validation
# ============================================================================

# Info about encryption key
if [ -z "$ENCRYPTION_KEY" ]; then
    echo "ℹ️  INFO: ENCRYPTION_KEY not set. Credentials will be stored as plain text."
    echo "    For encrypted storage, generate a secure key: openssl rand -base64 32"
else
    echo "🔒 INFO: ENCRYPTION_KEY configured. Credentials will be encrypted (AES-256-GCM)."
fi

# ============================================================================
# HTTPS Mode Detection
# ============================================================================

if [ "$HTTPS_MODE" = "self-signed" ]; then
    echo "🔒 HTTPS mode: self-signed certificate (Caddy internal CA)"
    echo "   Swapping Caddyfile to HTTPS configuration..."
    cp /etc/caddy/Caddyfile.https /etc/caddy/Caddyfile
    echo "   ✓ Caddy will serve HTTPS on port 443 with a self-signed certificate"
    echo "   ℹ️  Your browser will warn about the certificate — accept it once to proceed"
elif [ "$HTTPS_MODE" = "custom-cert" ]; then
    echo "🔒 HTTPS mode: user-provided certificate"
    # Validate that both cert and key files are present at the expected mount paths
    if [ ! -f "/etc/caddy/tls/cert.pem" ]; then
        echo "❌ ERROR: HTTPS_MODE=custom-cert requires a certificate at /etc/caddy/tls/cert.pem"
        echo "   Mount your certificate: -v /path/to/cert.pem:/etc/caddy/tls/cert.pem:ro"
        exit 1
    fi
    if [ ! -f "/etc/caddy/tls/key.pem" ]; then
        echo "❌ ERROR: HTTPS_MODE=custom-cert requires a private key at /etc/caddy/tls/key.pem"
        echo "   Mount your key: -v /path/to/key.pem:/etc/caddy/tls/key.pem:ro"
        exit 1
    fi
    echo "   Swapping Caddyfile to custom certificate configuration..."
    cp /etc/caddy/Caddyfile.custom-cert /etc/caddy/Caddyfile
    echo "   ✓ Caddy will serve HTTPS on port 443 using your certificate"
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
    mkdir -p /app/data/db
    
    # Set MONGO_URI for backend to connect to bundled MongoDB
    export MONGO_URI="mongodb://localhost:27017/cpak"
    
    echo "   MongoDB will start at: mongodb://localhost:27017"
    
    # Initialize MongoDB data directory if empty
    if [ ! -d "/app/data/db/journal" ] && [ ! -f "/app/data/db/WiredTiger" ]; then
        echo "   Initializing MongoDB database directory..."
        chown -R mongodb:mongodb /app/data/db
    fi
fi

# ============================================================================
# Volume Detection & Validation
# ============================================================================

echo ""
echo "📁 Checking volume configuration..."

# Check if split volumes are mounted
if mountpoint -q /app/data/db && mountpoint -q /app/data/images 2>/dev/null; then
    echo "   Split volume mode detected:"
    echo "     - Database: /app/data/db"
    echo "     - Images:   /app/data/images"
    DB_PATH="/app/data/db"
    IMAGES_PATH="/app/data/images"
    BACKUP_PATH="/app/data/backups"
else
    echo "   Unified volume mode (default):"
    echo "     - All data: /app/data"
    DB_PATH="/app/data/db"
    IMAGES_PATH="/app/data/images"
    BACKUP_PATH="/app/data/backups"
    
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
echo "   Volume Mode:      $(mountpoint -q /app/data/db 2>/dev/null && echo 'Split' || echo 'Unified')"
echo "   Images Path:      $IMAGES_PATH"
echo "   MongoDB URI:      ${MONGO_URI}"
echo "   Encryption Key:   ${ENCRYPTION_KEY:0:8}... (${#ENCRYPTION_KEY} chars)"
echo "   HTTPS Mode:       ${HTTPS_MODE:-off (HTTP only)}"
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
