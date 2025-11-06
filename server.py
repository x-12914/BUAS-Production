import os

# CRITICAL: Eventlet monkey patching MUST be done before any other imports
# This is required when using Gunicorn with eventlet workers
try:
    import eventlet
    eventlet.monkey_patch()
except ImportError:
    print("Warning: eventlet not installed. Install it for production: pip install eventlet")

from app import create_app, socketio

# Try to import celery, but don't fail if it's not available
try:
    from app.celery_app import make_celery

    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False

app = create_app()

# Only initialize celery if it's available and Redis is running
if CELERY_AVAILABLE:
    try:
        celery = make_celery(app)
    except Exception as e:
        print(f"Warning: Celery initialization failed: {e}")
        print("Continuing without Celery...")
        celery = None
else:
    celery = None

# Only run this block if the script is run directly (not by Gunicorn)
if __name__ == "__main__":
    print("Starting Flask server...")
    print(f"Celery available: {CELERY_AVAILABLE}")
    
    # Check if streaming is enabled
    streaming_enabled = os.environ.get('ENABLE_STREAMING', 'false').lower() == 'true'
    print(f"Live streaming: {'✅ ENABLED' if streaming_enabled else '⏸️ DISABLED'}")

    # Run server (with or without SocketIO depending on streaming flag)
    if streaming_enabled and socketio:
        print("Starting with SocketIO support for live streaming...")
        socketio.run(
            app,
            host='0.0.0.0',
            port=5000,
            debug=False,
            use_reloader=False
        )
    else:
        print("Starting standard Flask server (no streaming)...")
        app.run(
            host='0.0.0.0',
            port=5000,
            debug=False,
            use_reloader=False
        )
