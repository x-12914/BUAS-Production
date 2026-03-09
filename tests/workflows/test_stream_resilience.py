import os
import threading
import time
from urllib.parse import quote_plus

import pytest
import socketio


@pytest.mark.heavy
def test_stream_socket_connect_disconnect_reconnect_cycle():
    stream_url = os.getenv("TEST_STREAM_URL")
    android_id = os.getenv("TEST_STREAM_ANDROID_ID")
    device_token = os.getenv("TEST_STREAM_DEVICE_TOKEN")

    if not stream_url or not android_id or not device_token:
        pytest.skip("Set TEST_STREAM_URL, TEST_STREAM_ANDROID_ID, TEST_STREAM_DEVICE_TOKEN for stream test")

    connect_events = []
    disconnected = threading.Event()

    sio = socketio.Client(reconnection=True, logger=False, engineio_logger=False)

    @sio.event(namespace="/device")
    def connect():
        connect_events.append(time.time())

    @sio.event(namespace="/device")
    def disconnect():
        disconnected.set()

    query = f"android_id={quote_plus(android_id)}&device_token={quote_plus(device_token)}"
    url_with_query = f"{stream_url.rstrip('/')}?{query}"

    sio.connect(url_with_query, transports=["websocket"], namespaces=["/device"], socketio_path="socket.io", headers=None, auth=None, wait_timeout=10)
    time.sleep(1.5)
    assert len(connect_events) >= 1, "Expected initial stream socket connection"

    sio.disconnect()
    disconnected.wait(timeout=5)

    sio.connect(url_with_query, transports=["websocket"], namespaces=["/device"], socketio_path="socket.io", headers=None, auth=None, wait_timeout=10)
    time.sleep(1.5)
    assert len(connect_events) >= 2, "Expected reconnect cycle to establish a second connection"

    sio.disconnect()
