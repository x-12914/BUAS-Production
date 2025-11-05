@echo off
REM BUAS Frontend Deployment Script for Windows

echo 🦇 BUAS Frontend Deployment Script
echo ==================================

REM Check if we're in the right directory
if not exist "package.json" (
    echo ❌ Error: package.json not found. Please run this script from the frontend directory.
    exit /b 1
)

echo 📦 Installing dependencies...
call npm install

if %errorlevel% neq 0 (
    echo ❌ Error: Failed to install dependencies
    exit /b 1
)

echo 🏗️ Building production bundle...
call npm run build

if %errorlevel% neq 0 (
    echo ❌ Error: Build failed
    exit /b 1
)

echo ✅ Build completed successfully!
echo 📁 Build files are in the 'build' directory

if "%1"=="--deploy" (
    echo 🚀 Deploying to VPS...
    echo 📤 Please manually upload the 'build' folder contents to your VPS
    echo 🌐 Dashboard will be available at: http://105.114.25.157:3000
)

echo 🎉 Done!
pause
