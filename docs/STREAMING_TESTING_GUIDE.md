# Live Audio Streaming - Testing Guide

## Pre-Test Setup

### 1. Backend Prerequisites

```bash
# Install dependencies
cd /path/to/BUAS
pip install flask-socketio==5.3.5 python-socketio==5.10.0

# Ensure Redis is running
redis-cli ping  # Should return "PONG"

# Enable streaming
export ENABLE_STREAMING=true

# Start server
python server.py
```

**Expected Output:**
```
Starting Flask server...
Celery available: True
Live streaming: ✅ ENABLED
Starting with SocketIO support for live streaming...
✅ Live streaming enabled - SocketIO initialized
✅ Streaming WebSocket handlers registered
```

### 2. Frontend Prerequisites

```bash
cd frontend
npm install socket.io-client@^4.5.4
npm start
```

**Expected:** Frontend starts on port 4000

### 3. Database Migration

```bash
# Create streaming tables
python -c "from app import create_app, db; app = create_app(); app.app_context().push(); db.create_all()"
```

**Verify tables created:**
```bash
sqlite3 uploads.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%stream%';"
```

**Expected output:**
```
live_stream_sessions
stream_listeners
```

---

## Test Suite

### Test 1: Backend WebSocket Connection

**Objective:** Verify Socket.IO server is accessible

**Steps:**
1. Open browser console
2. Paste this code:
```javascript
const socket = io('http://localhost:5000/stream', { 
  withCredentials: true 
});
socket.on('connect', () => console.log('✅ Connected!'));
socket.on('connect_error', (err) => console.log('❌ Error:', err));
```

**Expected Result:**
- Console shows: `✅ Connected!`
- Server logs show: `User <username> connected to streaming namespace`

**If Failed:**
- Check CORS origins in `app/__init__.py`
- Verify `ENABLE_STREAMING=true`
- Check firewall allows port 5000

---

### Test 2: User Authentication & Permissions

**Objective:** Verify only authenticated users with device access can stream

**Test 2a: Unauthenticated User**

**Steps:**
1. Open browser in incognito mode
2. Connect to Socket.IO (code from Test 1)

**Expected Result:**
- Connection rejected
- Console shows disconnect message

---

**Test 2b: Authenticated User Without Device Access**

**Prerequisites:**
- User1: Has access to Device A only
- Device B exists but not assigned to User1

**Steps:**
1. Login as User1
2. Try to request stream from Device B:
```javascript
socket.emit('request_live_stream', { device_id: 'deviceB' });
```

**Expected Result:**
- Event `stream_error` received
- Message: "Access denied to this device"
- Audit log entry: `PERMISSION_DENIED`

**Verify:**
```bash
sqlite3 uploads.db "SELECT * FROM audit_logs WHERE action='PERMISSION_DENIED' ORDER BY timestamp DESC LIMIT 1;"
```

---

### Test 3: Stream Request Flow

**Objective:** Test complete stream initialization

**Steps:**
1. Login to dashboard
2. Navigate to device detail page
3. Click "Listen Live" button
4. Wait 5 seconds

**Expected Frontend Behavior:**
- Button changes to player component
- Status shows: "Waiting for device to start streaming..."
- No errors in console

**Expected Backend Logs:**
```
Stream session X created for device Y by user Z
```

**Verify Database:**
```bash
sqlite3 uploads.db "SELECT * FROM live_stream_sessions WHERE status='requested';"
```

**Expected:** One row with status='requested'

---

### Test 4: Android Device Response

**Objective:** Verify device picks up stream command and starts streaming

**Prerequisites:**
- Test 3 completed (session created)
- Android device polling server

**Steps:**
1. Ensure device is polling: Check backend logs for command polls
2. Wait for next poll (max 30 seconds)
3. Watch device logs:
```bash
adb logcat | grep "LiveAudioStreamer\|PersistentService"
```

**Expected Device Logs:**
```
Server command received: 'stream_start'
Server triggered STREAM_START: session 123
🔴 Starting live audio streaming - session: 123
✅ WebSocket connected
✅ AudioRecord initialized - buffer: XXXX bytes
✅ AAC encoder initialized - 64000 bps
✅ Backup recording: stream_backup_xxx.pcm
📡 Capture thread started
🔧 Encoder thread started
✅ Emitted stream_ready
✅ Live streaming started successfully
```

**Expected Backend Logs:**
```
Device deviceX connected to streaming namespace
Stream 123 for device deviceX is now active
Redis subscriber started for device deviceX
```

**Verify Database:**
```bash
sqlite3 uploads.db "SELECT status FROM live_stream_sessions WHERE id=123;"
```

**Expected:** status='active'

**If Device Doesn't Start:**
- Check device polling: Should poll every 30 seconds
- Verify device_id matches between dashboard and Android
- Check no recording is active (conflict)

---

### Test 5: Audio Data Transmission

**Objective:** Verify audio chunks are being sent and received

**Steps:**
1. Continue from Test 4 (streaming active)
2. Watch device logs for chunk transmission:
```bash
adb logcat | grep "Streamed"
```

**Expected:** Every 10 seconds (~100 chunks):
```
📊 Streamed 100 chunks, 78 KB
📊 Streamed 200 chunks, 156 KB
📊 Streamed 300 chunks, 234 KB
```

**Backend Verification:**
3. Check Redis activity:
```bash
redis-cli monitor | grep "stream:"
```

**Expected:**
```
"PUBLISH" "stream:deviceX" "{\"device_id\":\"deviceX\",\"chunk\":\"base64data...\",\"sequence\":100}"
```

4. Check frontend receives data (browser console):
```javascript
socket.on('audio_data', (data) => {
  console.log('Chunk received:', data.sequence);
});
```

**Expected:** Sequence numbers incrementing

**Verify Database Bytes:**
```bash
sqlite3 uploads.db "SELECT bytes_transferred FROM live_stream_sessions WHERE id=123;"
```

**Expected:** Number increasing over time

---

### Test 6: Frontend Audio Playback

**Objective:** Verify audio is actually heard by user

**Steps:**
1. Continue from Test 5
2. Make noise near Android device (speak, play music)
3. Listen on computer speakers

**Expected:**
- Audio heard within 300-500ms
- No distortion or dropouts
- Audio level meter shows movement
- Latency indicator shows < 1000ms

**Troubleshooting Poor Quality:**
- Check network latency: `ping` to server
- Monitor queue size in player component
- Check CPU usage on backend
- Try reducing concurrent listeners

---

### Test 7: Multiple Listeners

**Objective:** Verify multiple users can listen to same stream

**Steps:**
1. User1: Start listening (Test 3-6)
2. User2: Login in different browser
3. User2: Navigate to same device
4. User2: Click "Listen Live"

**Expected User2 Behavior:**
- Joins existing stream immediately (no 30-second wait)
- Event: `stream_joined`
- Hears same audio as User1
- Listener count shows 2

**Expected Backend:**
```
User user2 joined existing stream for deviceX
```

**Verify Database:**
```bash
sqlite3 uploads.db "SELECT * FROM stream_listeners WHERE session_id=123;"
```

**Expected:** Two rows

```bash
sqlite3 uploads.db "SELECT listener_count FROM live_stream_sessions WHERE id=123;"
```

**Expected:** 2

---

### Test 8: User Stops Listening

**Objective:** Verify graceful listener removal

**Steps:**
1. Continue from Test 7 (2 listeners active)
2. User2: Click "Stop Listening"

**Expected User2:**
- Player component closes
- Socket disconnects gracefully

**Expected Backend:**
```
User user2 left stream for deviceX
```

**Verify Database:**
```bash
sqlite3 uploads.db "SELECT left_at, duration_seconds FROM stream_listeners WHERE user_id=(SELECT id FROM users WHERE username='user2') AND session_id=123;"
```

**Expected:**
- left_at: timestamp
- duration_seconds: time listened

```bash
sqlite3 uploads.db "SELECT listener_count FROM live_stream_sessions WHERE id=123;"
```

**Expected:** 1 (User1 still listening)

---

### Test 9: Last Listener Leaves (Auto-Stop)

**Objective:** Verify stream stops when no listeners remain

**Steps:**
1. Continue from Test 8 (User1 still listening)
2. User1: Click "Stop Listening"

**Expected Frontend:**
- Player closes
- Connection terminated

**Expected Backend:**
```
User user1 left stream for deviceX
No more listeners for deviceX, stopping stream
```

**Expected Device Logs:**
```
Server requested stream stop
⏹️ Stopping live audio streaming
✅ Backup recording: stream_backup_xxx.pcm
Backup file size: 12345678 bytes
✅ Live streaming stopped
```

**Verify Database:**
```bash
sqlite3 uploads.db "SELECT status, end_time, duration_seconds, listener_count FROM live_stream_sessions WHERE id=123;"
```

**Expected:**
- status: 'stopped'
- end_time: timestamp
- duration_seconds: total stream duration
- listener_count: 0

---

### Test 10: Network Failure Recovery

**Objective:** Verify graceful handling of disconnections

**Test 10a: Device Loses Connection**

**Steps:**
1. Start streaming (Tests 3-4)
2. On device: `adb shell svc wifi disable`
3. Wait 10 seconds
4. On device: `adb shell svc wifi enable`

**Expected:**
- Device logs: "⚠️ WebSocket disconnected"
- Socket.IO attempts reconnection
- Stream continues after reconnection
- OR stream ends gracefully if timeout

---

**Test 10b: Server Restart During Stream**

**Steps:**
1. Start streaming
2. Restart backend: `Ctrl+C`, then `python server.py`
3. Observe behavior

**Expected:**
- Frontend shows error: "Disconnected from streaming server"
- Device detects disconnection
- Users can retry streaming after server restart

---

### Test 11: Concurrent Recording Conflict

**Objective:** Verify system prevents mic conflict

**Steps:**
1. Device: Start regular recording via dashboard
2. Device: Try to start streaming

**Expected:**
- Streaming fails to initialize
- Error: "Failed to initialize AudioRecord"
- Regular recording continues unaffected

**Alternative Test:**
1. Device: Start streaming
2. Dashboard: Try to start recording

**Expected:**
- Recording command queued but not executed
- Stream continues
- Recording starts only after stream stops

---

### Test 12: Audit Logging

**Objective:** Verify all streaming actions are audited

**Steps:**
1. Perform Tests 3-9 (complete stream lifecycle)
2. Query audit logs:
```bash
sqlite3 uploads.db "SELECT action, username, resource_id, success, timestamp FROM audit_logs WHERE action LIKE '%STREAM%' ORDER BY timestamp DESC;"
```

**Expected Entries:**
- `LIVE_STREAM_STARTED` - User initiating stream
- `LIVE_STREAM_JOINED` - User joining existing stream
- `LIVE_STREAM_LEFT` - User leaving stream
- `LIVE_STREAM_STOPPED` - Stream ended
- `LIVE_STREAM_REQUEST_FAILED` - Any failures

**Verify IP Logging:**
```bash
sqlite3 uploads.db "SELECT ip_address FROM audit_logs WHERE action='LIVE_STREAM_STARTED' LIMIT 1;"
```

---

### Test 13: Performance Under Load

**Objective:** Test system with multiple simultaneous streams

**Setup:**
- 3 Android devices
- 5 dashboard users

**Steps:**
1. Start streaming on Device A
2. Users 1, 2, 3 listen to Device A
3. Start streaming on Device B
4. Users 4, 5 listen to Device B
5. Start streaming on Device C
6. User 1 switches to Device C

**Monitor:**
- Backend CPU usage
- Redis memory usage
- Network bandwidth
- Audio latency

**Expected:**
- All streams functional
- Latency < 1000ms for all listeners
- No dropped connections
- CPU < 80%

**If Performance Degrades:**
- Consider upgrading to `eventlet` async mode
- Scale Redis horizontally
- Use load balancer
- Reduce audio bitrate

---

### Test 14: Security Testing

**Test 14a: Device Impersonation**

**Steps:**
1. Try to connect to `/device` namespace without valid android_id
2. Try with wrong android_id

**Expected:**
- Connection rejected
- No stream data transmitted

---

**Test 14b: Cross-Device Access**

**Steps:**
1. User1: Access to Device A only
2. User1: Try to listen to Device B's active stream

**Expected:**
- Access denied
- Audit log: `PERMISSION_DENIED`

---

## Automated Test Script

```bash
#!/bin/bash
# test_streaming.sh

echo "=== Live Streaming Test Suite ==="

# Test 1: Check streaming enabled
echo "Test 1: Checking if streaming enabled..."
curl -s http://localhost:5000/ | grep -q "SocketIO"
if [ $? -eq 0 ]; then
  echo "✅ Streaming enabled"
else
  echo "❌ Streaming not enabled"
  exit 1
fi

# Test 2: Check Redis
echo "Test 2: Checking Redis..."
redis-cli ping > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Redis running"
else
  echo "❌ Redis not running"
  exit 1
fi

# Test 3: Check database tables
echo "Test 3: Checking database tables..."
sqlite3 uploads.db "SELECT COUNT(*) FROM sqlite_master WHERE name='live_stream_sessions';" | grep -q "1"
if [ $? -eq 0 ]; then
  echo "✅ Database tables exist"
else
  echo "❌ Database tables missing"
  exit 1
fi

echo "=== All automated tests passed ==="
```

---

## Test Results Template

| Test | Status | Notes | Tester | Date |
|------|--------|-------|--------|------|
| 1. Backend WebSocket | ⬜ | | | |
| 2a. Unauthenticated User | ⬜ | | | |
| 2b. Unauthorized Device | ⬜ | | | |
| 3. Stream Request | ⬜ | | | |
| 4. Device Response | ⬜ | | | |
| 5. Audio Transmission | ⬜ | | | |
| 6. Audio Playback | ⬜ | | | |
| 7. Multiple Listeners | ⬜ | | | |
| 8. User Stops Listening | ⬜ | | | |
| 9. Last Listener Leaves | ⬜ | | | |
| 10a. Device Disconnection | ⬜ | | | |
| 10b. Server Restart | ⬜ | | | |
| 11. Recording Conflict | ⬜ | | | |
| 12. Audit Logging | ⬜ | | | |
| 13. Performance Load | ⬜ | | | |
| 14a. Device Impersonation | ⬜ | | | |
| 14b. Cross-Device Access | ⬜ | | | |

**Legend:** ✅ Passed | ❌ Failed | ⚠️ Partial | ⬜ Not Tested

---

## Troubleshooting Guide

### Common Issues

**Problem:** "Streaming not enabled" error

**Solution:**
```bash
export ENABLE_STREAMING=true
python server.py
```

---

**Problem:** Device doesn't start streaming

**Debug Steps:**
1. Check device logs: `adb logcat | grep stream_start`
2. Verify command polling active
3. Check for recording conflict
4. Verify permissions granted

---

**Problem:** No audio heard

**Debug Steps:**
1. Check browser console for errors
2. Verify Web Audio API supported
3. Test with different browser
4. Check speaker/volume settings
5. Monitor network for audio_data events

---

**Problem:** High latency (> 1 second)

**Causes:**
- Network congestion
- Too many listeners
- Server CPU overload
- Client buffering too much

**Solutions:**
- Reduce listener count
- Upgrade server resources
- Switch to `eventlet` async mode
- Adjust buffer size in frontend

---

## Success Criteria

All tests pass with these metrics:

- ✅ End-to-end latency < 500ms (target: 335ms)
- ✅ Audio quality clear and intelligible
- ✅ No dropped connections under normal load
- ✅ All actions audited correctly
- ✅ Graceful error handling
- ✅ Multiple listeners supported (≥5 per device)
- ✅ Security: unauthorized access blocked
- ✅ Backup recording created successfully

---

## Next Steps After Testing

1. **Document any failures** with reproduction steps
2. **Performance baseline:** Record metrics for future comparison
3. **User acceptance testing:** Have real users test the feature
4. **Production deployment:** Gradual rollout with monitoring
5. **Create monitoring dashboard:** Track active streams, latency, errors

---

## Contact

For questions about testing, contact the development team or refer to:
- `ANDROID_STREAMING_CHANGES.md` - Android implementation details
- `STREAMING_MONITORING.md` - Production monitoring queries

