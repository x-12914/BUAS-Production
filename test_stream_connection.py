import socketio
import time
import argparse
import sys

# Change this to your VPS IP if running remotely
DEFAULT_URL = "http://105.114.25.157"

def test_device_connection(target_url, identifier, token):
    """Test device connection to the /device namespace"""
    # Initialize Socket.IO client
    sio = socketio.Client(logger=True, engineio_logger=True)
    
    # URL parameters exactly like the Android app
    # Using the new params supported by the fix (id, device_id, or android_id)
    params = f"device_id={identifier}&device_token={token}"
    full_url = f"{target_url}/device?{params}"
    
    print(f"\n🚀 Testing connection to: {full_url}")
    print(f"--- Configuration ---")
    print(f"Target URL: {target_url}")
    print(f"Identifier: {identifier}")
    print(f"Token:      {token}")
    print(f"---------------------\n")

    @sio.on('connect', namespace='/device')
    def on_connect():
        print("✅ SUCCESS: Connected to /device namespace!")
        print(f"SID: {sio.sid}")

    @sio.on('connect_error', namespace='/device')
    def on_connect_error(data):
        print(f"❌ CONNECTION ERROR: {data}")
        print("\nPossible reasons:")
        print("1. Server is in 'strict' mode and token is wrong.")
        print("2. Device ID is not registered in the database.")
        print("3. Nginx is blocking the WebSocket connection.")

    @sio.on('disconnect', namespace='/device')
    def on_disconnect():
        print("🔌 Disconnected from server.")

    @sio.on('message', namespace='/device')
    def on_message(data):
        print(f"📩 Received message: {data}")

    @sio.on('live_stream_request', namespace='/device')
    def on_stream_request(data):
        print(f"🎬 RECEIVED COMMAND: Start Live Stream!")
        print(f"Payload: {data}")
        print("Now sending 'stream_ready'...")
        sio.emit('stream_ready', {
            'device_id': identifier,
            'session_id': data.get('session_id')
        }, namespace='/device')

    try:
        # Standard Socket.IO connection path
        sio.connect(target_url, namespaces=['/device'], 
                    socketio_path='/socket.io',
                    transports=['polling', 'websocket'])
        
        print("\nWaiting for commands from dashboard... (Press Ctrl+C to stop)")
        while True:
            time.sleep(1)
            
    except Exception as e:
        print(f"💥 Failed to run test: {e}")
    finally:
        sio.disconnect()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test BUAS Streaming Connection")
    parser.add_argument("--url", default=DEFAULT_URL, help="Server URL")
    parser.add_argument("--id", default="samsungSM-S908U1", help="Device Identifier")
    parser.add_argument("--token", default="bat-device-samsungSM-S908U1", help="Security Token")
    
    args = parser.parse_args()
    
    try:
        import socketio
    except ImportError:
        print("❌ Error: 'python-socketio[client]' is not installed.")
        print("Run: pip install \"python-socketio[client]\"")
        sys.exit(1)
        
    test_device_connection(args.url, args.id, args.token)
