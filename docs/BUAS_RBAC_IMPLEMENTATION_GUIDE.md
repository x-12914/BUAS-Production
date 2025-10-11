# BUAS RBAC Implementation Guide - Complete Technical Specification

## 📋 Executive Summary

This document contains the complete technical specification and implementation guide for adding Role-Based Access Control (RBAC) to the BUAS (Basic Urban Audio Surveillance) system. The implementation focuses on a single agency (BUAS) initially, with infrastructure ready for multi-agency deployment later. This guide includes all design decisions, technical approaches, and step-by-step implementation segments agreed upon during planning.

## 🎯 Project Goals

### Primary Objectives
1. **Implement 4-tier role system** for BUAS agency
2. **Add secure authentication** without email dependency
3. **Maintain current functionality** as "Super User" level
4. **Zero disruption** to existing system
5. **Prepare infrastructure** for future multi-agency deployment

### Key Decisions Made
- ✅ **No email system** - More secure, admin-managed approach
- ✅ **User deactivation** instead of deletion - Preserves audit trail
- ✅ **Admin-created accounts** - No self-registration
- ✅ **Flask-Login authentication** - Session-based, not JWT
- ✅ **Single agency focus** - BUAS only for now
- ✅ **Current branding unchanged** - Keep existing BUAS design

## 👥 Role Definitions and Permissions

### 1. Super Super Admin (Global Administrator)
**Purpose:** Highest privilege level with potential future multi-agency access

**Permissions:**
- ✅ Create and manage Super Users
- ✅ Access all features and data within BUAS
- ✅ View global analytics and monitoring
- ✅ Manage system-wide configurations
- ✅ Emergency access recovery capabilities
- ✅ Future: Switch between agency contexts

**Cannot:**
- Nothing - has full system access

### 2. Super User (Agency Administrator)
**Purpose:** BUAS agency administrator with full control

**Permissions:**
- ✅ Full dashboard access (current system functionality)
- ✅ Create/manage Analysts and Operators
- ✅ All device management and monitoring
- ✅ Recording control for all devices
- ✅ Device assignment management
- ✅ All audio and location data access
- ✅ Export and reporting capabilities
- ✅ View audit logs for their managed users

**Cannot:**
- ❌ Create other Super Users
- ❌ Access Super Super Admin functions
- ❌ Modify system configurations

### 3. Analyst (Intelligence Analyst)
**Purpose:** Data analysis and monitoring of assigned devices

**Permissions:**
- ✅ Limited dashboard access
- ✅ View ONLY assigned devices
- ✅ Access audio/location data for assigned devices
- ✅ Export reports for assigned devices
- ✅ Analytics and trend analysis
- ✅ View recording status

**Cannot:**
- ❌ Control recordings (start/stop)
- ❌ Manage users
- ❌ Access unassigned devices
- ❌ Modify device assignments
- ❌ Delete any data

### 4. Operator (Field Operator)
**Purpose:** Recording control without data access

**Permissions:**
- ✅ Basic dashboard access
- ✅ View ALL agency devices
- ✅ Start/stop recordings for all devices
- ✅ View device online/offline status
- ✅ View recording status indicators

**Cannot:**
- ❌ Access audio recordings
- ❌ View location history
- ❌ Export data or reports
- ❌ Manage users
- ❌ Assign devices
- ❌ Access analytics

## 🔐 Authentication System Design

### Flask-Login Implementation

**How it works:**
1. User submits username/password
2. Server validates credentials against hashed password
3. Flask-Login creates secure session
4. Session cookie set in browser (httponly, secure)
5. Each request validates session automatically
6. Logout destroys session and invalidates cookie

### Session Management

```python
SESSION_CONFIGURATION = {
    'session_timeout': 30,  # minutes of inactivity
    'max_concurrent_sessions': 1,  # one login per user
    'force_https': True,  # production only
    'secure_cookie': True,
    'httponly_cookie': True,
    'session_storage': 'database',  # not memory
}
```

### Password Policy

```python
PASSWORD_REQUIREMENTS = {
    'min_length': 12,
    'require_uppercase': True,
    'require_lowercase': True, 
    'require_numbers': True,
    'require_special': True,
    'password_history': 5,  # can't reuse last 5
    'max_age_days': 90,  # force change
    'min_age_hours': 24,  # prevent rapid changes
    'max_attempts': 5,  # before lockout
    'lockout_duration': 30,  # minutes
}
```

## 🔑 User Management Approach

### Admin-Managed Password System

**NO Email-Based Password Reset**
- No "Forgot Password?" links
- No email communications
- No self-service password recovery
- More secure for surveillance systems

**How Password Management Works:**

1. **User Creation:**
   - Admin creates account with username
   - System generates temporary password
   - Admin communicates credentials securely
   - User must change on first login

2. **Password Reset Hierarchy:**
   - Operators/Analysts → Reset by Super User or Super Super Admin
   - Super Users → Reset by Super Super Admin only
   - Super Super Admin → Emergency script with server access

3. **Password Changes:**
   - Users can change their own password when logged in
   - Must provide current password
   - Subject to password policy requirements

### User Deactivation (Not Deletion)

```python
# Users are never deleted, only deactivated
DEACTIVATION_BENEFITS = {
    'audit_trail': 'Preserves all historical actions',
    'reversible': 'Can reactivate if needed',
    'data_integrity': 'Maintains referential integrity',
    'compliance': 'Meets data retention requirements',
}
```

## 💾 Database Schema

### New Tables Required

```sql
-- Agencies table (single BUAS entry for now)
CREATE TABLE agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL DEFAULT 'BUAS',
    full_name VARCHAR(255) DEFAULT 'Basic Urban Audio Surveillance',
    logo_url VARCHAR(255),
    primary_color VARCHAR(7) DEFAULT '#1a73e8',
    secondary_color VARCHAR(7) DEFAULT '#0d47a1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Users table for authentication
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK(role IN ('super_super_admin', 'super_user', 'analyst', 'operator')),
    agency_id INTEGER DEFAULT 1,  -- BUAS
    
    -- Security fields
    must_change_password BOOLEAN DEFAULT TRUE,
    password_changed_at TIMESTAMP,
    password_expires_at TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    last_login TIMESTAMP,
    last_login_ip VARCHAR(45),
    
    -- Management fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_at TIMESTAMP,
    deactivated_at TIMESTAMP,
    deactivated_by INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    
    FOREIGN KEY (agency_id) REFERENCES agencies(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (deactivated_by) REFERENCES users(id)
);

-- Device assignments for Analysts
CREATE TABLE device_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    UNIQUE(user_id, device_id)
);

-- User sessions for Flask-Login
CREATE TABLE user_sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Comprehensive audit logging
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username VARCHAR(50),  -- Store username in case user is deleted
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Password history to prevent reuse
CREATE TABLE password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Updates to Existing Tables

```sql
-- Add agency_id to all data tables
ALTER TABLE device_info ADD COLUMN agency_id INTEGER DEFAULT 1;
ALTER TABLE device_location ADD COLUMN agency_id INTEGER DEFAULT 1;
ALTER TABLE uploads ADD COLUMN agency_id INTEGER DEFAULT 1;
ALTER TABLE recording_events ADD COLUMN agency_id INTEGER DEFAULT 1;
ALTER TABLE device_commands ADD COLUMN agency_id INTEGER DEFAULT 1;

-- Add indexes for performance
CREATE INDEX idx_users_agency ON users(agency_id);
CREATE INDEX idx_device_assignments_user ON device_assignments(user_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

## 🎨 UI/UX Design Specifications

### Login Page Design

```jsx
// Login page structure and styling
const LoginPage = () => {
    return (
        <div className="login-page">
            {/* Full screen background */}
            <div className="login-background">
                {/* Subtle gradient or pattern */}
            </div>
            
            {/* Centered login box */}
            <div className="login-container">
                {/* BUAS Branding */}
                <div className="login-header">
                    <img src="/assets/buas-logo.png" alt="BUAS" className="login-logo" />
                    <h1 className="login-title">BUAS Command Center</h1>
                    <p className="login-subtitle">Basic Urban Audio Surveillance System</p>
                </div>
                
                {/* Login Form */}
                <form className="login-form">
                    <div className="form-group">
                        <label htmlFor="username" className="sr-only">Username</label>
                        <input 
                            type="text" 
                            id="username"
                            name="username"
                            placeholder="Username"
                            autoComplete="username"
                            required
                            className="login-input"
                        />
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="password" className="sr-only">Password</label>
                        <input 
                            type="password" 
                            id="password"
                            name="password"
                            placeholder="Password"
                            autoComplete="current-password"
                            required
                            className="login-input"
                        />
                    </div>
                    
                    <div className="form-options">
                        <label className="remember-me">
                            <input type="checkbox" name="remember" />
                            <span>Remember me for 7 days</span>
                        </label>
                    </div>
                    
                    <button type="submit" className="login-button">
                        Sign In
                    </button>
                    
                    {/* Error messages */}
                    {error && (
                        <div className="login-error">
                            {error}
                        </div>
                    )}
                    
                    {/* Must change password message */}
                    {mustChangePassword && (
                        <div className="login-warning">
                            You must change your password after login
                        </div>
                    )}
                </form>
                
                {/* Footer */}
                <div className="login-footer">
                    <p className="login-help">
                        Contact your administrator for password assistance
                    </p>
                    <p className="login-copyright">
                        © 2025 BUAS - All Rights Reserved
                    </p>
                </div>
            </div>
        </div>
    );
};
```

### Dashboard Role Modifications

```jsx
// Dashboard component adapts to user role
const Dashboard = ({ user }) => {
    // Determine which dashboard to show
    const getDashboardComponent = () => {
        switch(user.role) {
            case 'super_super_admin':
            case 'super_user':
                return <FullDashboard user={user} />;
            case 'analyst':
                return <AnalystDashboard user={user} />;
            case 'operator':
                return <OperatorDashboard user={user} />;
            default:
                return <UnauthorizedView />;
        }
    };
    
    return (
        <div className="dashboard-wrapper">
            {/* Navigation bar with role indicator */}
            <NavigationBar user={user} />
            
            {/* Role-specific dashboard */}
            {getDashboardComponent()}
            
            {/* User info widget */}
            <UserInfoWidget user={user} />
        </div>
    );
};
```

### User Management Interface

```jsx
// User management page for Super Users
const UserManagement = () => {
    return (
        <div className="user-management">
            {/* Header with actions */}
            <div className="management-header">
                <h2>User Management</h2>
                <button className="btn-primary" onClick={openCreateModal}>
                    + Create New User
                </button>
            </div>
            
            {/* Filters */}
            <div className="user-filters">
                <select className="filter-role">
                    <option value="">All Roles</option>
                    <option value="analyst">Analysts</option>
                    <option value="operator">Operators</option>
                </select>
                
                <select className="filter-status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="all">All</option>
                </select>
                
                <input 
                    type="search" 
                    placeholder="Search users..."
                    className="user-search"
                />
            </div>
            
            {/* User table */}
            <table className="user-table">
                <thead>
                    <tr>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <UserRow key={user.id} user={user} />
                    ))}
                </tbody>
            </table>
        </div>
    );
};
```

## 🔧 Backend Implementation Details

### Authentication Setup

```python
# app/auth/__init__.py
from flask_login import LoginManager
from flask import current_app

login_manager = LoginManager()

def init_auth(app):
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.session_protection = 'strong'
    
    @login_manager.user_loader
    def load_user(user_id):
        from app.models import User
        return User.query.get(int(user_id))
```

### User Model

```python
# app/models.py (additions)
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), default=1)
    
    # Security fields
    must_change_password = db.Column(db.Boolean, default=True)
    password_changed_at = db.Column(db.DateTime)
    password_expires_at = db.Column(db.DateTime)
    failed_login_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime)
    last_login = db.Column(db.DateTime)
    last_login_ip = db.Column(db.String(45))
    
    # Management fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    deactivated_at = db.Column(db.DateTime)
    deactivated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    assigned_devices = db.relationship('DeviceAssignment', backref='user', lazy='dynamic')
    created_users = db.relationship('User', backref='creator', remote_side=[id])
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
        self.password_changed_at = datetime.utcnow()
        self.password_expires_at = datetime.utcnow() + timedelta(days=90)
    
    def check_password(self, password):
        """Verify password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def is_locked(self):
        """Check if account is locked"""
        if self.locked_until:
            if datetime.utcnow() < self.locked_until:
                return True
            else:
                # Unlock if time has passed
                self.locked_until = None
                self.failed_login_attempts = 0
                db.session.commit()
        return False
    
    def increment_failed_login(self):
        """Increment failed login counter"""
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= 5:
            self.locked_until = datetime.utcnow() + timedelta(minutes=30)
        db.session.commit()
    
    def reset_failed_login(self):
        """Reset failed login counter on success"""
        self.failed_login_attempts = 0
        self.locked_until = None
        self.last_login = datetime.utcnow()
        db.session.commit()
    
    def has_permission(self, permission):
        """Check if user has specific permission"""
        return ROLE_PERMISSIONS[self.role].get(permission, False)
    
    def can_access_device(self, device_id):
        """Check if user can access specific device"""
        if self.role in ['super_super_admin', 'super_user', 'operator']:
            return True  # Full access
        elif self.role == 'analyst':
            # Check device assignment
            return self.assigned_devices.filter_by(
                device_id=device_id, 
                is_active=True
            ).first() is not None
        return False
```

### Permission System

```python
# app/auth/permissions.py
from functools import wraps
from flask import jsonify
from flask_login import current_user, login_required

# Role permission matrix
ROLE_PERMISSIONS = {
    'super_super_admin': {
        # User management
        'create_super_user': True,
        'create_analyst': True,
        'create_operator': True,
        'manage_all_users': True,
        'view_all_users': True,
        
        # Device access
        'view_all_devices': True,
        'control_recordings': True,
        'access_audio_data': True,
        'access_location_data': True,
        'export_data': True,
        
        # System
        'access_audit_logs': True,
        'system_configuration': True,
        'emergency_access': True,
        'switch_agencies': True,  # Future
    },
    
    'super_user': {
        # User management
        'create_super_user': False,
        'create_analyst': True,
        'create_operator': True,
        'manage_agency_users': True,
        'view_agency_users': True,
        
        # Device access
        'view_all_devices': True,
        'control_recordings': True,
        'access_audio_data': True,
        'access_location_data': True,
        'export_data': True,
        'assign_devices': True,
        
        # System
        'access_audit_logs': False,
        'system_configuration': False,
        'emergency_access': False,
        'switch_agencies': False,
    },
    
    'analyst': {
        # User management
        'create_super_user': False,
        'create_analyst': False,
        'create_operator': False,
        'manage_users': False,
        'view_users': False,
        
        # Device access
        'view_assigned_devices': True,
        'view_all_devices': False,
        'control_recordings': False,
        'access_audio_data': True,  # Only assigned
        'access_location_data': True,  # Only assigned
        'export_data': True,  # Only assigned
        
        # System
        'access_audit_logs': False,
        'system_configuration': False,
        'emergency_access': False,
        'switch_agencies': False,
    },
    
    'operator': {
        # User management
        'create_super_user': False,
        'create_analyst': False,
        'create_operator': False,
        'manage_users': False,
        'view_users': False,
        
        # Device access
        'view_all_devices': True,
        'control_recordings': True,
        'access_audio_data': False,
        'access_location_data': False,
        'export_data': False,
        
        # System
        'access_audit_logs': False,
        'system_configuration': False,
        'emergency_access': False,
        'switch_agencies': False,
    }
}

def require_permission(permission):
    """Decorator to check if user has specific permission"""
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if not current_user.has_permission(permission):
                return jsonify({
                    'error': 'Insufficient permissions',
                    'required': permission,
                    'your_role': current_user.role
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_role(roles):
    """Decorator to check if user has one of the specified roles"""
    if not isinstance(roles, list):
        roles = [roles]
    
    def decorator(f):
        @wraps(f)
        @login_required
        def decorated_function(*args, **kwargs):
            if current_user.role not in roles:
                return jsonify({
                    'error': 'Role not authorized',
                    'required_roles': roles,
                    'your_role': current_user.role
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator
```

### Authentication Routes

```python
# app/auth/routes.py
from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from app.models import User, AuditLog, db
from app.auth.utils import validate_password_strength, generate_temp_password

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    remember = data.get('remember', False)
    
    # Validate input
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    # Find user
    user = User.query.filter_by(username=username).first()
    
    # Check if user exists and is active
    if not user or not user.is_active:
        # Log failed attempt
        AuditLog.create(
            action='LOGIN_FAILED',
            username=username,
            ip_address=request.remote_addr,
            success=False,
            error_message='User not found or inactive'
        )
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Check if account is locked
    if user.is_locked():
        AuditLog.create(
            user_id=user.id,
            action='LOGIN_LOCKED',
            ip_address=request.remote_addr,
            success=False,
            error_message='Account locked due to failed attempts'
        )
        return jsonify({'error': 'Account locked. Contact administrator.'}), 403
    
    # Verify password
    if not user.check_password(password):
        user.increment_failed_login()
        AuditLog.create(
            user_id=user.id,
            action='LOGIN_FAILED',
            ip_address=request.remote_addr,
            success=False,
            error_message='Invalid password'
        )
        attempts_left = 5 - user.failed_login_attempts
        return jsonify({
            'error': 'Invalid credentials',
            'attempts_left': attempts_left
        }), 401
    
    # Check if password expired
    if user.password_expires_at and user.password_expires_at < datetime.utcnow():
        return jsonify({
            'error': 'Password expired',
            'must_change_password': True
        }), 401
    
    # Successful login
    user.reset_failed_login()
    user.last_login_ip = request.remote_addr
    db.session.commit()
    
    # Create session
    login_user(user, remember=remember)
    
    # Log successful login
    AuditLog.create(
        user_id=user.id,
        action='LOGIN_SUCCESS',
        ip_address=request.remote_addr,
        success=True
    )
    
    # Check if password change required
    response_data = {
        'success': True,
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'agency_id': user.agency_id
        }
    }
    
    if user.must_change_password:
        response_data['must_change_password'] = True
    
    return jsonify(response_data), 200

@auth_bp.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """User logout endpoint"""
    # Log logout
    AuditLog.create(
        user_id=current_user.id,
        action='LOGOUT',
        ip_address=request.remote_addr,
        success=True
    )
    
    # Destroy session
    logout_user()
    
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200

@auth_bp.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check authentication status"""
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'user': {
                'id': current_user.id,
                'username': current_user.username,
                'role': current_user.role,
                'agency_id': current_user.agency_id,
                'must_change_password': current_user.must_change_password
            }
        }), 200
    else:
        return jsonify({'authenticated': False}), 200

@auth_bp.route('/api/auth/change-password', methods=['POST'])
@login_required
def change_password():
    """Change own password"""
    data = request.get_json()
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    # Verify current password
    if not current_user.check_password(current_password):
        return jsonify({'error': 'Current password incorrect'}), 400
    
    # Validate new password
    is_valid, message = validate_password_strength(new_password, current_user.username)
    if not is_valid:
        return jsonify({'error': message}), 400
    
    # Check password history
    if current_user.password_in_history(new_password):
        return jsonify({'error': 'Cannot reuse recent passwords'}), 400
    
    # Update password
    current_user.set_password(new_password)
    current_user.must_change_password = False
    current_user.add_to_password_history(new_password)
    db.session.commit()
    
    # Log password change
    AuditLog.create(
        user_id=current_user.id,
        action='PASSWORD_CHANGED',
        ip_address=request.remote_addr,
        success=True
    )
    
    return jsonify({'success': True, 'message': 'Password changed successfully'}), 200
```

### User Management Routes

```python
# app/routes/user_management.py
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models import User, DeviceAssignment, AuditLog, db
from app.auth.permissions import require_permission, require_role
from app.auth.utils import generate_temp_password

user_mgmt_bp = Blueprint('user_mgmt', __name__)

@user_mgmt_bp.route('/api/users', methods=['GET'])
@require_permission('view_users')
def list_users():
    """List users based on role permissions"""
    if current_user.role == 'super_super_admin':
        # See all users across all agencies
        users = User.query.all()
    elif current_user.role == 'super_user':
        # See only agency users
        users = User.query.filter_by(agency_id=current_user.agency_id).all()
    else:
        return jsonify({'error': 'Unauthorized'}), 403
    
    user_list = []
    for user in users:
        user_list.append({
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'is_active': user.is_active,
            'last_login': user.last_login.isoformat() if user.last_login else None,
            'created_at': user.created_at.isoformat(),
            'must_change_password': user.must_change_password
        })
    
    return jsonify({'users': user_list}), 200

@user_mgmt_bp.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Create new user"""
    data = request.get_json()
    username = data.get('username', '').strip()
    role = data.get('role')
    
    # Validate role creation permissions
    if role == 'super_user' and current_user.role != 'super_super_admin':
        return jsonify({'error': 'Only Super Super Admin can create Super Users'}), 403
    
    if role in ['analyst', 'operator'] and current_user.role not in ['super_super_admin', 'super_user']:
        return jsonify({'error': 'Insufficient permissions to create this role'}), 403
    
    # Check if username exists
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    # Generate temporary password
    temp_password = generate_temp_password()
    
    # Create user
    new_user = User(
        username=username,
        role=role,
        agency_id=current_user.agency_id if current_user.role != 'super_super_admin' else data.get('agency_id', 1),
        created_by=current_user.id,
        must_change_password=True
    )
    new_user.set_password(temp_password)
    
    db.session.add(new_user)
    db.session.commit()
    
    # Log user creation
    AuditLog.create(
        user_id=current_user.id,
        action='USER_CREATED',
        resource_type='user',
        resource_id=new_user.id,
        new_value=f'username={username}, role={role}',
        success=True
    )
    
    return jsonify({
        'success': True,
        'user_id': new_user.id,
        'username': username,
        'temporary_password': temp_password,
        'message': 'User created successfully. Communicate credentials securely.'
    }), 201

@user_mgmt_bp.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
@login_required
def admin_reset_password(user_id):
    """Admin reset user password"""
    target_user = User.query.get(user_id)
    
    if not target_user:
        return jsonify({'error': 'User not found'}), 404
    
    # Check permission hierarchy
    if not can_manage_user(current_user, target_user):
        return jsonify({'error': 'Cannot reset password for this user'}), 403
    
    # Generate new temporary password
    temp_password = generate_temp_password()
    target_user.set_password(temp_password)
    target_user.must_change_password = True
    target_user.failed_login_attempts = 0
    target_user.locked_until = None
    db.session.commit()
    
    # Log password reset
    AuditLog.create(
        user_id=current_user.id,
        action='PASSWORD_RESET',
        resource_type='user',
        resource_id=user_id,
        success=True
    )
    
    return jsonify({
        'success': True,
        'temporary_password': temp_password,
        'message': 'Password reset successfully. Communicate new password securely.'
    }), 200

@user_mgmt_bp.route('/api/users/<int:user_id>/deactivate', methods=['POST'])
@login_required
def deactivate_user(user_id):
    """Deactivate user account"""
    target_user = User.query.get(user_id)
    
    if not target_user:
        return jsonify({'error': 'User not found'}), 404
    
    # Check permission hierarchy
    if not can_manage_user(current_user, target_user):
        return jsonify({'error': 'Cannot deactivate this user'}), 403
    
    # Deactivate user
    target_user.is_active = False
    target_user.deactivated_at = datetime.utcnow()
    target_user.deactivated_by = current_user.id
    db.session.commit()
    
    # Invalidate all user sessions
    UserSession.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    
    # Log deactivation
    AuditLog.create(
        user_id=current_user.id,
        action='USER_DEACTIVATED',
        resource_type='user',
        resource_id=user_id,
        success=True
    )
    
    return jsonify({'success': True, 'message': 'User deactivated successfully'}), 200

@user_mgmt_bp.route('/api/users/<int:user_id>/assign-devices', methods=['POST'])
@require_role(['super_super_admin', 'super_user'])
def assign_devices_to_analyst(user_id):
    """Assign devices to analyst"""
    target_user = User.query.get(user_id)
    
    if not target_user or target_user.role != 'analyst':
        return jsonify({'error': 'User not found or not an analyst'}), 404
    
    data = request.get_json()
    device_ids = data.get('device_ids', [])
    
    # Remove existing assignments
    DeviceAssignment.query.filter_by(user_id=user_id).update({'is_active': False})
    
    # Create new assignments
    for device_id in device_ids:
        assignment = DeviceAssignment(
            user_id=user_id,
            device_id=device_id,
            assigned_by=current_user.id,
            is_active=True
        )
        db.session.add(assignment)
    
    db.session.commit()
    
    # Log device assignment
    AuditLog.create(
        user_id=current_user.id,
        action='DEVICES_ASSIGNED',
        resource_type='user',
        resource_id=user_id,
        new_value=f'devices={device_ids}',
        success=True
    )
    
    return jsonify({'success': True, 'assigned_devices': device_ids}), 200

def can_manage_user(manager, target):
    """Check if manager can manage target user"""
    if manager.role == 'super_super_admin':
        return True
    if manager.role == 'super_user' and target.role in ['analyst', 'operator']:
        return manager.agency_id == target.agency_id
    return False
```

### Audit Logging

```python
# app/models.py (addition)
class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    username = db.Column(db.String(50))
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(50))
    resource_id = db.Column(db.String(100))
    old_value = db.Column(db.Text)
    new_value = db.Column(db.Text)
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    success = db.Column(db.Boolean, default=True)
    error_message = db.Column(db.Text)
    
    @classmethod
    def create(cls, **kwargs):
        """Helper method to create audit log entry"""
        # Add request context if available
        if request:
            kwargs['ip_address'] = kwargs.get('ip_address', request.remote_addr)
            kwargs['user_agent'] = kwargs.get('user_agent', request.user_agent.string)
        
        # Add username for reference
        if 'user_id' in kwargs and kwargs['user_id']:
            user = User.query.get(kwargs['user_id'])
            if user:
                kwargs['username'] = user.username
        
        log_entry = cls(**kwargs)
        db.session.add(log_entry)
        db.session.commit()
        return log_entry
```

## 🚀 Implementation Segments

### SEGMENT 1: Database Foundation (45 minutes)

**Files to create/modify:**
- `create_rbac_tables.py` - Database migration script
- `create_initial_admin.py` - Bootstrap first admin
- `app/models.py` - Add new models

**Steps:**
1. Create migration script with all new tables
2. Run migration to create tables
3. Add agency_id to existing tables
4. Create BUAS agency record
5. Create initial Super Super Admin user
6. Test database structure

**Verification:**
- Database has all new tables
- BUAS agency exists
- Initial admin can be created
- Foreign keys work correctly

### SEGMENT 2: Authentication System (1 hour)

**Files to create/modify:**
- `app/auth/__init__.py` - Authentication initialization
- `app/auth/models.py` - User model extensions
- `app/auth/routes.py` - Login/logout endpoints
- `app/__init__.py` - Add Flask-Login to app

**Steps:**
1. Install Flask-Login: `pip install flask-login`
2. Create authentication blueprint
3. Implement login/logout routes
4. Add session management
5. Configure Flask-Login
6. Test with initial admin

**Verification:**
- Can login with admin account
- Session persists across requests
- Logout destroys session
- Invalid credentials rejected

### SEGMENT 3: Login Page Frontend (45 minutes)

**Files to create/modify:**
- `frontend/src/components/Login.js` - Login component
- `frontend/src/components/Login.css` - Login styling
- `frontend/src/App.js` - Add authentication check
- `frontend/src/services/authService.js` - Auth API calls

**Steps:**
1. Create Login component with BUAS branding
2. Add form validation
3. Implement auth service
4. Add route protection
5. Handle login redirects
6. Add logout button to dashboard

**Verification:**
- Login page displays correctly
- Form validates input
- Successful login redirects to dashboard
- Logout returns to login page
- Protected routes require authentication

### SEGMENT 4: Role-Based Access Control (1 hour)

**Files to create/modify:**
- `app/auth/permissions.py` - Permission matrix
- `app/auth/decorators.py` - Permission decorators
- Update all routes in `app/routes.py` - Add decorators

**Steps:**
1. Define role permission matrix
2. Create permission checking decorators
3. Add @login_required to all routes
4. Add role checks to sensitive routes
5. Filter data based on user role
6. Test with different roles

**Verification:**
- All routes require authentication
- Role restrictions enforced
- Data filtered correctly
- Permission errors returned
- Audit logs created

### SEGMENT 5: User Management Backend (1 hour)

**Files to create/modify:**
- `app/routes/user_management.py` - User CRUD routes
- `app/auth/utils.py` - Password utilities
- Update `app/__init__.py` - Register blueprint

**Steps:**
1. Create user management blueprint
2. Implement user CRUD operations
3. Add password reset functionality
4. Implement device assignment
5. Add user deactivation
6. Test all endpoints

**Verification:**
- Can create users with proper roles
- Password reset generates temp password
- Device assignment works for analysts
- User deactivation prevents login
- Audit logs track all actions

### SEGMENT 6: User Management Frontend (1.5 hours)

**Files to create/modify:**
- `frontend/src/components/UserManagement.js` - Main component
- `frontend/src/components/UserModal.js` - Create/edit modal
- `frontend/src/components/DeviceAssignment.js` - Device assignment
- `frontend/src/services/userService.js` - User API calls

**Steps:**
1. Create user management page
2. Build user table with filters
3. Add create user modal
4. Implement edit functionality
5. Add device assignment UI
6. Integrate with dashboard

**Verification:**
- User list displays correctly
- Can create new users
- Temporary passwords shown
- Device assignment works
- Only Super Users see management

### SEGMENT 7: Dashboard Role Modifications (1.5 hours)

**Files to modify:**
- `frontend/src/components/Dashboard.js` - Role-based rendering
- `frontend/src/components/UserList.js` - Filter by role
- `frontend/src/components/RecordingControlButton.js` - Permission check
- `frontend/src/components/DeviceDetail.js` - Data access control

**Steps:**
1. Add role checking to Dashboard
2. Create AnalystDashboard component
3. Create OperatorDashboard component
4. Hide/show components by role
5. Filter devices for analysts
6. Disable features by permission

**Verification:**
- Each role sees correct dashboard
- Analysts see only assigned devices
- Operators can't access data
- Recording controls respect permissions
- UI adapts to user role

### SEGMENT 8: Audit Logging (30 minutes)

**Files to create/modify:**
- `app/utils/audit.py` - Audit logging utilities
- Update all route handlers - Add audit calls
- `frontend/src/components/AuditLog.js` - Optional viewer

**Steps:**
1. Create audit logging helper
2. Add logging to all critical actions
3. Log authentication events
4. Log data access
5. Log user management
6. Optional: Create audit viewer

**Verification:**
- All logins logged
- User changes tracked
- Recording actions logged
- Failed attempts recorded
- Can query audit logs

### SEGMENT 9: Testing & Polish (1 hour)

**Test scenarios:**
1. Create test users for each role
2. Test login for each user
3. Verify dashboard differences
4. Test permission restrictions
5. Verify data filtering
6. Test user management hierarchy
7. Test password changes
8. Test device assignments
9. Test audit logging
10. Test session timeout

**Polish items:**
- Error message consistency
- Loading states
- Form validation messages
- Permission denied pages
- Help text and tooltips

### SEGMENT 10: Documentation & Cleanup (30 minutes)

**Documentation to create:**
- Update `README.md` with RBAC section
- Create user guide for each role
- Document API changes
- Add setup instructions
- Create troubleshooting guide

**Cleanup tasks:**
- Remove console.log statements
- Add code comments
- Optimize database queries
- Review security practices
- Final testing pass

## 🔒 Security Considerations

### Password Security
- Passwords hashed with bcrypt/scrypt
- Minimum 12 characters required
- Password history prevents reuse
- Forced expiration after 90 days
- Account lockout after 5 failed attempts

### Session Security
- Sessions stored in database
- 30-minute inactivity timeout
- Single concurrent session per user
- Secure, httponly cookies
- HTTPS required in production

### Data Protection
- Agency data isolation
- Role-based data filtering
- Audit trail for all actions
- No data deletion, only deactivation
- Regular backup procedures

### Access Control
- Principle of least privilege
- Hierarchical permission model
- Device-level access control for analysts
- API endpoint protection
- Frontend and backend validation

## 📝 Testing Checklist

### Authentication Testing
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Account lockout after failed attempts
- [ ] Session persistence
- [ ] Logout functionality
- [ ] Session timeout
- [ ] Remember me option
- [ ] Concurrent session handling

### Role Testing
- [ ] Super Super Admin full access
- [ ] Super User agency limitations
- [ ] Analyst device restrictions
- [ ] Operator data restrictions
- [ ] Permission denied handling
- [ ] Role change effects
- [ ] Cross-role data isolation

### User Management Testing
- [ ] Create users with each role
- [ ] Password reset by admin
- [ ] User deactivation
- [ ] Device assignment for analysts
- [ ] Cannot create unauthorized roles
- [ ] Temporary password enforcement
- [ ] Password change on first login

### Dashboard Testing
- [ ] Role-specific dashboard views
- [ ] Component visibility by role
- [ ] Data filtering for analysts
- [ ] Recording control permissions
- [ ] Export functionality by role
- [ ] Real-time updates respect permissions

### Security Testing
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Password policy enforcement
- [ ] Session hijacking prevention
- [ ] Audit log completeness
- [ ] Data leak prevention

## 🚨 Emergency Procedures

### Super Super Admin Lockout
```bash
# SSH to server
python emergency_access.py --create-temp-admin

# Creates temporary admin account
# Username: emergency_admin
# Password: [generated]
# Expires: 1 hour
```

### Mass Password Reset
```python
# Script for emergency password reset
python scripts/mass_password_reset.py --role analyst --agency BUAS
# Generates new passwords for all analysts
```

### Audit Investigation
```sql
-- Query suspicious activity
SELECT * FROM audit_logs 
WHERE action IN ('LOGIN_FAILED', 'UNAUTHORIZED_ACCESS')
AND timestamp > datetime('now', '-1 hour')
ORDER BY timestamp DESC;
```

## 📊 Monitoring and Metrics

### Key Metrics to Track
- Active users per role
- Failed login attempts
- Average session duration
- Permission denied events
- Password reset frequency
- Device assignment changes
- Data export volume

### Health Checks
- Database connectivity
- Session storage status
- Authentication service
- Audit log growth
- User lockout status
- Password expiration warnings

## 🎯 Success Criteria

### Immediate Success (Day 1)
- Working authentication system
- All 4 roles implemented
- Current functionality preserved
- Zero data loss
- Audit logging active

### Week 1 Success
- Full RBAC system operational
- User management complete
- Dashboard adapted for roles
- Testing complete
- Documentation updated

### Long-term Success
- Ready for multi-agency deployment
- Scalable architecture
- Maintainable codebase
- Security compliance
- User satisfaction

## 🔄 Future Enhancements

### Phase 2 Considerations
- Email notifications (optional)
- Two-factor authentication
- SSO integration
- Advanced audit analytics
- Role customization
- API key authentication
- Mobile app support

### Multi-Agency Readiness
- Agency switching for Super Super Admin
- Cross-agency reporting
- Agency-specific branding
- Federated authentication
- Central monitoring dashboard
- Automated deployment scripts

## 📚 Additional Resources

### Configuration Files

**Flask-Login Configuration:**
```python
# config.py
class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    SESSION_TYPE = 'sqlalchemy'
    SESSION_PERMANENT = False
    SESSION_USE_SIGNER = True
    SESSION_KEY_PREFIX = 'buas:'
    PERMANENT_SESSION_LIFETIME = timedelta(minutes=30)
    
    # Security headers
    SESSION_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # Password policy
    PASSWORD_MIN_LENGTH = 12
    PASSWORD_REQUIRE_UPPER = True
    PASSWORD_REQUIRE_LOWER = True
    PASSWORD_REQUIRE_NUMBER = True
    PASSWORD_REQUIRE_SPECIAL = True
    PASSWORD_HISTORY_COUNT = 5
    PASSWORD_MAX_AGE_DAYS = 90
    
    # Account lockout
    MAX_FAILED_LOGIN_ATTEMPTS = 5
    LOCKOUT_DURATION_MINUTES = 30
```

### Utility Functions

**Password Generation:**
```python
# app/auth/utils.py
import secrets
import string

def generate_temp_password(length=16):
    """Generate secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure password meets requirements
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            any(c in "!@#$%^&*" for c in password)):
            return password

def validate_password_strength(password, username):
    """Validate password meets requirements"""
    errors = []
    
    if len(password) < 12:
        errors.append("Password must be at least 12 characters")
    
    if not any(c.isupper() for c in password):
        errors.append("Password must contain uppercase letter")
    
    if not any(c.islower() for c in password):
        errors.append("Password must contain lowercase letter")
    
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain number")
    
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        errors.append("Password must contain special character")
    
    if username.lower() in password.lower():
        errors.append("Password cannot contain username")
    
    if errors:
        return False, "; ".join(errors)
    
    return True, "Password is strong"
```

### Frontend Auth Service

```javascript
// frontend/src/services/authService.js
class AuthService {
    constructor() {
        this.baseURL = '/api/auth';
        this.user = null;
    }
    
    async login(username, password, remember = false) {
        try {
            const response = await fetch(`${this.baseURL}/login`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({username, password, remember})
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.user = data.user;
                return {success: true, user: data.user, mustChangePassword: data.must_change_password};
            } else {
                return {success: false, error: data.error, attemptsLeft: data.attempts_left};
            }
        } catch (error) {
            return {success: false, error: 'Network error'};
        }
    }
    
    async logout() {
        try {
            await fetch(`${this.baseURL}/logout`, {
                method: 'POST',
                credentials: 'include'
            });
            this.user = null;
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
    
    async checkAuth() {
        try {
            const response = await fetch(`${this.baseURL}/status`, {
                credentials: 'include'
            });
            const data = await response.json();
            
            if (data.authenticated) {
                this.user = data.user;
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
    
    async changePassword(currentPassword, newPassword) {
        try {
            const response = await fetch(`${this.baseURL}/change-password`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include',
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            });
            
            const data = await response.json();
            return response.ok ? {success: true} : {success: false, error: data.error};
        } catch (error) {
            return {success: false, error: 'Network error'};
        }
    }
    
    getCurrentUser() {
        return this.user;
    }
    
    hasPermission(permission) {
        if (!this.user) return false;
        // Check permission based on role
        return ROLE_PERMISSIONS[this.user.role]?.[permission] || false;
    }
    
    canAccessDevice(deviceId) {
        if (!this.user) return false;
        
        if (['super_super_admin', 'super_user', 'operator'].includes(this.user.role)) {
            return true;
        }
        
        if (this.user.role === 'analyst') {
            // Check if device is assigned (would need to fetch assignments)
            return this.user.assigned_devices?.includes(deviceId) || false;
        }
        
        return false;
    }
}

export default new AuthService();
```

## 🎬 Conclusion

This comprehensive guide provides everything needed to implement the RBAC system for BUAS. The implementation is designed to be:

1. **Secure** - Following best practices for authentication and authorization
2. **Scalable** - Ready for multi-agency deployment
3. **Maintainable** - Clean code structure and documentation
4. **User-friendly** - Intuitive interface for all roles
5. **Auditable** - Complete tracking of all actions

The segmented approach allows for incremental implementation with verification at each step. The system maintains backward compatibility while adding powerful new capabilities for user and access management.

Remember: Start with Segment 1 (Database Foundation) and proceed sequentially. Each segment builds on the previous one, ensuring a solid foundation for the complete RBAC system.

**Total Implementation Time:** Approximately 9.5 hours of focused development
**Result:** Production-ready RBAC system for BUAS with future multi-agency capability
