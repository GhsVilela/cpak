#!/bin/bash
set -e

echo "Building cpak with Templ + HTMX frontend..."
echo ""

echo "Step 1: Installing templ CLI (if not installed)..."
if ! command -v templ &> /dev/null; then
    echo "Installing templ..."
    go install github.com/a-h/templ/cmd/templ@latest
fi

echo "Step 2: Generating Go code from Templ templates..."
~/go/bin/templ generate || $GOPATH/bin/templ generate || go run github.com/a-h/templ/cmd/templ@latest generate

echo "Step 3: Building main application..."
go build -o cpak main.go

echo ""
echo "Build complete!"
echo ""
echo "To run:"
echo "  Option 1 (Docker - recommended):"
echo "    docker compose up -d"
echo ""
echo "  Option 2 (Local with MongoDB):"
echo "    1. Start MongoDB: docker run -d -p 27017:27017 mongo:7"
echo "    2. Set MONGODB_URI: export MONGODB_URI='mongodb://localhost:27017'"
echo "    3. Run: ./cpak"
echo ""
echo "Access points:"
echo "  - Frontend UI: http://localhost:8081"
echo "  - Backend API: http://localhost:8080"
echo ""
echo "Note: Frontend now uses server-side Templ templates with HTMX for interactivity."
echo "No WebAssembly compilation needed!"
