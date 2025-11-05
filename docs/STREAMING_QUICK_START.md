# Live Audio Streaming - Quick Start Guide

## TL;DR

Enable live audio streaming in 3 steps:

```bash
# 1. Install dependencies
pip install flask-socketio==5.3.5 python-socketio==5.10.0
cd frontend && npm install

# 2. Ensure Redis is running
redis-server  # In separate terminal

# 3. Enable streaming and start server
export ENABLE_STREAMING=true
python server.py
```

Then click "Listen Live" on any device detail page!

---

## Detailed Setup

### Prerequisites

- ✅ Existing BUAS system working
- ✅ Redis installed and running
- ✅ Python 3.7+
- ✅ Node.js 14+ (for frontend)

### Step-by-Step Installation

#### 1. Install Backend Dependencies

```bash
cd /path/to/BUAS
pip install flask-socketio==5.3.5 python-socketio==5.10.0
```

#### 2. Install Frontend Dependencies

```bash
cd frontend
npm install socket.io-client@^4.5.4
```

#### 3. Start Redis

```bash
# Check if Redis is installed
redis-cli --version

# If not installed:
# Ubuntu/Debian: sudo apt-get install redis-server
# macOS: brew install redis

# Start Redis
redis-server
# Keep this terminal open, or run as daemon
```

#### 4. Enable Streaming

```bash
# In your terminal where you'll run the server:
export ENABLE_STREAMING=true

# Or add to your .bashrc / .zshrc for permanent:
echo 'export ENABLE_STREAMING=true' >> ~/.bashrc
source ~/.bashrc
```

#### 5. Create Database Tables

```bash
python -c "from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all()"
```

**Verify tables created:**
```bash
sqlite3 uploads.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%stream%';"
```

Should show:
```
live_stream_sessions
stream_listeners
```

#### 6. Start Backend Server

```bash
python server.py
```

**Look for these lines:**
```
Starting Flask server...
Live streaming: ✅ ENABLED
Starting with SocketIO support for live streaming...
✅ Live streaming enabled - SocketIO initialized
✅ Streaming WebSocket handlers registered
```

If you see these, streaming is enabled!

#### 7. Build Frontend (if needed)

```bash
cd frontend
npm run build
```

#### 8. Test It!

1. Open dashboard: `http://localhost:4000` (or your configured URL)
2. Login
3. Go to any device detail page
4. Look for "Listen Live" button
5. Click it!

---

## First Test

### Quick Test Without Android Device

You can test the backend/frontend without an Android device:

1. **Start Backend** (steps above)

2. **Open Browser Console** (F12)

3. **Test WebSocket Connection:**
```javascript
const socket = io('http://localhost:5000/stream', { 
  withCredentials: true 
});

socket.on('connect', () => console.log('✅ Connected!'));
socket.on('connect_error', (err) => console.log('❌ Error:', err));
socket.on('stream_requested', (data) => console.log('Stream requested:', data));
socket.on('stream_error', (data) => console.log('Stream error:', data));

// Request a stream (will wait for device)
socket.emit('request_live_stream', { device_id: 'test-device-123' });
```

**Expected:**
- Console shows: `✅ Connected!`
- Console shows: `Stream requested: {...}`
- Backend logs show: `Stream session X created for device test-device-123`

---

## Android Device Setup

### 1. Build Updated APK

```bash
cd Bat
./gradlew assembleDebug
```

### 2. Install on Device

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 3. Grant Permissions

- Audio recording (already required)
- Internet access (already granted)

### 4. Test Streaming

1. **Dashboard:** Click "Listen Live" on device
2. **Wait:** Device polls every ~30 seconds
3. **Device logs:**
```bash
adb logcat | grep "stream_start"
```

Should show:
```
Server command received: 'stream_start'
🔴 Starting live audio streaming
✅ WebSocket connected
✅ AudioRecord initialized
✅ AAC encoder initialized
✅ Live streaming started successfully
```

4. **Dashboard:** Should show "LIVE" and play audio!

---

## Troubleshooting

### Problem: "Live streaming: ⏸️ DISABLED"

**Solution:**
```bash
export ENABLE_STREAMING=true
python server.py
```

---

### Problem: "Redis connection error"

**Check if Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

**If not running:**
```bash
redis-server
```

---

### Problem: "Listen Live" button not visible

**Possible causes:**
1. Frontend not rebuilt
   ```bash
   cd frontend
   npm run build
   ```

2. Browser cache
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

3. Streaming not enabled
   - Check server startup logs for "✅ ENABLED"

---

### Problem: Device doesn't start streaming

**Check:**

1. **Device polling?**
   ```bash
   # Backend logs should show:
   # "Polling from device: deviceX"
   ```

2. **Device already recording?**
   - Stop recording first
   - Streaming and recording can't run simultaneously

3. **Command received?**
   ```bash
   adb logcat | grep "stream_start"
   ```

4. **Permissions?**
   - Audio recording permission must be granted

---

### Problem: No audio heard

**Check:**

1. **Stream status in database:**
   ```bash
   sqlite3 uploads.db "SELECT status FROM live_stream_sessions ORDER BY id DESC LIMIT 1;"
   ```
   Should be: `active`

2. **Browser console for errors**
   - Press F12, check Console tab

3. **Audio chunks being sent?**
   ```bash
   adb logcat | grep "Streamed.*chunks"
   ```

4. **Speaker volume and browser audio permissions**

---

## Configuration Options

### Environment Variables

```bash
# Required
export ENABLE_STREAMING=true

# Optional (with defaults)
export REDIS_HOST=localhost     # Redis server host
export REDIS_PORT=6379          # Redis server port
```

### Server URLs

If your backend is on a different server, update:

**Frontend:** `frontend/src/services/api.js`
```javascript
const API_BASE_URL = 'http://YOUR_SERVER_IP:5000';
```

**Android:** `Bat/app/src/main/java/com/animal/bat/PersistentForegroundService.kt`
```kotlin
private const val BASE_URL = "http://YOUR_SERVER_IP:5000"
```

---

## Performance Tips

### For Better Performance:

1. **Use Wi-Fi** instead of cellular data
2. **Reduce concurrent streams** (< 10 devices)
3. **Limit concurrent listeners** (< 5 per device)
4. **Monitor CPU usage** (should be < 70%)

### Upgrade to Production Mode:

For better scalability, upgrade to eventlet:

```bash
pip install eventlet==0.33.3
```

Edit `app/__init__.py`:
```python
socketio = SocketIO(
    app,
    async_mode='eventlet',  # Changed from 'threading'
    ...
)
```

---

## Disabling Streaming

### Temporary Disable

```bash
unset ENABLE_STREAMING
python server.py
```

System will start in recording-only mode.

### Permanent Disable

Remove or comment out in your environment:
```bash
# export ENABLE_STREAMING=true
```

---

## Next Steps

After successful setup:

1. **Test thoroughly:** Follow `STREAMING_TESTING_GUIDE.md`
2. **Set up monitoring:** Use queries from `STREAMING_MONITORING.md`
3. **Review Android changes:** Read `ANDROID_STREAMING_CHANGES.md`
4. **Deploy gradually:** Start with testing environment

---

## Common Questions

**Q: Does this replace recording?**  
A: No, recording still works the same. Streaming is an additional feature.

**Q: Can I record and stream simultaneously?**  
A: No, Android hardware limitation. Choose one or the other.

**Q: How much data does streaming use?**  
A: ~8 KB/second = ~28 MB/hour per device streaming.

**Q: What's the audio quality?**  
A: AAC at 64 kbps, same quality as regular recordings.

**Q: How many people can listen at once?**  
A: Recommended maximum 5 listeners per device.

**Q: What if streaming fails?**  
A: Device creates backup PCM file. Regular recording still works.

**Q: Can I use this in production?**  
A: Yes! Enable the feature flag and monitor performance.

---

## Architecture Diagram

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  Dashboard  │         │   Backend    │         │   Android    │
│   (React)   │◄────────┤Flask-SocketIO├────────►│   Device     │
│             │WebSocket│              │WebSocket│   (Kotlin)   │
└──────┬──────┘         └──────┬───────┘         └──────┬───────┘
       │                       │                        │
       │                       │                        │
       │                  ┌────▼─────┐                 │
       │                  │  Redis   │                 │
       │                  │ Pub/Sub  │                 │
       │                  └──────────┘                 │
       │                                               │
       └───────────── Request Stream ──────────────────┤
       ┌───────────── Audio Chunks ─────────────────────┘
```

---

## Health Check Script

Save as `check_streaming.sh`:

```bash
#!/bin/bash

echo "🔍 Checking Streaming Setup..."

# Check Redis
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis is not running"
fi

# Check Python packages
if python -c "import socketio" 2>/dev/null; then
    echo "✅ python-socketio installed"
else
    echo "❌ python-socketio not installed"
fi

if python -c "import flask_socketio" 2>/dev/null; then
    echo "✅ flask-socketio installed"
else
    echo "❌ flask-socketio not installed"
fi

# Check database tables
if sqlite3 uploads.db "SELECT COUNT(*) FROM live_stream_sessions" > /dev/null 2>&1; then
    echo "✅ Database tables exist"
else
    echo "❌ Database tables missing (run: python -c 'from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all()')"
fi

# Check environment variable
if [ "$ENABLE_STREAMING" = "true" ]; then
    echo "✅ ENABLE_STREAMING=true"
else
    echo "⚠️  ENABLE_STREAMING not set (export ENABLE_STREAMING=true)"
fi

echo ""
echo "Setup check complete!"
```

Run with:
```bash
chmod +x check_streaming.sh
./check_streaming.sh
```

---

## Support

**If you need help:**

1. Check this quick start guide
2. Review `STREAMING_TESTING_GUIDE.md` for detailed tests
3. Check `ANDROID_STREAMING_CHANGES.md` for Android details
4. Use `STREAMING_MONITORING.md` for debugging queries
5. Check logs:
   - Backend: Look for "stream", "socketio", "redis"
   - Frontend: Browser console (F12)
   - Android: `adb logcat | grep Stream`

---

## Success!

If everything is working:

- ✅ Server starts with "✅ ENABLED"
- ✅ "Listen Live" button appears
- ✅ Clicking it shows player interface
- ✅ Within 30 seconds, audio starts playing
- ✅ Audio level meter moves with sound
- ✅ Latency shows < 1000ms

**Congratulations! 🎉 Live audio streaming is working!**

---

**Last Updated:** October 2024  
**Version:** 1.0  
**Support:** See documentation in `docs/` folder

