import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO

db = SQLAlchemy()
socketio = None  # Will be initialized in create_app()

def create_app():
    app = Flask(__name__)
    
    # Configuration for RBAC system
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Session configuration for Flask-Login
    app.config['SESSION_TYPE'] = 'sqlalchemy'
    app.config['SESSION_PERMANENT'] = False
    app.config['SESSION_USE_SIGNER'] = True
    app.config['SESSION_KEY_PREFIX'] = 'buas:'
    app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 30 minutes
    
    # Security headers - CRITICAL for cross-origin session cookies
    app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'  # More permissive for HTTP
    app.config['SESSION_COOKIE_DOMAIN'] = None  # Let Flask handle this automatically

    # CORS configuration for dashboard integration
    # CRITICAL: When using credentials=True, CANNOT use wildcard origins
    CORS(app,
         origins=[
             "http://localhost:3000",              # React development (legacy)
             "http://localhost:4000",              # React development (current)
             "http://127.0.0.1:3000",              # Alternative localhost (legacy)
             "http://127.0.0.1:4000",              # Alternative localhost (current)
             "http://105.114.25.157:3000",        # VPS frontend (legacy)
             "http://105.114.25.157:4000",        # VPS frontend (current)
             "http://105.114.25.157",             # VPS base (no port) - THIS IS THE ACTIVE ONE
             "https://105.114.25.157:3000",       # VPS frontend HTTPS (legacy)
             "https://105.114.25.157:4000",       # VPS frontend HTTPS (current)
             "https://105.114.25.157",            # VPS HTTPS (no port)
         ],
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
    # CRITICAL: Must match Flask-CORS origins when using withCredentials
    # Wildcard "*" is forbidden by browsers when credentials are used
    global socketio
    socketio = SocketIO(
        app,
        cors_allowed_origins=[
            "http://localhost:3000",
            "http://localhost:4000",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:4000",
            "http://105.114.25.157:3000",
            "http://105.114.25.157:4000",
            "http://105.114.25.157",  # Active production origin
            "https://105.114.25.157:3000",
            "https://105.114.25.157:4000",
            "https://105.114.25.157"
        ],
        async_mode='eventlet',
        logger=True,
        engineio_logger=True,
        ping_timeout=60,
        ping_interval=25,
        manage_session=False,  # Let Flask-Login handle all session management
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
        app.logger.info("✅ Streaming WebSocket handlers registered")

    return app
