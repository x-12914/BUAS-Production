import requests
import socketio
import sys
import time
import json

def test_http_polling(url_base):
    print(f"\n--- Testing HTTP Polling on {url_base} ---")
    url = f"{url_base}/socket.io/?EIO=4&transport=polling"
    try:
        response = requests.get(url, timeout=5)
        print(f"GET Status Code: {response.status_code}")
        print(f"GET Response Headers: {dict(response.headers)}")
        print(f"GET Response Text: {response.text[:200]}")
        
        # If the GET request succeeded, try extracting sid and doing a POST
        if response.status_code == 200:
            try:
                # The response text usually starts with something like '0{"sid":"..."}'
                # Remove the first character (the message type '0' for OPEN)
                data_str = response.text[1:]
                data = json.loads(data_str)
                sid = data.get('sid')
                if sid:
                    print(f"\nGot session ID (sid): {sid}")
                    post_url = f"{url_base}/socket.io/?EIO=4&transport=polling&sid={sid}"
                    print(f"Testing POST to {post_url}")
                    post_response = requests.post(post_url, data="40", timeout=5)
                    print(f"POST Status Code: {post_response.status_code}")
                    print(f"POST Response Text: {post_response.text}")
            except Exception as e:
                print(f"Error parsing connection response for sid: {e}")
    except Exception as e:
        print(f"HTTP GET Error: {e}")

def test_socketio_client(url_base):
    print(f"\n--- Testing Socket.IO Connection to {url_base} ---")
    sio = socketio.Client(logger=True, engineio_logger=True)

    @sio.event
    def connect():
        print("✅ CONNECTED successfully to Socket.IO server!")

    @sio.event
    def connect_error(data):
        print(f"❌ CONNECTION ERROR: {data}")

    @sio.event
    def disconnect():
        print("⚠️ DISCONNECTED from server")

    try:
        print("Attempting to connect with websocket & polling...")
        sio.connect(url_base, transports=['websocket', 'polling'])
        time.sleep(2)
        if sio.connected:
            sio.disconnect()
    except Exception as e:
        print(f"Socket.IO Exception: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        test_http_polling(target)
        test_socketio_client(target)
    else:
        print("Testing local Flask (Backend direct)")
        test_http_polling("http://127.0.0.1:5000")
        test_socketio_client("http://127.0.0.1:5000")

        print("\n\nTesting Nginx (Public IP)")
        test_http_polling("http://105.114.25.157")
        test_socketio_client("http://105.114.25.157")
