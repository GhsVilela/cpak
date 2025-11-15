#!/bin/bash
set -e

echo "Building cpak with MongoDB..."
echo ""

echo "Step 1: Building frontend WASM..."
GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend

echo "Step 2: Building main application..."
go build -o cpak main.go

echo ""
echo "Build complete!"
echo ""
echo "To run:"
echo "  Option 1 (Docker - recommended):"
echo "    ./run.sh"
echo "    or: docker compose up -d"
echo ""
echo "  Option 2 (Local with MongoDB):"
echo "    1. Start MongoDB: docker run -d -p 27017:27017 mongo:7"
echo "    2. Set MONGODB_URI: export MONGODB_URI='mongodb://localhost:27017'"
echo "    3. Run: ./cpak"
echo ""
echo "Access points:"
echo "  - Frontend UI: http://localhost:8081"
echo "  - Backend API: http://localhost:8080"
