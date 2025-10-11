"""
User Management API Routes
BUAS RBAC Implementation - Segment 5 & 8: User Management Backend with Audit Logging

Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md specifications
"""

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from app.models import User, DeviceAssignment, AuditLog, db, Agency
from app.auth.permissions import require_permission, require_role, can_manage_user
from app.auth.utils import generate_temp_password, validate_password_strength
from app.utils.audit import log_user_management, log_device_action, AuditActions
from datetime import datetime, timedelta
import secrets
import string

user_mgmt_bp = Blueprint('user_mgmt', __name__, url_prefix='/api/users')

@user_mgmt_bp.route('', methods=['GET'])
@login_required
def list_users():
    """List users based on role permissions"""
    # Check if user has permission to view users
    if not current_user.has_permission('view_all_users') and not current_user.has_permission('view_agency_users'):
        return jsonify({'error': 'Unauthorized to view users'}), 403
    
    try:
        # Determine which users to show based on role
        if current_user.role == 'super_super_admin':
            # See all users across all agencies
            users = User.query.all()
        elif current_user.role == 'super_user':
            # See only agency users (excluding super_super_admin)
            users = User.query.filter(
                User.agency_id == current_user.agency_id,
                User.role != 'super_super_admin'
            ).all()
        else:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Apply filters if provided
        role_filter = request.args.get('role')
        status_filter = request.args.get('status', 'active')
        search_term = request.args.get('search', '').strip()
        
        # Filter by role
        if role_filter:
            users = [u for u in users if u.role == role_filter]
        
        # Filter by status
        if status_filter == 'active':
            users = [u for u in users if u.is_active]
        elif status_filter == 'inactive':
            users = [u for u in users if not u.is_active]
        # 'all' shows both active and inactive
        
        # Filter by search term (username)
        if search_term:
            users = [u for u in users if search_term.lower() in u.username.lower()]
        
        # Convert to dict and include additional info
        user_list = []
        for user in users:
            user_data = user.to_dict()
            
            # Add device assignment count for analysts
            if user.role == 'analyst':
                assigned_count = user.assigned_devices.filter_by(is_active=True).count()
                user_data['assigned_devices_count'] = assigned_count
            
            # Add creator info if available
            if user.created_by:
                creator = User.query.get(user.created_by)
                user_data['created_by_username'] = creator.username if creator else 'Unknown'
            
            user_list.append(user_data)
        
        # Sort by creation date (newest first)
        user_list.sort(key=lambda x: x['created_at'], reverse=True)
        
        return jsonify({
            'success': True,
            'users': user_list,
            'total': len(user_list),
            'current_user_role': current_user.role
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve users: {str(e)}'}), 500


@user_mgmt_bp.route('', methods=['POST'])
@login_required
def create_user():
    """Create new user"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        role = data.get('role')
        
        # Validate input
        if not username or not role:
            return jsonify({'error': 'Username and role are required'}), 400
        
        if role not in ['super_user', 'analyst', 'operator']:
            return jsonify({'error': 'Invalid role specified'}), 400
        
        # Validate role creation permissions
        if role == 'super_user' and current_user.role != 'super_super_admin':
            return jsonify({'error': 'Only Super Super Admin can create Super Users'}), 403
        
        if role in ['analyst', 'operator'] and current_user.role not in ['super_super_admin', 'super_user']:
            return jsonify({'error': 'Insufficient permissions to create this role'}), 403
        
        # Check if username already exists
        if User.query.filter_by(username=username).first():
            # Audit failed user creation attempt
            log_user_management(
                action=AuditActions.USER_CREATED,
                target_user_id=None,
                target_username=username,
                new_data={'username': username, 'role': role, 'status': 'failed', 'reason': 'username_exists'},
                success=False,
                error_message='Username already exists'
            )
            return jsonify({'error': 'Username already exists'}), 400
        
        # Generate temporary password
        temp_password = generate_temp_password()
        
        # Determine agency_id
        if current_user.role == 'super_super_admin':
            agency_id = data.get('agency_id', 1)  # Default to BUAS
        else:
            agency_id = current_user.agency_id  # Same agency as creator
        
        # Create user
        new_user = User(
            username=username,
            role=role,
            agency_id=agency_id,
            created_by=current_user.id,
            must_change_password=True
        )
        new_user.set_password(temp_password)
        
        db.session.add(new_user)
        db.session.commit()
        
        # Log user creation
        log_user_management(
            action=AuditActions.USER_CREATED,
            target_user_id=new_user.id,
            target_username=username,
            new_data={'username': username, 'role': role, 'agency_id': agency_id, 'created_by': current_user.username},
            success=True
        )
        
        return jsonify({
            'success': True,
            'user_id': new_user.id,
            'username': username,
            'role': role,
            'temporary_password': temp_password,
            'message': 'User created successfully. Communicate credentials securely.',
            'must_change_password': True
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to create user: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    """Get user details"""
    try:
        target_user = User.query.get(user_id)
        
        if not target_user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check if current user can view this user
        if not can_manage_user(current_user, target_user) and current_user.id != user_id:
            return jsonify({'error': 'Unauthorized to view this user'}), 403
        
        # Get user data with additional details
        user_data = target_user.to_dict(include_sensitive=True)
        
        # Add device assignments if user is analyst
        if target_user.role == 'analyst':
            assignments = target_user.assigned_devices.filter_by(is_active=True).all()
            user_data['assigned_devices'] = [
                {
                    'device_id': assignment.device_id,
                    'assigned_at': assignment.assigned_at.isoformat(),
                    'assigned_by': assignment.assigned_by
                }
                for assignment in assignments
            ]
        
        # Add agency info
        if target_user.agency:
            user_data['agency_name'] = target_user.agency.name
        
        return jsonify({
            'success': True,
            'user': user_data
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve user: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>/reset-password', methods=['POST'])
@login_required
def admin_reset_password(user_id):
    """Admin reset user password"""
    try:
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
        log_user_management(
            action=AuditActions.PASSWORD_RESET,
            target_user_id=target_user.id,
            target_username=target_user.username,
            new_data={'username': target_user.username, 'reset_by': current_user.username},
            success=True
        )
        
        return jsonify({
            'success': True,
            'temporary_password': temp_password,
            'message': 'Password reset successfully. Communicate new password securely.',
            'must_change_password': True
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to reset password: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>/deactivate', methods=['POST'])
@login_required
def deactivate_user(user_id):
    """Deactivate user account"""
    try:
        target_user = User.query.get(user_id)
        
        if not target_user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check permission hierarchy
        if not can_manage_user(current_user, target_user):
            return jsonify({'error': 'Cannot deactivate this user'}), 403
        
        # Prevent self-deactivation
        if target_user.id == current_user.id:
            return jsonify({'error': 'Cannot deactivate your own account'}), 400
        
        # Deactivate user
        target_user.is_active = False
        target_user.deactivated_at = datetime.utcnow()
        target_user.deactivated_by = current_user.id
        
        # Deactivate all device assignments
        DeviceAssignment.query.filter_by(user_id=user_id).update({'is_active': False})
        
        db.session.commit()
        
        # Log deactivation
        log_user_management(
            action=AuditActions.USER_DEACTIVATED,
            target_user_id=target_user.id,
            target_username=target_user.username,
            new_data={'username': target_user.username, 'deactivated_by': current_user.username},
            success=True
        )
        
        return jsonify({
            'success': True,
            'message': 'User deactivated successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to deactivate user: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>/reactivate', methods=['POST'])
@login_required
def reactivate_user(user_id):
    """Reactivate user account"""
    try:
        target_user = User.query.get(user_id)
        
        if not target_user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check permission hierarchy
        if not can_manage_user(current_user, target_user):
            return jsonify({'error': 'Cannot reactivate this user'}), 403
        
        # Reactivate user
        target_user.is_active = True
        target_user.deactivated_at = None
        target_user.deactivated_by = None
        target_user.failed_login_attempts = 0
        target_user.locked_until = None
        
        db.session.commit()
        
        # Log reactivation
        log_user_management(
            action=AuditActions.USER_REACTIVATED,
            target_user_id=target_user.id,
            target_username=target_user.username,
            new_data={'username': target_user.username, 'reactivated_by': current_user.username},
            success=True
        )
        
        return jsonify({
            'success': True,
            'message': 'User reactivated successfully'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to reactivate user: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>/assign-devices', methods=['POST'])
@require_role(['super_super_admin', 'super_user'])
def assign_devices_to_analyst(user_id):
    """Assign devices to analyst"""
    try:
        target_user = User.query.get(user_id)
        
        if not target_user or target_user.role != 'analyst':
            return jsonify({'error': 'User not found or not an analyst'}), 404
        
        # Check if user can manage this analyst
        if not can_manage_user(current_user, target_user):
            return jsonify({'error': 'Cannot manage this user'}), 403
        
        data = request.get_json()
        device_ids = data.get('device_ids', [])
        
        if not isinstance(device_ids, list):
            return jsonify({'error': 'device_ids must be a list'}), 400
        
        # Validate device_ids format
        for device_id in device_ids:
            if not isinstance(device_id, str) or not device_id.strip():
                return jsonify({'error': 'Invalid device ID format'}), 400
        
        # Remove existing assignments for this user
        DeviceAssignment.query.filter_by(user_id=user_id).update({'is_active': False})
        
        # Create new assignments
        new_assignments = []
        for device_id in device_ids:
            device_id = device_id.strip()
            if device_id:  # Skip empty strings
                assignment = DeviceAssignment(
                    user_id=user_id,
                    device_id=device_id,
                    assigned_by=current_user.id,
                    is_active=True
                )
                db.session.add(assignment)
                new_assignments.append(device_id)
        
        db.session.commit()
        
        # Log device assignment
        log_device_action(
            action=AuditActions.DEVICE_ASSIGNED,
            device_id=','.join(new_assignments),
            additional_data={'target_user': target_user.username, 'assigned_by': current_user.username, 'device_count': len(new_assignments)},
            success=True
        )
        
        return jsonify({
            'success': True,
            'assigned_devices': new_assignments,
            'message': f'Successfully assigned {len(new_assignments)} devices to {target_user.username}'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to assign devices: {str(e)}'}), 500


@user_mgmt_bp.route('/<int:user_id>/devices', methods=['GET'])
@login_required
def get_user_devices(user_id):
    """Get devices assigned to a user"""
    try:
        target_user = User.query.get(user_id)
        
        if not target_user:
            return jsonify({'error': 'User not found'}), 404
        
        # Check permissions
        if not can_manage_user(current_user, target_user) and current_user.id != user_id:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get assigned devices
        assignments = target_user.assigned_devices.filter_by(is_active=True).all()
        
        device_list = []
        for assignment in assignments:
            device_list.append({
                'device_id': assignment.device_id,
                'assigned_at': assignment.assigned_at.isoformat(),
                'assigned_by': assignment.assigned_by,
                'assigner_username': assignment.assigner.username if assignment.assigner else 'Unknown'
            })
        
        return jsonify({
            'success': True,
            'user_id': user_id,
            'username': target_user.username,
            'assigned_devices': device_list,
            'total_devices': len(device_list)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve user devices: {str(e)}'}), 500


@user_mgmt_bp.route('/available-devices', methods=['GET'])
@require_role(['super_super_admin', 'super_user'])
def get_available_devices():
    """Get list of devices available for assignment"""
    try:
        # This would typically come from your device registry
        # For now, we'll get unique device IDs from various tables
        from app.models import DeviceInfo, DeviceLocation, DeviceCommand
        
        # Get all known device IDs
        device_ids = set()
        
        # From device_info table
        device_info_ids = db.session.query(DeviceInfo.device_id).distinct().all()
        device_ids.update([d[0] for d in device_info_ids])
        
        # From device_location table
        location_ids = db.session.query(DeviceLocation.device_id).distinct().all()
        device_ids.update([d[0] for d in location_ids])
        
        # From device_commands table
        command_ids = db.session.query(DeviceCommand.device_id).distinct().all()
        device_ids.update([d[0] for d in command_ids])
        
        # Convert to list and sort
        available_devices = sorted(list(device_ids))
        
        # Get assignment counts for each device
        device_list = []
        for device_id in available_devices:
            # Count active assignments for this device
            assignment_count = DeviceAssignment.query.filter_by(
                device_id=device_id,
                is_active=True
            ).count()
            
            # Get device info if available
            device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
            
            device_list.append({
                'device_id': device_id,
                'assignment_count': assignment_count,
                'android_id': device_info.android_id if device_info else None,
                'display_name': device_info.get_display_name() if device_info else device_id,
                'phone_numbers': device_info.get_phone_numbers() if device_info else []
            })
        
        return jsonify({
            'success': True,
            'devices': device_list,
            'total': len(device_list)
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve available devices: {str(e)}'}), 500


@user_mgmt_bp.route('/roles', methods=['GET'])
@login_required
def get_available_roles():
    """Get list of roles that current user can assign"""
    try:
        available_roles = []
        
        if current_user.role == 'super_super_admin':
            available_roles = [
                {'value': 'super_user', 'label': 'Super User', 'description': 'Agency administrator with full control'},
                {'value': 'analyst', 'label': 'Analyst', 'description': 'Data analysis and monitoring of assigned devices'},
                {'value': 'operator', 'label': 'Operator', 'description': 'Recording control without data access'}
            ]
        elif current_user.role == 'super_user':
            available_roles = [
                {'value': 'analyst', 'label': 'Analyst', 'description': 'Data analysis and monitoring of assigned devices'},
                {'value': 'operator', 'label': 'Operator', 'description': 'Recording control without data access'}
            ]
        
        return jsonify({
            'success': True,
            'roles': available_roles,
            'current_user_role': current_user.role
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve roles: {str(e)}'}), 500


@user_mgmt_bp.route('/stats', methods=['GET'])
@require_role(['super_super_admin', 'super_user'])
def get_user_stats():
    """Get user management statistics"""
    try:
        # Base query based on user role
        if current_user.role == 'super_super_admin':
            base_query = User.query
        else:
            base_query = User.query.filter(
                User.agency_id == current_user.agency_id,
                User.role != 'super_super_admin'
            )
        
        # Count by role
        stats = {
            'total_users': base_query.count(),
            'active_users': base_query.filter_by(is_active=True).count(),
            'inactive_users': base_query.filter_by(is_active=False).count(),
            'locked_users': base_query.filter(User.locked_until.isnot(None)).count(),
            'must_change_password': base_query.filter_by(must_change_password=True).count(),
            'by_role': {}
        }
        
        # Count by role
        roles = ['super_user', 'analyst', 'operator']
        if current_user.role == 'super_super_admin':
            roles.append('super_super_admin')
        
        for role in roles:
            count = base_query.filter_by(role=role, is_active=True).count()
            stats['by_role'][role] = count
        
        # Recent activity
        stats['recent_logins'] = base_query.filter(
            User.last_login >= datetime.utcnow() - timedelta(days=7)
        ).count()
        
        return jsonify({
            'success': True,
            'stats': stats
        }), 200
        
    except Exception as e:
        return jsonify({'error': f'Failed to retrieve user stats: {str(e)}'}), 500


# Error handlers for the blueprint
@user_mgmt_bp.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@user_mgmt_bp.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500
