#!/bin/bash

# BUAS Frontend Deployment Script

echo "🦇 BUAS Frontend Deployment Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the frontend directory."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to install dependencies"
    exit 1
fi

echo "🏗️  Building production bundle..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Error: Build failed"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "📁 Build files are in the 'build' directory"

# If VPS deployment is requested
if [ "$1" = "--deploy" ]; then
    echo "🚀 Deploying to VPS..."
    
    VPS_USER="root"
    VPS_HOST="105.114.25.157"
    VPS_PATH="/var/www/buas-dashboard"
    
    echo "📤 Uploading files to VPS..."
    scp -r build/* $VPS_USER@$VPS_HOST:$VPS_PATH/
    
    if [ $? -eq 0 ]; then
        echo "✅ Deployment successful!"
        echo "🌐 Dashboard should be available at: http://$VPS_HOST:3000"
    else
        echo "❌ Deployment failed!"
        exit 1
    fi
fi

echo "🎉 Done!"
