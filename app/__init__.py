import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS

db = SQLAlchemy()

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
             "http://105.114.23.69:3000",        # VPS frontend (legacy)
             "http://105.114.23.69:4000",        # VPS frontend (current)
             "http://105.114.23.69",             # VPS base (no port) - THIS IS THE ACTIVE ONE
             "https://105.114.23.69:3000",       # VPS frontend HTTPS (legacy)
             "https://105.114.23.69:4000",       # VPS frontend HTTPS (current)
             "https://105.114.23.69",            # VPS HTTPS (no port)
             "http://105.114.23.69:5000",
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
    
    # Initialize Flask-Login
    from app.auth import init_auth
    init_auth(app)

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

    return app
