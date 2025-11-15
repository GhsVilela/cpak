#!/bin/bash
set -e

echo "Building cpak..."
echo ""

# Parse arguments
USE_MONGO=false
if [ "$1" == "--mongo" ] || [ "$1" == "-m" ]; then
    USE_MONGO=true
fi

echo "Step 1: Building frontend WASM..."
GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend

if [ "$USE_MONGO" = true ]; then
    echo "Step 2: Building main application with MongoDB support..."
    go build -tags mongo -o cpak main_v2.go
    echo ""
    echo "Build complete! MongoDB version built."
    echo ""
    echo "To run with MongoDB:"
    echo "  1. Start MongoDB: docker-compose up -d mongodb"
    echo "  2. Run application: ./run-with-mongo.sh"
    echo "  OR set MONGODB_URI and run: ./cpak"
else
    echo "Step 2: Building main application (in-memory storage)..."
    go build -o cpak main.go
    echo ""
    echo "Build complete! In-memory version built."
    echo ""
    echo "To run: ./cpak"
fi

echo ""
echo "Access points:"
echo "- Backend API: http://localhost:8080"
echo "- Frontend UI: http://localhost:8081"
