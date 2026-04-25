import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO

db = SQLAlchemy()
socketio = None  # Will be initialized in create_app()


def _env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _env_int(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default

def create_app():
    app = Flask(__name__)
    
    # Configuration for RBAC system
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Session configuration for Flask-Login
    app.config['SESSION_TYPE'] = 'sqlalchemy'
    app.config['SESSION_PERMANENT'] = False
    app.config['SESSION_USE_SIGNER'] = True
    app.config['SESSION_KEY_PREFIX'] = 'buas:'
    app.config['PERMANENT_SESSION_LIFETIME'] = _env_int('PERMANENT_SESSION_LIFETIME', 1800)
    app.config['SESSION_COOKIE_NAME'] = os.environ.get('SESSION_COOKIE_NAME', 'buas_session')
    
    # Security cookie configuration (single source of truth: environment)
    # Keep SESSION_COOKIE_SECURE=false until HTTPS is enabled in production.
    session_cookie_samesite = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
    if session_cookie_samesite not in {'Lax', 'Strict', 'None'}:
        session_cookie_samesite = 'Lax'

    session_cookie_domain = os.environ.get('SESSION_COOKIE_DOMAIN')
    if session_cookie_domain == '':
        session_cookie_domain = None

    app.config['SESSION_COOKIE_SECURE'] = _env_bool('SESSION_COOKIE_SECURE', False)
    app.config['SESSION_COOKIE_HTTPONLY'] = _env_bool('SESSION_COOKIE_HTTPONLY', True)
    app.config['SESSION_COOKIE_SAMESITE'] = session_cookie_samesite
    app.config['SESSION_COOKIE_DOMAIN'] = session_cookie_domain

    # CORS configuration for dashboard integration
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:4000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4000",
        # Add any additional origins from environment variable
    ]
    
    env_origins = os.environ.get('ALLOWED_ORIGINS')
    if env_origins:
        allowed_origins.extend([origin.strip() for origin in env_origins.split(',')])

    CORS(app,
         origins=allowed_origins,
         allow_headers=[
             "Content-Type", 
             "Authorization", 
             "Accept", 
             "X-Requested-With",
             "Cookie",
             "Set-Cookie"
         ],
         expose_headers=[
             "Set-Cookie",
             "Content-Type"
         ],
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         supports_credentials=True  # Required for session cookies
    )

    base_dir = os.path.abspath(os.path.dirname(__file__))
    upload_folder = os.path.join(base_dir, '..', 'uploads')  # uploads folder in BUAS root
    database_path = os.path.join(base_dir, '..', 'uploads.db')  # Database in BUAS root

    app.config['UPLOAD_FOLDER'] = upload_folder
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{database_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
    
    # Ensure upload directory exists
    os.makedirs(upload_folder, exist_ok=True)

    # Initialize database
    db.init_app(app)
    
    # Determine whether streaming is enabled (used for Socket.IO config)
    streaming_enabled = os.environ.get('ENABLE_STREAMING', 'false').lower() == 'true'

    # Build Redis message queue URL for Socket.IO when streaming is enabled and
    # no explicit queue URL is provided. Multi-worker Gunicorn deployments need
    # this so that Engine.IO session state is shared across workers.
    socketio_message_queue = None
    if streaming_enabled:
        socketio_message_queue = os.environ.get('SOCKETIO_MESSAGE_QUEUE')
        if not socketio_message_queue:
            redis_host = os.environ.get('REDIS_HOST', 'localhost')
            redis_port = int(os.environ.get('REDIS_PORT', 6379))
            redis_password = os.environ.get('REDIS_PASSWORD')
            redis_db = os.environ.get('SOCKETIO_MESSAGE_QUEUE_DB', '2')

            if redis_password:
                socketio_message_queue = f"redis://:{redis_password}@{redis_host}:{redis_port}/{redis_db}"
            else:
                socketio_message_queue = f"redis://{redis_host}:{redis_port}/{redis_db}"

    # Initialize Socket.IO with CORS settings
    global socketio
    socketio = SocketIO(
        app,
        cors_allowed_origins=allowed_origins,
        async_mode='eventlet',
        logger=True,
        engineio_logger=True,
        ping_timeout=60,
        ping_interval=25,
        cors_credentials=True,  # Explicitly enable credentials for cookies
        message_queue=socketio_message_queue
    )
    
    # Initialize Flask-Login
    from app.auth import init_auth
    init_auth(app)
    
    # Android CORS fix: Allow requests without Origin header (native mobile apps)
    # This works alongside flask-cors for browser requests
    @app.after_request
    def after_request_android_cors(response):
        from flask import request
        
        # If no Origin header (Android/native apps), add permissive CORS
        if not request.headers.get('Origin'):
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept, X-Requested-With'
            response.headers['Access-Control-Max-Age'] = '3600'
        
        return response

    # Create tables if they don't exist
    with app.app_context():
        db.create_all()
        
        # Safe migration for Hot Mic status field (SQLite doesn't use standard migrations here)
        try:
            from sqlalchemy import text
            with db.engine.connect() as conn:
                # Check columns in device_info
                result = conn.execute(text("PRAGMA table_info(device_info)"))
                columns = [row[1] for row in result.fetchall()]
                
                if 'fallback_active' not in columns:
                    app.logger.info("Migrating database: Adding fallback_active column to device_info table")
                    conn.execute(text("ALTER TABLE device_info ADD COLUMN fallback_active BOOLEAN DEFAULT 0"))
                    conn.commit()
                    app.logger.info("Successfully added fallback_active column")
        except Exception as e:
            app.logger.error(f"Migration error: {e}")

    # Register blueprints
    from .routes import routes
    app.register_blueprint(routes)
    
    # Register authentication blueprint
    from app.auth.routes import auth_bp
    app.register_blueprint(auth_bp)
    
    # Register user management blueprint (Segment 5)
    from app.user_routes import user_mgmt_bp
    app.register_blueprint(user_mgmt_bp)
    
    # Register streaming handlers if enabled
    if socketio:
        from app import streaming
        streaming.init_streaming(app)  # Pass app for Flask context
        app.logger.info("✅ Streaming WebSocket handlers registered")

    return app
