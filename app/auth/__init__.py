"""
Authentication Module for BUAS RBAC System
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 2
"""

from flask_login import LoginManager
from flask import current_app

login_manager = LoginManager()

def init_auth(app):
    """Initialize authentication system"""
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.session_protection = 'strong'
    
    # Configure session settings - Override app config for Flask-Login specific settings
    app.config.update(
        SESSION_COOKIE_SECURE=False,  # Set to True in production with HTTPS
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',  # More permissive for cross-origin on HTTP
        PERMANENT_SESSION_LIFETIME=1800,  # 30 minutes
        SESSION_COOKIE_NAME='buas_session',  # Explicit session cookie name
    )
    
    @login_manager.user_loader
    def load_user(user_id):
        from app.models import User
        try:
            return User.query.get(int(user_id))
        except Exception:
            return None
    
    @login_manager.unauthorized_handler
    def unauthorized():
        from flask import jsonify, request
        # Skip authentication for OPTIONS requests to allow CORS preflight
        if request.method == "OPTIONS":
            return None
        if request.is_json:
            return jsonify({'error': 'Authentication required'}), 401
        else:
            return jsonify({'error': 'Authentication required', 'redirect': '/login'}), 401
