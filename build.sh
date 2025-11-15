#!/bin/bash
set -e

echo "Building cpak..."
echo ""

echo "Step 1: Building frontend WASM..."
GOARCH=wasm GOOS=js go build -o web/app.wasm ./frontend

echo "Step 2: Building main application..."
go build -o cpak .

echo ""
echo "Build complete! Run './cpak' to start the application."
echo "- Backend API: http://localhost:8080"
echo "- Frontend UI: http://localhost:8081"
