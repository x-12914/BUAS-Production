# BUAS Production - Windows Setup Script
# Run this script on your dedicated PC as Administrator

Write-Host "Starting BUAS Production Setup..." -ForegroundColor Cyan

# 1. Check for Node.js
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Please install it from https://nodejs.org/"
    exit
}

# 2. Install PM2 and dependencies
Write-Host "Installing PM2..." -ForegroundColor Yellow
npm install -g pm2
npm install -g pm2-windows-startup

# 3. Setup PM2 to start on boot
Write-Host "Configuring PM2 to start on boot..." -ForegroundColor Yellow
pm2-startup install
# Note: You might need to run 'pm2 save' after starting your apps

# 4. Check for Python
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python is not installed. Please install it from https://python.org/"
    exit
}

# 5. Create Virtual Environment
if (!(Test-Path "venv")) {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# 6. Install Python dependencies
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
.\venv\Scripts\pip install -r requirements.txt

# 7. Create Logs directory
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs"
}

# 8. Create Uploads directory
if (!(Test-Path "uploads")) {
    New-Item -ItemType Directory -Path "uploads"
}

Write-Host "`nSetup Complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Create a .env file based on .env.example"
Write-Host "2. Install Cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
Write-Host "3. Run 'cloudflared tunnel login' and 'cloudflared tunnel create buas-tunnel'"
Write-Host "4. Use the provided cloudflared_config.yml"
Write-Host "5. Start everything with 'pm2 start ecosystem.config.js' then 'pm2 save'"
