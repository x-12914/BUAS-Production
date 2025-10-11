from app import create_app
from flask_cors import CORS

# Try to import celery, but don't fail if it's not available
try:
    from app.celery_app import make_celery
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False

app = create_app()

# ✅ Allow frontend on 105.114.23.69 to make API requests with cookies
CORS(app, supports_credentials=True, origins=[
    "http://105.114.23.69",       # frontend on port 80
    "http://105.114.23.69:5000",  # optional: backend direct access
    "http://localhost:3000"       # optional: local dev
])

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

    # Run Flask development server
    app.run(
        host='0.0.0.0',  # Bind to all interfaces for VPS access
        port=5000,       # Flask server port
        debug=False,
        use_reloader=False
    )
