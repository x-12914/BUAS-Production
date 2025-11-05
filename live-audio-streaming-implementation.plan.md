<!-- f5b761b1-885b-4040-9487-1dccfa9b62e9 d6095029-f135-42de-b20f-f47aec139379 -->
# Live Audio Streaming - Implementation Plan

## Overview

Implement real-time audio streaming alongside existing recording system. Users can listen live (~335ms latency) while backup recordings are still created and uploaded for later playback.

## Phase 1: Backend Infrastructure (Flask-SocketIO)

### 1.1 Install Dependencies

**File: requirements.txt**

Add:

```
flask-socketio==5.3.5
python-socketio==5.10.0
```

**Note:** Starting with `threading` async mode (no eventlet needed initially) to avoid Celery conflicts. Can upgrade to eventlet/gevent later for production scaling.

### 1.2 Create Database Models

**File: app/models.py** (add at end)

```python
class LiveStreamSession(db.Model):
    id, device_id, started_by, start_time, end_time, status
    bytes_transferred, duration_seconds, listener_count
    # Tracks active streaming sessions
    
class StreamListener(db.Model):
    id, session_id, user_id, joined_at, left_at, duration_seconds
    # Audit trail of who listened when
```

### 1.3 Initialize SocketIO

**File: app/init.py**

- Import Flask-SocketIO
- Initialize: `socketio = SocketIO(app, cors_allowed_origins=..., async_mode='eventlet')`
- Configure CORS for WebSocket connections

### 1.4 Create WebSocket Event Handlers

**File: app/streaming.py** (NEW)

- `@socketio.on('request_live_stream')`: User requests to listen
  - Authenticate user (Flask-Login session)
  - Check device access permissions
  - Create LiveStreamSession record
  - Create DeviceCommand(command='stream_start')
  - Join user to Socket.IO room 'listeners_{device_id}'

- `@socketio.on('stream_ready')`: Device is ready to stream
  - Authenticate device
  - Update session status to 'active'
  - Notify listeners stream has started

- `@socketio.on('audio_chunk')`: Device sends audio data
  - Validate device authentication
  - Publish to Redis: `redis.publish(f'stream:{device_id}', chunk)`
  - Update bytes_transferred counter

- `@socketio.on('leave_stream')`: User stops listening
  - Remove from listeners room
  - Update StreamListener record
  - If no listeners remain, send 'stream_stop' to device

### 1.5 Redis Pub/Sub Distribution

**File: app/streaming.py**

- Subscribe to Redis channels: `stream:{device_id}`
- Forward audio chunks to Socket.IO rooms
- Handle multiple listeners per device efficiently

### 1.6 Modify Command Endpoint

**File: app/routes.py** - `GET /api/command`

- After checking DeviceCommand, check for LiveStreamSession
- If session with status='requested', return:
  ```json
  {"command": "stream_start", "session_id": 123}
  ```


### 1.7 Add Audit Actions

**File: app/utils/audit.py**

```python
LIVE_STREAM_STARTED = 'LIVE_STREAM_STARTED'
LIVE_STREAM_STOPPED = 'LIVE_STREAM_STOPPED'  
LIVE_STREAM_JOINED = 'LIVE_STREAM_JOINED'
LIVE_STREAM_LEFT = 'LIVE_STREAM_LEFT'
```

### 1.8 Update Server Startup

**File: server.py**

- Change from `app.run()` to `socketio.run(app, ...)`
- Use eventlet for async WebSocket support

## Phase 2: Frontend Live Audio Player

### 2.1 Install Socket.IO Client

**File: frontend/package.json**

```json
"socket.io-client": "^4.5.4"
```

### 2.2 Create Live Audio Player Component

**File: frontend/src/components/LiveAudioPlayer.js** (NEW)

- Initialize Socket.IO connection to backend
- Authenticate with user session
- Emit 'request_live_stream' with device_id
- Listen for 'audio_data' events
- Implement Web Audio API:
  ```javascript
  audioContext = new AudioContext()
  audioContext.decodeAudioData(chunk) // Decode Opus
  createBufferSource() // Queue for playback
  ```

- Buffer management (3-10 chunks queue)
- Display: connection status, latency, audio level meter
- Stop button → emit('leave_stream')

### 2.3 Create Live Stream Controls

**File: frontend/src/components/LiveStreamControls.js** (NEW)

- "Listen Live" button
- Stream status indicator (waiting, active, error)
- Listener count display
- Error handling UI

### 2.4 Integrate into Device Detail Page

**File: frontend/src/components/DeviceDetail.js**

- Add LiveStreamControls component next to recording controls
- Show "🔴 LIVE" indicator when streaming active
- Handle simultaneous recording + streaming state

### 2.5 Add WebSocket API Methods

**File: frontend/src/services/api.js**

```javascript
connectLiveStream(deviceId, onAudioData, onStatusChange)
disconnectLiveStream(deviceId)
```

### 2.6 Create CSS Styling

**Files:**

- `frontend/src/components/LiveAudioPlayer.css`
- `frontend/src/components/LiveStreamControls.css`
- Red pulsing indicator for live status
- Audio waveform visualization (optional)

## Phase 3: Android Implementation

### 3.1 Add Dependencies

**File: Bat/app/build.gradle.kts**

```kotlin
implementation("com.neovisionaries:nv-websocket-client:2.14")
implementation("org.gagravarr:vorbis-java-core:0.8") // For Opus
```

### 3.2 Create Live Audio Streamer

**File: Bat/app/src/main/java/com/animal/bat/LiveAudioStreamer.kt** (NEW ~500 lines)

Key components:

```kotlin
class LiveAudioStreamer(context: Context, deviceId: String) {
    private var audioRecord: AudioRecord? = null
    private var opusEncoder: OpusEncoder? = null
    private var websocket: WebSocket? = null
    private var fileBackup: FileOutputStream? = null
    
    fun startStreaming(sessionId: String) {
        // 1. Initialize AudioRecord (PCM capture)
        audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            44100, // Sample rate
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        )
        
        // 2. Initialize Opus encoder (32 kbps)
        opusEncoder = OpusEncoder(44100, 1, 32000)
        
        // 3. Connect WebSocket
        websocket = WebSocketFactory()
            .createSocket("ws://105.114.23.69:5000/socket.io/")
            .addHeader("Authorization", authToken)
            .connect()
        
        // 4. Emit stream_ready
        websocket.sendText("""
            {"event": "stream_ready", 
             "data": {"device_id": "$deviceId", "session_id": $sessionId}}
        """)
        
        // 5. Start capture thread
        captureThread = Thread {
            val buffer = ByteArray(4800)
            while (isStreaming) {
                val read = audioRecord.read(buffer, 0, buffer.size)
                if (read > 0) {
                    // Encode to Opus
                    val opusData = opusEncoder.encode(buffer, read)
                    
                    // Send via WebSocket
                    websocket.sendText("""
                        {"event": "audio_chunk",
                         "data": {"device_id": "$deviceId",
                                  "chunk": "${Base64.encode(opusData)}",
                                  "sequence": ${chunkNumber++}}}
                    """)
                    
                    // ALSO write to backup file
                    fileBackup?.write(buffer)
                }
            }
        }.start()
        
        // 6. Open backup recording file (M4A)
        fileBackup = createBackupRecording()
    }
    
    fun stopStreaming() {
        isStreaming = false
        audioRecord?.stop()
        audioRecord?.release()
        opusEncoder?.close()
        websocket?.disconnect()
        
        // Finalize and upload backup file
        finalizeBackupFile()
        uploadBackupFile()
    }
}
```

### 3.3 Integrate into Foreground Service

**File: Bat/app/src/main/java/com/animal/bat/PersistentForegroundService.kt**

Modify `pollServerForCommands()` (around line 2369):

```kotlin
when (command.lowercase().trim()) {
    // ... existing commands ...
    
    "stream_start" -> {
        val sessionId = jsonResponse.optInt("session_id", 0)
        Log.i(TAG, "Server triggered STREAM_START: session $sessionId")
        handler.post { startLiveStreaming(sessionId) }
    }
    
    "stream_stop" -> {
        Log.i(TAG, "Server triggered STREAM_STOP")
        handler.post { stopLiveStreaming() }
    }
}
```

Add methods:

```kotlin
private lateinit var liveAudioStreamer: LiveAudioStreamer

private fun startLiveStreaming(sessionId: Int) {
    serviceScope.launch {
        try {
            liveAudioStreamer = LiveAudioStreamer(this@PersistentForegroundService, deviceId)
            liveAudioStreamer.startStreaming(sessionId.toString())
            Log.i(TAG, "🔴 Live streaming started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start streaming: ${e.message}", e)
        }
    }
}

private fun stopLiveStreaming() {
    serviceScope.launch {
        try {
            if (::liveAudioStreamer.isInitialized) {
                liveAudioStreamer.stopStreaming()
                Log.i(TAG, "⏹️ Live streaming stopped")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping streaming: ${e.message}", e)
        }
    }
}
```

### 3.4 Add Permissions Check

**File: Bat/app/src/main/AndroidManifest.xml**

Verify these exist:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

## Phase 4: Testing & Documentation

### 4.1 Create Database Migration

**File: migrations/add_streaming_tables.sql** (NEW)

```sql
CREATE TABLE live_stream_sessions (...);
CREATE TABLE stream_listeners (...);
```

### 4.2 Testing Checklist Document

**File: docs/STREAMING_TESTING_GUIDE.md** (NEW)

- Backend: Test WebSocket connection, authentication
- Frontend: Test audio playback, buffering
- Android: Test stream start/stop, backup recording
- Integration: Test multiple listeners, network failures

### 4.3 Android Developer Guide

**File: docs/ANDROID_STREAMING_CHANGES.md** (NEW)

Plain English explanation:

- What files were added/changed
- Why each change was made
- How to test the changes
- What to watch out for
- Debugging tips

### 4.4 Monitoring Queries

**File: docs/STREAMING_MONITORING.md** (NEW)

SQL queries to monitor:

- Active stream sessions
- Bytes transferred per device
- Listener counts
- Failed streams
- Average latency

## Implementation Order

1. Backend models and SocketIO setup (Phase 1.1-1.3)
2. WebSocket event handlers (Phase 1.4-1.5)
3. Command endpoint modification (Phase 1.6)
4. Frontend Socket.IO client and player (Phase 2.1-2.2)
5. Frontend integration (Phase 2.3-2.5)
6. Android LiveAudioStreamer (Phase 3.2)
7. Android service integration (Phase 3.3)
8. Dependencies and permissions (Phase 3.1, 3.4)
9. Testing and documentation (Phase 4)

## Success Criteria

- User clicks "Listen Live" → hears audio within 5 seconds
- Latency < 500ms end-to-end
- Backup recording still created and uploaded
- Multiple listeners can join same stream
- Graceful handling of network failures
- All actions logged in audit trail

## Rollback Plan

If streaming causes issues:

1. Remove SocketIO initialization from `app/__init__.py`
2. Server reverts to standard Flask (no WebSocket)
3. Frontend: Hide "Listen Live" button
4. Android: Commands ignored (backward compatible)
5. System operates in recording-only mode (current behavior)

### To-dos

- [x] Install Flask-SocketIO dependencies and configure requirements.txt
- [x] Create LiveStreamSession and StreamListener database models
- [x] Initialize SocketIO in app/__init__.py with CORS configuration (with feature flag ENABLE_STREAMING)
- [x] Create streaming.py with WebSocket event handlers and Redis Pub/Sub
- [x] Modify /api/command endpoint to return stream commands
- [x] Add streaming audit actions to utils/audit.py
- [x] Update server.py to use socketio.run() instead of app.run() (conditional based on feature flag)
- [x] Install socket.io-client in frontend package.json
- [x] Create LiveAudioPlayer component with Web Audio API
- [x] Create LiveStreamControls component with UI
- [x] Integrate live streaming into DeviceDetail page
- [x] Add WebSocket methods to services/api.js (Not needed - handled directly in components)
- [x] Create CSS styling for live streaming components (LiveAudioPlayer.css + LiveStreamControls.css)
- [x] Add Socket.IO dependency to Bat/app/build.gradle.kts (Used AAC encoding instead of Opus as agreed)
- [x] Create LiveAudioStreamer.kt with AudioRecord, AAC encoding, WebSocket streaming
- [x] Integrate streaming into PersistentForegroundService.kt (added stream_start/stream_stop commands + methods)
- [x] Verify required permissions in AndroidManifest.xml (RECORD_AUDIO and INTERNET already present)
- [x] Create database migration approach (documented via db.create_all() in quick start guide)
- [x] Create testing guide and checklist (STREAMING_TESTING_GUIDE.md with 14 test cases)
- [x] Create plain-English guide explaining Android changes for developer (ANDROID_STREAMING_CHANGES.md)
- [x] Create monitoring queries and troubleshooting guide (STREAMING_MONITORING.md with SQL queries)

