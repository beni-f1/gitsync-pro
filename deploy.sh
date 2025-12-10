#!/bin/bash

# GitsSync Pro - Build and Deploy Script
# This script builds the frontend and deploys both frontend and backend with Docker

set -e

echo "🚀 GitsSync Pro - Build & Deploy"
echo "================================="

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Step 1: Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
npm install

# Step 2: Build the frontend application
echo ""
echo "🔨 Building frontend..."
npm run build

# Step 3: Check if dist folder exists
if [ ! -d "dist" ]; then
    echo "❌ Build failed - dist folder not found"
    exit 1
fi

echo "✅ Frontend build successful!"

# Step 4: Build and start Docker containers
echo ""
echo "🐳 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting containers..."
docker-compose up -d

echo ""
echo "================================="
echo "✅ Deployment complete!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""
echo "Default login: admin / admin"
echo ""
echo "Commands:"
echo "  Stop:    docker-compose down"
echo "  Logs:    docker-compose logs -f"
echo "  Backend: docker-compose logs -f backend"
echo "  Restart: docker-compose restart"
