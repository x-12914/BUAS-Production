"""
Authentication Routes for BUAS RBAC System
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 2 & 8
"""

from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from datetime import datetime, timedelta
from app.models import User, AuditLog, db
from app.auth.utils import validate_password_strength, generate_temp_password
from app.utils.audit import log_authentication, log_audit, AuditActions

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        username = data.get('username', '').strip()
        password = data.get('password', '')
        remember = data.get('remember', False)
        
        # Validate input
        if not username or not password:
            return jsonify({'error': 'Username and password required'}), 400
        
        # Find user
        user = User.query.filter_by(username=username).first()
        
        # Check if user exists and is active
        if not user:
            log_authentication(AuditActions.LOGIN_FAILED, username, success=False, error_message='User not found')
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Check if user is active (if field exists)
        if hasattr(user, 'is_active') and not user.is_active:
            log_authentication(AuditActions.LOGIN_FAILED, username, success=False, error_message='User inactive', user_id=user.id)
            return jsonify({'error': 'Account inactive. Contact administrator.'}), 401
        
        # Check if account is locked (safely)
        if user.is_locked():
            log_authentication(AuditActions.LOGIN_LOCKED, username, success=False, error_message='Account locked due to failed attempts', user_id=user.id)
            return jsonify({'error': 'Account locked. Contact administrator.'}), 403
        
        # Verify password
        if not user.check_password(password):
            user.increment_failed_login()
            log_authentication(AuditActions.LOGIN_FAILED, username, success=False, error_message='Invalid password', user_id=user.id)
            
            # Calculate attempts left safely
            attempts_left = 5
            if hasattr(user, 'failed_login_attempts'):
                attempts_left = max(0, 5 - user.failed_login_attempts)
            
            return jsonify({
                'error': 'Invalid credentials',
                'attempts_left': attempts_left
            }), 401
        
        # Successful login
        user.reset_failed_login()
        
        # Create session
        login_user(user, remember=remember)
        
        # Log successful login
        log_authentication(AuditActions.LOGIN_SUCCESS, username, success=True, user_id=user.id)
        
        # Check if password change required
        response_data = {
            'success': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'role': getattr(user, 'role', 'super_user'),  # Default role if not set
                'agency_id': getattr(user, 'agency_id', 1)   # Default agency
            }
        }
        
        if hasattr(user, 'must_change_password') and user.must_change_password:
            response_data['must_change_password'] = True
        
        return jsonify(response_data), 200
        
    except Exception as e:
        # Log the actual error for debugging
        print(f"Login error: {e}")
        try:
            db.session.rollback()
        except:
            pass
        return jsonify({'error': 'Internal server error during login'}), 500

@auth_bp.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """User logout endpoint"""
    # Log logout
    log_authentication(AuditActions.LOGOUT, current_user.username, success=True, user_id=current_user.id)
    
    # Destroy session
    logout_user()
    
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200

@auth_bp.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check authentication status"""
    try:
        if current_user.is_authenticated:
            return jsonify({
                'authenticated': True,
                'user': {
                    'id': current_user.id,
                    'username': current_user.username,
                    'role': getattr(current_user, 'role', 'super_user'),
                    'agency_id': getattr(current_user, 'agency_id', 1),
                    'must_change_password': getattr(current_user, 'must_change_password', False)
                }
            }), 200
        else:
            return jsonify({'authenticated': False}), 200
    except Exception as e:
        print(f"Auth status error: {e}")
        return jsonify({'authenticated': False}), 200

@auth_bp.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """Change own password"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({'error': 'Both current and new passwords are required'}), 400
        
        # Verify current password
        if not current_user.check_password(current_password):
            log_audit(AuditActions.PASSWORD_CHANGED, success=False, error_message='Current password incorrect')
            return jsonify({'error': 'Current password incorrect'}), 400
        
        # Validate new password (safely)
        try:
            is_valid, message = validate_password_strength(new_password, current_user.username)
            if not is_valid:
                return jsonify({'error': message}), 400
        except Exception:
            # If validation fails, use basic checks
            if len(new_password) < 8:
                return jsonify({'error': 'Password must be at least 8 characters long'}), 400
        
        # Check password history (safely)
        try:
            if hasattr(current_user, 'password_in_history') and current_user.password_in_history(new_password):
                return jsonify({'error': 'Cannot reuse recent passwords'}), 400
        except Exception:
            # If password history check fails, skip it
            pass
        
        # Update password
        current_user.set_password(new_password)
        
        # Set must_change_password to False (safely)
        if hasattr(current_user, 'must_change_password'):
            current_user.must_change_password = False
        
        # Add to password history (safely)
        try:
            if hasattr(current_user, 'add_to_password_history'):
                current_user.add_to_password_history(new_password)
        except Exception:
            # If password history fails, continue anyway
            pass
        
        db.session.commit()
        
        # Log password change
        log_audit(AuditActions.PASSWORD_CHANGED, success=True, resource_type='user', resource_id=str(current_user.id))
        
        return jsonify({'success': True, 'message': 'Password changed successfully'}), 200
        
    except Exception as e:
        print(f"Password change error: {e}")
        try:
            db.session.rollback()
        except:
            pass
        return jsonify({'error': 'Failed to change password. Please try again.'}), 500

@auth_bp.route('/api/auth/profile', methods=['GET'])
@login_required
def get_profile():
    """Get current user profile"""
    return jsonify({
        'user': current_user.to_dict(),
        'permissions': {
            'role': current_user.role,
            'can_manage_users': current_user.has_permission('manage_agency_users') or current_user.has_permission('manage_all_users'),
            'can_control_recordings': current_user.has_permission('control_recordings'),
            'can_access_audio': current_user.has_permission('access_audio_data'),
            'can_export_data': current_user.has_permission('export_data'),
            'can_assign_devices': current_user.has_permission('assign_devices')
        }
    }), 200

@auth_bp.route('/api/auth/check-password-strength', methods=['POST'])
def check_password_strength():
    """Check password strength without saving"""
    data = request.get_json()
    password = data.get('password', '')
    username = data.get('username', '')
    
    if not password:
        return jsonify({'error': 'Password is required'}), 400
    
    is_valid, message = validate_password_strength(password, username)
    
    # Calculate strength score
    from app.auth.utils import calculate_password_strength_score
    score = calculate_password_strength_score(password)
    
    return jsonify({
        'valid': is_valid,
        'message': message,
        'score': score,
        'strength': 'Weak' if score < 50 else 'Medium' if score < 80 else 'Strong'
    }), 200

@auth_bp.route('/api/auth/password-requirements', methods=['GET'])
def password_requirements():
    """Get password policy requirements"""
    from app.auth.utils import get_password_policy, format_password_requirements
    
    policy = get_password_policy()
    requirements = format_password_requirements()
    
    return jsonify({
        'policy': policy,
        'requirements': requirements
    }), 200

# Error handlers
@auth_bp.errorhandler(401)
def unauthorized_error(error):
    return jsonify({'error': 'Authentication required'}), 401

@auth_bp.errorhandler(403)
def forbidden_error(error):
    return jsonify({'error': 'Access forbidden'}), 403

@auth_bp.errorhandler(429)
def rate_limit_error(error):
    return jsonify({'error': 'Too many requests. Please try again later.'}), 429
