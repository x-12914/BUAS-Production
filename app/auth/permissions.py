"""
Permission System for BUAS RBAC
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Role Definitions

This module implements the comprehensive role-based access control (RBAC) system for BUAS.
It defines the permission matrix for all four user roles and provides decorators for
protecting routes and checking permissions.

Role Hierarchy (highest to lowest):
1. Super Super Admin - Full system access, can create all user types
2. Super User - Agency-level administration, can create analysts/operators  
3. Analyst - Data access for assigned devices only, read-only operations
4. Operator - Device control only, can start/stop recordings but no data access

Permission Categories:
- User Management: Creating and managing user accounts
- Device Access: Viewing and controlling devices
- Data Access: Accessing audio and location data
- System Administration: System-level configuration and audit logs
"""

from functools import wraps
from flask import jsonify
from flask_login import current_user, login_required

# Role permission matrix as defined in the implementation guide
# Each role inherits specific permissions based on their responsibilities
ROLE_PERMISSIONS = {
    'super_super_admin': {
        # User management - Full control over all users
        'create_super_user': True,     # Can create other super users
        'create_analyst': True,        # Can create analyst accounts
        'create_operator': True,       # Can create operator accounts
        'manage_all_users': True,      # Can manage users across agencies
        'view_all_users': True,        # Can view all user accounts
        
        # Device access - Full device control and visibility
        'view_all_devices': True,      # Can see all devices in system
        'control_recordings': True,    # Can start/stop recordings
        'access_audio_data': True,     # Can access all audio files
        'access_location_data': True,  # Can access all location data
        'export_data': True,           # Can export data in various formats
        
        # Dashboard and UI - Full interface access
        'view_dashboard': True,        # Can access main dashboard
        'view_recordings': True,       # Can view recording interfaces
        
        # System
        'access_audit_logs': True,
        'system_configuration': True,
        'manage_system': True,
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
        
        # Dashboard and UI
        'view_dashboard': True,
        'view_recordings': True,
        
        # System
        'access_audit_logs': True,
        'system_configuration': False,
        'manage_system': False,
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
        
        # Dashboard and UI
        'view_dashboard': True,
        'view_recordings': True,  # Only assigned devices
        
        # System
        'access_audit_logs': False,
        'system_configuration': False,
        'manage_system': False,
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
        
        # Dashboard and UI
        'view_dashboard': True,
        'view_recordings': False,  # No audio access
        
        # System
        'access_audit_logs': False,
        'system_configuration': False,
        'manage_system': False,
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

def check_device_access(device_id):
    """Helper function to check if current user can access a device"""
    if not current_user.is_authenticated:
        return False
    
    return current_user.can_access_device(device_id)

def filter_devices_by_access(device_list):
    """Filter device list based on user access permissions"""
    if not current_user.is_authenticated:
        return []
    
    if current_user.role in ['super_super_admin', 'super_user', 'operator']:
        return device_list  # Full access
    
    elif current_user.role == 'analyst':
        # Filter to only assigned devices
        assigned_device_ids = [
            assignment.device_id 
            for assignment in current_user.assigned_devices.filter_by(is_active=True)
        ]
        return [device for device in device_list if device.get('device_id') in assigned_device_ids]
    
    return []  # No access

def can_manage_user(manager, target):
    """Check if manager can manage target user"""
    if not manager or not target:
        return False
    
    if manager.role == 'super_super_admin':
        return True
    
    if manager.role == 'super_user' and target.role in ['analyst', 'operator']:
        return manager.agency_id == target.agency_id
    
    return False

# Alias for backward compatibility with tests
PERMISSIONS = ROLE_PERMISSIONS

def get_user_permissions(role):
    """Get all permissions for a specific role"""
    return ROLE_PERMISSIONS.get(role, {})

def has_permission(role, category, permission):
    """Check if role has specific permission"""
    role_perms = ROLE_PERMISSIONS.get(role, {})
    return role_perms.get(permission, False)
