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
echo "To run with MongoDB:"
echo "  1. Start MongoDB: docker-compose up -d mongodb"
echo "  2. Run application: ./run-with-mongo.sh"
echo "  OR set MONGODB_URI and run: ./cpak"
echo ""
echo "Access points:"
echo "- Backend API: http://localhost:8080"
echo "- Frontend UI: http://localhost:8081"
