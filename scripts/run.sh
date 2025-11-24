#!/bin/bash
set -e

echo "Starting Achievement Keeper..."
echo ""

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not running"
    echo "Please install Docker and Docker Compose"
    exit 1
fi

# Start the complete stack with docker compose
echo "Starting MongoDB and application containers..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check if containers are running
if command -v docker-compose &> /dev/null; then
    docker-compose ps
else
    docker compose ps
fi

echo ""
echo "✅ Achievement Keeper is running!"
echo ""
echo "Access the application at:"
echo "  - Frontend UI: http://localhost:8081"
echo "  - Backend API: http://localhost:8080"
echo ""
echo "To view logs:"
echo "  docker compose logs -f"
echo ""
echo "To stop:"
echo "  docker compose down"
