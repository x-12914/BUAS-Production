#!/bin/bash
# Deploy WebSocket fix for BUAS Production
# Date: November 6, 2025

echo "=========================================="
echo "BUAS WebSocket Fix Deployment"
echo "=========================================="
echo ""

# Step 1: Rebuild frontend
echo "Step 1: Building frontend with WebSocket fix..."
cd /home/opt/BUAS-Production/frontend
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed!"
    exit 1
fi
echo "✅ Frontend built successfully"
echo ""

# Step 2: Update nginx configuration
echo "Step 2: Updating nginx configuration..."
sudo cp /home/opt/BUAS-Production/nginx.conf /etc/nginx/sites-available/buas

if [ $? -ne 0 ]; then
    echo "❌ Failed to update nginx config!"
    exit 1
fi
echo "✅ Nginx config updated"
echo ""

# Step 3: Test nginx configuration
echo "Step 3: Testing nginx configuration..."
sudo nginx -t

if [ $? -ne 0 ]; then
    echo "❌ Nginx configuration test failed!"
    echo "Please check the configuration manually"
    exit 1
fi
echo "✅ Nginx configuration is valid"
echo ""

# Step 4: Reload nginx
echo "Step 4: Reloading nginx..."
sudo systemctl reload nginx

if [ $? -ne 0 ]; then
    echo "⚠️  Nginx reload failed, trying restart..."
    sudo systemctl restart nginx
    if [ $? -ne 0 ]; then
        echo "❌ Nginx restart failed!"
        exit 1
    fi
fi
echo "✅ Nginx reloaded successfully"
echo ""

# Step 5: Check if Flask is running with SocketIO
echo "Step 5: Checking Flask-SocketIO status..."
if pm2 list | grep -q "flask-server"; then
    echo "✅ Flask server is running via PM2"
    
    # Check if streaming is enabled
    if pm2 env 0 | grep -q "ENABLE_STREAMING=true"; then
        echo "✅ ENABLE_STREAMING=true is set"
    else
        echo "⚠️  ENABLE_STREAMING is not set to true!"
        echo "   Setting it now..."
        pm2 restart flask-server --update-env
    fi
else
    echo "⚠️  Flask server is not running via PM2"
    echo "   Starting it now..."
    cd /home/opt/BUAS-Production
    pm2 start ecosystem.config.js
fi
echo ""

# Step 6: Check logs for errors
echo "Step 6: Checking recent logs..."
echo "--- Nginx Error Log (last 5 lines) ---"
sudo tail -n 5 /var/log/nginx/buas_error.log
echo ""
echo "--- PM2 Error Log (last 5 lines) ---"
pm2 logs flask-server --lines 5 --nostream --err
echo ""

# Step 7: Test WebSocket endpoint
echo "Step 7: Testing WebSocket endpoint availability..."
curl -I http://127.0.0.1:5000/socket.io/ 2>/dev/null | head -n 1

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Open your browser and navigate to http://105.114.25.157"
echo "2. Open browser console (F12)"
echo "3. Try to start a live stream on a device"
echo "4. You should see: 'Connecting to Socket.IO at: http://105.114.25.157'"
echo "5. Check for connection success messages"
echo ""
echo "If issues persist, check:"
echo "  - sudo tail -f /var/log/nginx/buas_error.log"
echo "  - pm2 logs flask-server"
echo ""
