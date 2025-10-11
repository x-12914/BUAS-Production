"""
Audit Logging Utilities for BUAS RBAC System
BUAS RBAC Implementation - Segment 8: Audit Logging

This module provides helper functions for comprehensive audit logging
of all security-critical actions in the BUAS system.
"""

from flask import request, has_request_context
from flask_login import current_user
from ..models import AuditLog, db
import json
from datetime import datetime
from functools import wraps


# Audit Action Types
class AuditActions:
    # Authentication
    LOGIN_SUCCESS = 'LOGIN_SUCCESS'
    LOGIN_FAILED = 'LOGIN_FAILED'
    LOGIN_LOCKED = 'LOGIN_LOCKED'
    LOGOUT = 'LOGOUT'
    PASSWORD_CHANGED = 'PASSWORD_CHANGED'
    PASSWORD_RESET = 'PASSWORD_RESET'
    SESSION_EXPIRED = 'SESSION_EXPIRED'
    
    # User Management
    USER_CREATED = 'USER_CREATED'
    USER_UPDATED = 'USER_UPDATED'
    USER_DEACTIVATED = 'USER_DEACTIVATED'
    USER_REACTIVATED = 'USER_REACTIVATED'
    USER_PASSWORD_RESET = 'USER_PASSWORD_RESET'
    USER_ROLE_CHANGED = 'USER_ROLE_CHANGED'
    
    # Device Management
    DEVICE_ASSIGNED = 'DEVICE_ASSIGNED'
    DEVICE_UNASSIGNED = 'DEVICE_UNASSIGNED'
    DEVICE_ACCESSED = 'DEVICE_ACCESSED'
    DEVICE_ACCESS_DENIED = 'DEVICE_ACCESS_DENIED'
    DEVICE_REGISTERED = 'DEVICE_REGISTERED'
    
    # Recording Control
    RECORDING_START = 'RECORDING_START'
    RECORDING_STOP = 'RECORDING_STOP'
    RECORDING_STARTED = 'RECORDING_STARTED'
    RECORDING_STOPPED = 'RECORDING_STOPPED'
    BATCH_RECORDING_START = 'BATCH_RECORDING_START'
    BATCH_RECORDING_STOP = 'BATCH_RECORDING_STOP'
    
    # Data Access
    AUDIO_DATA_ACCESSED = 'AUDIO_DATA_ACCESSED'
    LOCATION_DATA_ACCESSED = 'LOCATION_DATA_ACCESSED'
    LOCATION_DATA_RECEIVED = 'LOCATION_DATA_RECEIVED'
    RECORDING_EVENT_RECEIVED = 'RECORDING_EVENT_RECEIVED'
    DATA_EXPORT = 'DATA_EXPORT'
    DEVICE_DATA_EXPORTED = 'DEVICE_DATA_EXPORTED'
    CONTACTS_ACCESSED = 'CONTACTS_ACCESSED'
    AUDIT_LOG_ACCESSED = 'AUDIT_LOG_ACCESSED'
    AUDIT_LOG_EXPORTED = 'AUDIT_LOG_EXPORTED'
    
    # System Events
    PERMISSION_DENIED = 'PERMISSION_DENIED'
    UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS'
    SYSTEM_ERROR = 'SYSTEM_ERROR'


def log_audit(action, success=True, resource_type=None, resource_id=None, 
              old_value=None, new_value=None, error_message=None, 
              user_id=None, username=None):
    """
    Log an audit event with comprehensive details
    
    Args:
        action (str): The action being performed (use AuditActions constants)
        success (bool): Whether the action was successful
        resource_type (str): Type of resource affected (user, device, recording, etc.)
        resource_id (str): ID of the affected resource
        old_value (dict/str): Previous value before change
        new_value (dict/str): New value after change
        error_message (str): Error message if action failed
        user_id (int): Override user ID (if not current_user)
        username (str): Override username
    """
    try:
        # Get user information
        if user_id is None and hasattr(current_user, 'id'):
            user_id = current_user.id
        if username is None and hasattr(current_user, 'username'):
            username = current_user.username
        
        # Convert complex values to JSON
        if old_value and not isinstance(old_value, str):
            old_value = json.dumps(old_value, default=str)
        if new_value and not isinstance(new_value, str):
            new_value = json.dumps(new_value, default=str)
        
        # Create audit log entry
        AuditLog.create(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=old_value,
            new_value=new_value,
            success=success,
            error_message=error_message
        )
        
    except Exception as e:
        # Audit logging should never break the main functionality
        print(f"Warning: Audit logging failed for action {action}: {e}")


def log_authentication(action, username, success=True, error_message=None, user_id=None):
    """Log authentication events"""
    log_audit(
        action=action,
        success=success,
        resource_type='authentication',
        resource_id=username,
        error_message=error_message,
        user_id=user_id,
        username=username
    )


def log_user_management(action, target_user_id, target_username, old_data=None, new_data=None, success=True, error_message=None):
    """Log user management events"""
    log_audit(
        action=action,
        success=success,
        resource_type='user',
        resource_id=str(target_user_id),
        old_value=old_data,
        new_value=new_data,
        error_message=error_message
    )


def log_device_action(action, device_id, success=True, additional_data=None, error_message=None):
    """Log device-related actions"""
    log_audit(
        action=action,
        success=success,
        resource_type='device',
        resource_id=device_id,
        new_value=additional_data,
        error_message=error_message
    )


def log_data_access(action, resource_type, resource_id, success=True, error_message=None, details=None):
    """Log data access events"""
    log_audit(
        action=action,
        success=success,
        resource_type=resource_type,
        resource_id=resource_id,
        new_value=details,
        error_message=error_message
    )


def log_permission_denied(resource_type, resource_id, required_permission):
    """Log permission denied events"""
    log_audit(
        action=AuditActions.PERMISSION_DENIED,
        success=False,
        resource_type=resource_type,
        resource_id=resource_id,
        error_message=f"Permission denied: {required_permission}"
    )


def audit_decorator(action, resource_type=None, get_resource_id=None):
    """
    Decorator to automatically log audit events for functions
    
    Args:
        action (str): The audit action to log
        resource_type (str): Type of resource being accessed
        get_resource_id (callable): Function to extract resource ID from function args
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            resource_id = None
            if get_resource_id:
                try:
                    resource_id = get_resource_id(*args, **kwargs)
                except:
                    resource_id = None
            
            try:
                result = func(*args, **kwargs)
                log_audit(
                    action=action,
                    success=True,
                    resource_type=resource_type,
                    resource_id=resource_id
                )
                return result
            except Exception as e:
                log_audit(
                    action=action,
                    success=False,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    error_message=str(e)
                )
                raise
        return wrapper
    return decorator


def get_audit_logs(user_id=None, action=None, resource_type=None, 
                   start_date=None, end_date=None, limit=100, offset=0):
    """
    Query audit logs with filters
    
    Args:
        user_id (int): Filter by user ID
        action (str): Filter by action type
        resource_type (str): Filter by resource type
        start_date (datetime): Filter by start date
        end_date (datetime): Filter by end date
        limit (int): Maximum number of results
        offset (int): Offset for pagination
    
    Returns:
        list: List of audit log dictionaries
    """
    try:
        query = AuditLog.query
        
        if user_id:
            query = query.filter(AuditLog.user_id == user_id)
        if action:
            query = query.filter(AuditLog.action == action)
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if start_date:
            query = query.filter(AuditLog.timestamp >= start_date)
        if end_date:
            query = query.filter(AuditLog.timestamp <= end_date)
        
        query = query.order_by(AuditLog.timestamp.desc())
        query = query.offset(offset).limit(limit)
        
        return [log.to_dict() for log in query.all()]
        
    except Exception as e:
        print(f"Error querying audit logs: {e}")
        return []


def get_user_activity_summary(user_id, days=30):
    """
    Get activity summary for a user
    
    Args:
        user_id (int): User ID
        days (int): Number of days to look back
    
    Returns:
        dict: Activity summary
    """
    try:
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        logs = AuditLog.query.filter(
            AuditLog.user_id == user_id,
            AuditLog.timestamp >= start_date
        ).all()
        
        summary = {
            'total_actions': len(logs),
            'successful_actions': len([log for log in logs if log.success]),
            'failed_actions': len([log for log in logs if not log.success]),
            'login_count': len([log for log in logs if log.action in [AuditActions.LOGIN_SUCCESS, AuditActions.LOGIN_FAILED]]),
            'device_access_count': len([log for log in logs if log.action == AuditActions.DEVICE_ACCESSED]),
            'recording_actions': len([log for log in logs if 'RECORDING' in log.action]),
            'data_access_count': len([log for log in logs if 'DATA_ACCESSED' in log.action]),
            'recent_actions': [log.to_dict() for log in logs[:10]]
        }
        
        return summary
        
    except Exception as e:
        print(f"Error generating user activity summary: {e}")
        return {}


def get_system_activity_summary(days=7):
    """
    Get system-wide activity summary
    
    Args:
        days (int): Number of days to look back
    
    Returns:
        dict: System activity summary
    """
    try:
        from datetime import timedelta
        
        start_date = datetime.utcnow() - timedelta(days=days)
        
        logs = AuditLog.query.filter(
            AuditLog.timestamp >= start_date
        ).all()
        
        summary = {
            'total_actions': len(logs),
            'unique_users': len(set([log.user_id for log in logs if log.user_id])),
            'successful_logins': len([log for log in logs if log.action == AuditActions.LOGIN_SUCCESS]),
            'failed_logins': len([log for log in logs if log.action == AuditActions.LOGIN_FAILED]),
            'user_management_actions': len([log for log in logs if log.resource_type == 'user']),
            'device_actions': len([log for log in logs if log.resource_type == 'device']),
            'recording_actions': len([log for log in logs if 'RECORDING' in log.action]),
            'data_access_actions': len([log for log in logs if 'DATA_ACCESSED' in log.action]),
            'permission_denied_count': len([log for log in logs if log.action == AuditActions.PERMISSION_DENIED]),
            'recent_critical_failures': [
                log.to_dict() for log in logs 
                if not log.success and log.action in [
                    AuditActions.LOGIN_FAILED, AuditActions.PERMISSION_DENIED, 
                    AuditActions.UNAUTHORIZED_ACCESS
                ]
            ][:20]
        }
        
        return summary
        
    except Exception as e:
        print(f"Error generating system activity summary: {e}")
        return {}


# Context manager for batch audit logging
class AuditContext:
    """Context manager for grouping related audit actions"""
    
    def __init__(self, action_context):
        self.action_context = action_context
        self.actions = []
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Log all actions in the context
        for action_data in self.actions:
            log_audit(**action_data)
    
    def add_action(self, **kwargs):
        """Add an action to be logged when context exits"""
        self.actions.append(kwargs)
