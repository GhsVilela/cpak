#!/bin/bash
set -e

echo "Starting Achievement Keeper with MongoDB..."
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not running"
    echo "Please install Docker and Docker Compose to use MongoDB"
    echo ""
    echo "Alternatively, you can:"
    echo "1. Install MongoDB locally"
    echo "2. Set MONGODB_URI environment variable"
    echo "3. Run the application"
    exit 1
fi

# Start MongoDB with docker-compose
echo "Starting MongoDB container..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d mongodb
else
    docker compose up -d mongodb
fi

echo "Waiting for MongoDB to be ready..."
sleep 5

# Set MongoDB URI
export MONGODB_URI="mongodb://localhost:27017"

echo ""
echo "MongoDB is running on port 27017"
echo "Starting application..."
echo ""

# Run the application
./cpak
