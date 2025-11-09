from flask import Blueprint, request, jsonify, current_app, Response, send_from_directory, send_file
from flask_login import login_required, current_user
from .models import Upload, DeviceLocation, RecordingEvent, DeviceInfo, DeviceCommand, AuditLog, User, SmsMessage, CallLog, DeviceHeartbeat, db
from .device_utils import resolve_to_device_id, validate_identifier_format, get_android_id_for_device
from .auth.permissions import require_permission, require_role, ROLE_PERMISSIONS
from .utils.audit import log_device_action, log_data_access, log_permission_denied, AuditActions
import json
import traceback
# Make tasks import optional
try:
    from .tasks import save_upload_task
    TASKS_AVAILABLE = True
except ImportError:
    TASKS_AVAILABLE = False
    def save_upload_task(task_data, metadata):
        """Fallback function when Celery is not available"""
        print("Warning: Celery not available, skipping background task")
        pass

from datetime import datetime, timedelta
import os

routes = Blueprint('routes', __name__)

def check_device_access(device_id):
    """Check if current user can access the specified device"""
    if not current_user.is_authenticated:
        log_permission_denied('device', device_id, 'user authentication required')
        return False
    
    # Super admins and super users have access to all devices
    if current_user.role in ['super_super_admin', 'super_user', 'operator']:
        log_device_action(AuditActions.DEVICE_ACCESSED, device_id, success=True)
        return True
    
    # Analysts can only access assigned devices
    if current_user.role == 'analyst':
        from .models import DeviceAssignment
        from .device_utils import resolve_to_device_id
        
        # Resolve Android ID to actual device_id for assignment check
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check assignment using both the provided device_id and actual_device_id
        assignment = DeviceAssignment.query.filter(
            DeviceAssignment.user_id == current_user.id,
            DeviceAssignment.is_active == True,
            db.or_(
                DeviceAssignment.device_id == device_id,
                DeviceAssignment.device_id == actual_device_id
            )
        ).first()
        
        if assignment:
            log_device_action(AuditActions.DEVICE_ACCESSED, device_id, success=True)
            return True
        else:
            log_device_action(AuditActions.DEVICE_ACCESS_DENIED, device_id, success=False, error_message='Device not assigned to analyst')
            return False
    
    log_permission_denied('device', device_id, 'role-based access denied')
    return False

def filter_devices_by_access(devices_data):
    """Filter device data based on user access permissions"""
    if not current_user.is_authenticated:
        return []
    
    # Super admins, super users, and operators see all devices
    if current_user.role in ['super_super_admin', 'super_user', 'operator']:
        return devices_data
    
    # Analysts see only assigned devices
    if current_user.role == 'analyst':
        from .models import DeviceAssignment
        assigned_device_ids = [
            assignment.device_id for assignment in 
            DeviceAssignment.query.filter_by(user_id=current_user.id, is_active=True).all()
        ]
        
        if isinstance(devices_data, list):
            # Check both user_id and device_id fields for flexibility
            return [device for device in devices_data 
                   if device.get('device_id') in assigned_device_ids or 
                      device.get('user_id') in assigned_device_ids]
        elif isinstance(devices_data, dict) and 'users' in devices_data:
            # Filter dashboard data format - check user_id field primarily
            filtered_users = [
                user for user in devices_data['users'] 
                if user.get('user_id') in assigned_device_ids or 
                   user.get('device_id') in assigned_device_ids
            ]
            filtered_data = devices_data.copy()
            filtered_data['users'] = filtered_users
            filtered_data['total_users'] = len(filtered_users)
            return filtered_data
    
    return []

def get_device_recording_status(device_id):
    """Get current recording status for a device based on events and commands"""
    try:
        # Get latest recording event
        latest_event = RecordingEvent.query.filter_by(device_id=device_id)\
            .order_by(RecordingEvent.start_date.desc(), RecordingEvent.start_time.desc()).first()
        
        # Get latest pending command
        latest_command = DeviceCommand.query.filter_by(device_id=device_id)\
            .filter(DeviceCommand.status.in_(['pending', 'sent']))\
            .order_by(DeviceCommand.created_at.desc()).first()
        
        # Calculate time since last activity
        now = datetime.utcnow()
        
        # Check device connectivity
        location_age_minutes = 999
        latest_location = DeviceLocation.query.filter_by(device_id=device_id)\
            .order_by(DeviceLocation.date.desc(), DeviceLocation.time.desc()).first()
        if latest_location:
            location_datetime = latest_location.get_datetime_utc()
            location_age_minutes = (now - location_datetime.replace(tzinfo=None)).total_seconds() / 60
        
        # If device is offline (no activity > 7 minutes)
        if location_age_minutes > 7:
            return {
                'status': 'offline',
                'recording_state': 'unknown',
                'can_control': False,
                'last_seen_minutes': int(location_age_minutes),
                'message': f'Device offline ({int(location_age_minutes)} min ago)'
            }
        
        # Check if there's a pending command
        if latest_command:
            command_age_seconds = (now - latest_command.created_at).total_seconds()
            
            # If command is very recent (< 5 seconds), show transitioning state
            if command_age_seconds < 5:
                if latest_command.command == 'start':
                    return {
                        'status': 'starting',
                        'recording_state': 'starting',
                        'can_control': False,
                        'last_seen_minutes': int(location_age_minutes),
                        'message': 'Starting recording...'
                    }
                elif latest_command.command == 'stop':
                    return {
                        'status': 'stopping',
                        'recording_state': 'stopping',
                        'can_control': False,
                        'last_seen_minutes': int(location_age_minutes),
                        'message': 'Stopping recording...'
                    }
            
            # If command is stuck (> 30 seconds), consider it failed
            elif command_age_seconds > 30:
                # Clear stuck command
                latest_command.status = 'timeout'
                db.session.commit()
        
        # Check actual recording state from events
        if latest_event and latest_event.is_active():
            return {
                'status': 'recording',
                'recording_state': 'recording',
                'can_control': True,
                'last_seen_minutes': int(location_age_minutes),
                'message': 'Recording in progress'
            }
        
        # Default: device is idle and ready
        return {
            'status': 'idle',
            'recording_state': 'idle',
            'can_control': True,
            'last_seen_minutes': int(location_age_minutes),
            'message': 'Ready to record'
        }
        
    except Exception as e:
        current_app.logger.error(f"Error getting recording status for device {device_id}: {e}")
        return {
            'status': 'error',
            'recording_state': 'error',
            'can_control': False,
            'last_seen_minutes': 999,
            'message': 'Status check failed'
        }


def get_device_status(device_id):
    """Calculate real-time device status based on events, location, uploads, and heartbeats"""
    try:
        # Get latest location using new date/time structure
        latest_location = DeviceLocation.query.filter_by(device_id=device_id)\
            .order_by(DeviceLocation.date.desc(), DeviceLocation.time.desc()).first()
        
        latest_event = RecordingEvent.query.filter_by(device_id=device_id)\
            .order_by(RecordingEvent.start_date.desc(), RecordingEvent.start_time.desc()).first()
        
        # Also check for recent uploads as a sign of device activity
        latest_upload = Upload.query.filter_by(device_id=device_id)\
            .order_by(Upload.timestamp.desc()).first()
        
        # Fetch device_info for quick heartbeat lookup (DeviceInfo.last_heartbeat)
        device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
        
        now = datetime.utcnow()
        
        # Calculate time differences using new datetime methods
        location_age_minutes = 999  # Default to very old
        if latest_location:
            location_datetime = latest_location.get_datetime_utc()
            location_age_minutes = (now - location_datetime.replace(tzinfo=None)).total_seconds() / 60
        
        event_age_minutes = 999
        if latest_event:
            event_datetime = latest_event.get_start_datetime_utc()
            event_age_minutes = (now - event_datetime.replace(tzinfo=None)).total_seconds() / 60
            
        # Calculate upload age to determine device activity
        upload_age_minutes = 999
        if latest_upload:
            upload_age_minutes = (now - latest_upload.timestamp).total_seconds() / 60
        
        # Calculate heartbeat age using DeviceInfo.last_heartbeat (fast path)
        heartbeat_age_minutes = 999
        if device_info and device_info.last_heartbeat:
            hb_dt = device_info.last_heartbeat
            heartbeat_age_minutes = (now - hb_dt).total_seconds() / 60
        
        # Use the most recent activity (location, upload, heartbeat, or event) for determining connectivity
        most_recent_activity_minutes = min(location_age_minutes, upload_age_minutes, heartbeat_age_minutes)
        
        # Status priority logic
        # 1. Critical: Device offline (no activity in 7+ minutes)
        if most_recent_activity_minutes > 7:
            if latest_event and latest_event.is_active() and event_age_minutes < 15:
                return {
                    'status': 'lost_while_listening',
                    'color': '#f39c12',  # Orange
                    'icon': '⚠️',
                    'text': 'Lost Connection',
                    'last_seen': f"{int(most_recent_activity_minutes)} min ago"
                }
            return {
                'status': 'offline',
                'color': '#f44336',  # Red
                'icon': '🔴',
                'text': 'Offline',
                'last_seen': f"{int(most_recent_activity_minutes)} min ago"
            }
        
        # 2. Active listening state - check if latest event is active
        if latest_event and latest_event.is_active():
            return {
                'status': 'listening',
                'color': '#2196F3',  # Blue
                'icon': '🎧',
                'text': 'Listening',
                'last_seen': f"{int(most_recent_activity_minutes)} min ago"
            }
        
        # 3. Normal online state - device has recent activity (location updates OR uploads)
        # This covers devices with recent location updates or uploads (regardless of recording events)
        if most_recent_activity_minutes <= 7:
            # If device has recording events and they're not active, or no events at all
            if not latest_event or (latest_event and not latest_event.is_active()):
                return {
                    'status': 'online',
                    'color': '#4CAF50',  # Green
                    'icon': '�',
                    'text': 'Online',
                    'last_seen': f"{int(most_recent_activity_minutes)} min ago"
                }
        
        # 4. Unknown state (fallback for edge cases)
        return {
            'status': 'unknown',
            'color': '#f1c40f',  # Yellow
            'icon': '🟡',
            'text': 'Unknown',
            'last_seen': f"{int(most_recent_activity_minutes)} min ago" if most_recent_activity_minutes < 999 else 'Never'
        }
        
    except Exception as e:
        current_app.logger.error(f"Error calculating status for device {device_id}: {e}")
        return {
            'status': 'error',
            'color': '#e74c3c',
            'icon': '❌',
            'text': 'Error',
            'last_seen': 'Unknown'
        }


def check_auth(username, password):
    return username == "admin" and password == "supersecret"


def authenticate():
    return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="Login Required"'})


@routes.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        # Let Flask-CORS handle preflight requests properly
        # Do not manually set CORS headers here
        pass


# ===================== RECORDING CONTROL ENDPOINTS =====================

@routes.route('/api/device/<device_id>/recording/command', methods=['POST'])
@login_required
@require_permission('control_recordings')
def send_recording_command(device_id):
    """Send recording command to a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    """Send recording command to device (start/stop) - supports Android ID"""
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()

        data = request.get_json()
        command = data.get('command', '').lower().strip()
        
        if command not in ['start', 'stop']:
            return jsonify({'error': 'Invalid command. Use "start" or "stop"'}), 400
        
        # Check if device is online and controllable
        recording_status = get_device_recording_status(actual_device_id)
        
        if not recording_status['can_control']:
            return jsonify({
                'error': f'Cannot control device: {recording_status["message"]}',
                'status': recording_status['status']
            }), 400
        
        # Validate command based on current state
        current_state = recording_status['recording_state']
        if command == 'start' and current_state == 'recording':
            return jsonify({
                'error': 'Device is already recording',
                'current_state': current_state
            }), 400
        
        if command == 'stop' and current_state == 'idle':
            return jsonify({
                'error': 'Device is not recording',
                'current_state': current_state
            }), 400
        
        # Clear any existing pending commands for this device
        DeviceCommand.query.filter_by(device_id=actual_device_id)\
            .filter(DeviceCommand.status.in_(['pending', 'sent']))\
            .update({'status': 'cancelled'})
        
        # Create new command
        device_command = DeviceCommand(
            device_id=actual_device_id,
            command=command,
            status='pending',
            created_by='dashboard'
        )
        
        db.session.add(device_command)
        db.session.commit()
        
        # Log recording control action
        if command == 'start':
            log_device_action(AuditActions.RECORDING_START, actual_device_id, success=True, 
                            additional_data={'command_id': device_command.id})
        else:
            log_device_action(AuditActions.RECORDING_STOP, actual_device_id, success=True,
                            additional_data={'command_id': device_command.id})
        
        current_app.logger.info(f"Recording command sent: {command} to {actual_device_id} (via {device_id})")
        
        return jsonify({
            'status': 'success',
            'message': f'Command "{command}" sent to device {actual_device_id}',
            'command_id': device_command.id,
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'command': command,
            'timestamp': device_command.created_at.isoformat()
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error sending recording command to {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/device/<device_id>/recording/status', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_recording_status(device_id):
    """Get recording status for a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    """Get current recording status for a device - supports Android ID"""
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()

        recording_status = get_device_recording_status(actual_device_id)
        
        # Add additional timing information
        latest_event = RecordingEvent.query.filter_by(device_id=actual_device_id)\
            .order_by(RecordingEvent.start_date.desc(), RecordingEvent.start_time.desc()).first()
        
        duration_seconds = None
        if latest_event and latest_event.is_active():
            start_time = latest_event.get_start_datetime_utc()
            duration_seconds = int((datetime.utcnow() - start_time.replace(tzinfo=None)).total_seconds())
        
        return jsonify({
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'recording_status': recording_status,
            'duration_seconds': duration_seconds,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting recording status for {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/recording/batch-command', methods=['POST'])
@login_required
@require_permission('control_recordings')
def send_batch_recording_command():
    """Send recording command to multiple devices"""
    """Send recording command to multiple devices"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()

        data = request.get_json()
        device_ids = data.get('device_ids', [])
        command = data.get('command', '').lower().strip()
        
        if not device_ids:
            return jsonify({'error': 'No device IDs provided'}), 400
        
        if command not in ['start', 'stop']:
            return jsonify({'error': 'Invalid command. Use "start" or "stop"'}), 400
        
        # Filter device IDs based on user access
        accessible_device_ids = [
            device_id for device_id in device_ids 
            if check_device_access(device_id)
        ]
        
        if not accessible_device_ids:
            return jsonify({'error': 'No accessible devices in the request'}), 403
        
        results = []
        
        for device_id in accessible_device_ids:
            try:
                # Check device status
                recording_status = get_device_recording_status(device_id)
                
                if not recording_status['can_control']:
                    results.append({
                        'device_id': device_id,
                        'status': 'failed',
                        'error': recording_status['message']
                    })
                    continue
                
                # Clear existing pending commands
                DeviceCommand.query.filter_by(device_id=device_id)\
                    .filter(DeviceCommand.status.in_(['pending', 'sent']))\
                    .update({'status': 'cancelled'})
                
                # Create new command
                device_command = DeviceCommand(
                    device_id=device_id,
                    command=command,
                    status='pending',
                    created_by='dashboard_batch'
                )
                
                db.session.add(device_command)
                
                results.append({
                    'device_id': device_id,
                    'status': 'success',
                    'command_id': device_command.id
                })
                
            except Exception as device_error:
                current_app.logger.error(f"Error sending command to {device_id}: {device_error}")
                results.append({
                    'device_id': device_id,
                    'status': 'failed',
                    'error': str(device_error)
                })
        
        db.session.commit()
        
        # Calculate successful and failed devices
        successful_devices = [r for r in results if r['status'] == 'success']
        failed_devices = [r for r in results if r['status'] == 'failed']
        
        # Log batch recording action
        if command == 'start':
            log_device_action(AuditActions.BATCH_RECORDING_START, 'batch', success=True,
                            additional_data={
                                'total_devices': len(device_ids),
                                'successful': len(successful_devices),
                                'failed': len(failed_devices),
                                'device_ids': accessible_device_ids
                            })
        else:
            log_device_action(AuditActions.BATCH_RECORDING_STOP, 'batch', success=True,
                            additional_data={
                                'total_devices': len(device_ids),
                                'successful': len(successful_devices), 
                                'failed': len(failed_devices),
                                'device_ids': accessible_device_ids
                            })
        
        return jsonify({
            'status': 'completed',
            'command': command,
            'total_devices': len(device_ids),
            'successful': len(successful_devices),
            'failed': len(failed_devices),
            'results': results,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error in batch recording command: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/command/<path:device_id>', methods=['GET'])
def get_device_command_ios(device_id):
    """Get pending command for device (used by iOS app polling with path parameter)"""
    try:
        # Resolve device_id (could be UUID or android_id)
        from .device_utils import resolve_to_device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Log resolution for debugging
        if actual_device_id != device_id:
            current_app.logger.debug(f"iOS polling - Resolved {device_id} -> {actual_device_id}")
        
        # Check if DeviceCommand table exists by trying to query it
        try:
            # Get the latest pending command
            command_record = DeviceCommand.query.filter_by(device_id=actual_device_id)\
                .filter(DeviceCommand.status == 'pending')\
                .order_by(DeviceCommand.created_at.desc()).first()
            
            if command_record:
                # Mark command as sent
                command_record.status = 'sent'
                command_record.sent_at = datetime.utcnow()
                db.session.commit()
                
                current_app.logger.info(f"iOS Command served to {actual_device_id}: {command_record.command}")
                
                # Return iOS-compatible format with hasCommand and action
                # Note: durationSeconds is included for backward compatibility but iOS now uses
                # continuous recording mode (no auto-stop). Recording continues until 'stop' command.
                return jsonify({
                    'hasCommand': True,
                    'action': command_record.command,  # 'start' or 'stop'
                    'command_id': command_record.id,
                    'durationSeconds': None,  # Not used - iOS uses continuous recording (stops on 'stop' command)
                    'timestamp': command_record.created_at.isoformat()
                }), 200
            
            # No command - return iOS format
            return jsonify({'hasCommand': False, 'action': None}), 200
            
        except Exception as db_error:
            current_app.logger.warning(f"DeviceCommand table issue for iOS: {db_error}")
            return jsonify({'hasCommand': False, 'action': None}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting iOS command for device {device_id}: {e}")
        return jsonify({'hasCommand': False, 'action': None}), 200


@routes.route('/api/command/<int:command_id>/complete', methods=['POST'])
def complete_device_command(command_id):
    """Mark a command as completed (used by iOS app after executing command)"""
    try:
        data = request.get_json() or {}
        device_id = data.get('device_id')
        
        current_app.logger.info(f"📋 Command completion request - ID: {command_id}, Device: {device_id}")
        
        # Get the command
        command_record = DeviceCommand.query.get(command_id)
        
        if not command_record:
            current_app.logger.warning(f"❌ Command {command_id} not found")
            return jsonify({'success': False, 'error': 'Command not found'}), 404
        
        # Verify device_id matches if provided
        if device_id:
            from .device_utils import resolve_to_device_id
            actual_device_id = resolve_to_device_id(device_id)
            if command_record.device_id != actual_device_id:
                current_app.logger.warning(f"❌ Device ID mismatch - Command: {command_record.device_id}, Provided: {actual_device_id}")
                return jsonify({'success': False, 'error': 'Device ID mismatch'}), 403
        
        # Mark command as executed/completed
        command_record.status = 'executed'
        command_record.executed_at = datetime.utcnow()
        db.session.commit()
        
        current_app.logger.info(f"✅ Command {command_id} marked as executed for device {command_record.device_id}")
        
        return jsonify({
            'success': True,
            'message': 'Command marked as completed',
            'command_id': command_id
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"❌ Error completing command {command_id}: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@routes.route('/api/command', methods=['GET'])
def get_device_command():
    """Get pending command for device (used by Android app polling with query parameter)"""
    try:
        # Android sends android_id as device_id parameter, need to resolve to actual device_id
        identifier = request.args.get('device_id')
        if not identifier:
            return jsonify({'command': 'idle'}), 200
        
        # Resolve android_id to device_id (Android sends android_id but we store device_id in sessions)
        from .device_utils import resolve_to_device_id
        device_id = resolve_to_device_id(identifier)
        
        # Log resolution for debugging
        if device_id != identifier:
            current_app.logger.debug(f"Resolved {identifier} (android_id) -> {device_id} (device_id) for command polling")
        
        # Check if DeviceCommand table exists by trying to query it
        try:
            # Get the latest pending command
            command_record = DeviceCommand.query.filter_by(device_id=device_id)\
                .filter(DeviceCommand.status == 'pending')\
                .order_by(DeviceCommand.created_at.desc()).first()
            
            if command_record:
                # Mark command as sent
                command_record.status = 'sent'
                command_record.sent_at = datetime.utcnow()
                db.session.commit()
                
                current_app.logger.info(f"Command served to {device_id}: {command_record.command}")
                
                return jsonify({
                    'command': command_record.command,
                    'command_id': command_record.id,
                    'timestamp': command_record.created_at.isoformat()
                }), 200
            
            # Check for pending file download requests
            from .models import FileDownloadRequest
            file_download_request = FileDownloadRequest.query.filter_by(
                device_id=device_id,
                request_status='pending'
            ).order_by(FileDownloadRequest.created_at.asc()).first()
            
            if file_download_request:
                # Mark request as in progress
                file_download_request.request_status = 'downloading'
                db.session.commit()
                
                current_app.logger.info(f"File download command served to {device_id}: {file_download_request.file_path}")
                
                return jsonify({
                    'command': 'download_file',
                    'file_path': file_download_request.file_path,
                    'file_name': file_download_request.file_name,
                    'request_id': file_download_request.id,
                    'timestamp': file_download_request.created_at.isoformat()
                }), 200
            
            # Check for pending live stream requests
            from .models import LiveStreamSession
            from .device_utils import get_android_id_for_device
            
            # First, try to find session with resolved device_id
            stream_session = LiveStreamSession.query.filter_by(
                device_id=device_id,
                status='requested'
            ).order_by(LiveStreamSession.start_time.desc()).first()
            
            # If not found, check if session was created with android_id as device_id
            # (This handles the case where frontend uses android_id in URL)
            if not stream_session:
                android_id = get_android_id_for_device(device_id)
                if android_id:
                    # Check for session with android_id as device_id
                    stream_session = LiveStreamSession.query.filter_by(
                        device_id=android_id,
                        status='requested'
                    ).order_by(LiveStreamSession.start_time.desc()).first()
                    if stream_session:
                        current_app.logger.info(f"Found session with android_id as device_id: {android_id} -> session {stream_session.id}")
            
            if stream_session:
                current_app.logger.info(f"Stream start command served to {device_id} (from {identifier}): session {stream_session.id}")
                
                return jsonify({
                    'command': 'stream_start',
                    'session_id': stream_session.id,
                    'timestamp': stream_session.start_time.isoformat()
                }), 200
            
            # No pending commands
            return jsonify({'command': 'idle'}), 200
            
        except Exception as db_error:
            # DeviceCommand table might not exist yet - create it
            current_app.logger.warning(f"DeviceCommand table issue, creating table: {db_error}")
            try:
                db.create_all()
                current_app.logger.info("DeviceCommand table created successfully")
                return jsonify({'command': 'idle'}), 200
            except Exception as create_error:
                current_app.logger.error(f"Failed to create DeviceCommand table: {create_error}")
                return jsonify({'command': 'idle'}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting command for device: {e}")
        return jsonify({'command': 'idle'}), 200


# ===================== API ROUTES =====================

@routes.route('/api/upload/audio/<device_id>', methods=['POST'])
def upload_audio(device_id):
    try:
        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'No file provided'}), 400

        if not file.filename:
            return jsonify({'error': 'No filename provided'}), 400

        platform = request.form.get('platform')
        if platform:
            try:
                device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
                if device_info and hasattr(device_info, 'platform'):
                    device_info.platform = platform
                    device_info.updated_at = datetime.utcnow()
                    db.session.commit()
            except Exception as platform_error:
                current_app.logger.warning(f"Could not update platform for {device_id}: {platform_error}")
                try:
                    db.session.rollback()
                except Exception:
                    pass

        # Ensure upload directory exists
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)

        filename = f"{device_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        filepath = os.path.join(upload_folder, filename)
        
        print(f"Attempting to save file: {filepath}")
        
        # Save the file
        file.save(filepath)
        print(f"File saved successfully: {filepath}")
        
        # Try to save to database, but don't fail if it doesn't work
        try:
            upload = Upload(
                device_id=device_id,
                filename=filename,
                metadata_file=None,
                latitude=None,
                longitude=None
            )
            db.session.add(upload)
            
            # **CRITICAL FIX**: Try to link this audio file to recent recording event
            # Find recent recording events without audio_file_id for this device
            recent_events = (
                RecordingEvent.query
                .filter_by(device_id=device_id)
                .filter(RecordingEvent.audio_file_id.is_(None))
                .filter(RecordingEvent.start_timestamp.isnot(None))
                .order_by(RecordingEvent.start_timestamp.desc())
                .limit(3)  # Check last 3 events
                .all()
            )
            
            # Link to the most recent event within 30 minutes
            upload_time = datetime.now()
            for event in recent_events:
                if event.start_timestamp:
                    time_diff = abs((upload_time - event.start_timestamp).total_seconds())
                    if time_diff <= 1800:  # 30 minutes
                        event.audio_file_id = filename
                        print(f"Linked audio {filename} to recording event {event.id} (time_diff: {time_diff}s)")
                        break
            
            db.session.commit()
            print(f"Successfully saved to database: {device_id} - {filename}")
        except Exception as db_error:
            print(f"Database error (continuing anyway): {db_error}")
            # Don't fail the upload if database save fails
        
        return jsonify({
            'status': 'success',
            'filename': filename,
            'device_id': device_id,
            'timestamp': datetime.now().isoformat(),
            'message': 'File uploaded successfully'
        }), 200
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'Upload failed: {str(e)}',
            'device_id': device_id
        }), 500


@routes.route('/api/upload/metadata/<device_id>', methods=['POST'])
def upload_metadata(device_id):
    """Upload file system metadata from Android device"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Import models
        from .models import FileSystemMetadata, FileSystemTree, db
        
        # Create or update file system metadata
        metadata = FileSystemMetadata.query.filter_by(device_id=device_id).first()
        if not metadata:
            metadata = FileSystemMetadata(device_id=device_id)
            db.session.add(metadata)
        
        # Update metadata
        metadata.total_folders = data.get('total_folders', 0)
        metadata.total_files = data.get('total_files', 0)
        metadata.total_size_bytes = data.get('total_size_bytes', 0)
        metadata.collection_status = 'completed'
        # Handle Android timestamp (milliseconds since epoch)
        android_timestamp = data.get('timestamp')
        if android_timestamp:
            metadata.timestamp = datetime.fromtimestamp(android_timestamp / 1000.0)
        else:
            metadata.timestamp = datetime.utcnow()
        
        # Handle file system tree data
        if 'folders' in data:
            # Clear existing tree data for this device
            FileSystemTree.query.filter_by(device_id=device_id).delete()
            
            # Insert new tree data
            for folder in data['folders']:
                insert_folder_recursive(folder, device_id, None)
        
        if 'files' in data:
            for file_item in data['files']:
                insert_file_item(file_item, device_id, None)
        
        # Calculate folder sizes after inserting all data
        calculate_folder_sizes(device_id)
        
        db.session.commit()
        
        return jsonify({
            'message': 'File system metadata uploaded successfully',
            'device_id': device_id,
            'total_folders': metadata.total_folders,
            'total_files': metadata.total_files
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error uploading file system metadata: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/upload/device-info/<device_id>', methods=['POST'])
def upload_device_info(device_id):
    """
    Upload comprehensive device information including:
    - Android ID
    - Phone numbers  
    - Contacts list
    - Battery information (level, charging status, etc.)
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        platform = data.get('platform')

        # Extract device information
        android_id = data.get('android_id')
        phone_numbers = data.get('phone_numbers', [])
        contacts = data.get('contacts', [])
        
        # Extract battery information (support both field names)
        battery_level = data.get('battery_level') or data.get('battery_percentage')
        is_charging = data.get('is_charging')
        charging_method = data.get('charging_method')
        battery_health = data.get('battery_health')
        battery_temperature = data.get('battery_temperature')
        battery_voltage = data.get('battery_voltage')
        
        # Validate contacts structure (should have name and phone fields)
        validated_contacts = []
        for contact in contacts:
            if isinstance(contact, dict) and 'name' in contact and 'phone' in contact:
                validated_contacts.append({
                    'name': str(contact['name']).strip(),
                    'phone': str(contact['phone']).strip()
                })
            elif isinstance(contact, str):
                # Handle legacy format (just phone numbers)
                validated_contacts.append({
                    'name': 'Unknown',
                    'phone': contact.strip()
                })
        
        # Log the received data
        current_app.logger.info(f"Device info for {device_id}:")
        current_app.logger.info(f"  Android ID: {android_id}")
        current_app.logger.info(f"  Phone Numbers: {len(phone_numbers)} numbers")
        current_app.logger.info(f"  Contacts: {len(validated_contacts)} contacts with names")
        if battery_level is not None:
            current_app.logger.info(f"  🔋 Battery: {battery_level}% (charging: {is_charging})")
        
        # Store or update device info in database
        device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
        
        if device_info:
            # Update existing record
            device_info.android_id = android_id
            device_info.phone_numbers = json.dumps(phone_numbers) if phone_numbers else None
            device_info.contacts = json.dumps(validated_contacts) if validated_contacts else None
            if platform and hasattr(device_info, 'platform'):
                device_info.platform = platform
            
            # Update battery information if provided
            if battery_level is not None:
                device_info.battery_level = battery_level
                device_info.battery_updated_at = datetime.utcnow()
            if is_charging is not None:
                device_info.is_charging = is_charging
            if charging_method:
                device_info.charging_method = charging_method
            if battery_health:
                device_info.battery_health = battery_health
            if battery_temperature is not None:
                device_info.battery_temperature = battery_temperature
            if battery_voltage is not None:
                device_info.battery_voltage = battery_voltage
                
            device_info.updated_at = datetime.utcnow()
        else:
            # Create new record
            device_info = DeviceInfo(
                device_id=device_id,
                android_id=android_id,
                phone_numbers=phone_numbers,
                contacts=validated_contacts,
                battery_level=battery_level,
                is_charging=is_charging,
                charging_method=charging_method,
                battery_health=battery_health,
                battery_temperature=battery_temperature,
                battery_voltage=battery_voltage,
                battery_updated_at=datetime.utcnow() if battery_level is not None else None,
                platform=platform or 'android'
            )
            db.session.add(device_info)
        
        db.session.commit()
        
        response_data = {
            'android_id': bool(android_id),
            'phone_numbers_count': len(phone_numbers),
            'contacts_count': len(validated_contacts)
        }
        
        if battery_level is not None:
            response_data['battery_level'] = battery_level
            response_data['is_charging'] = is_charging
        
        return jsonify({
            'status': 'success',
            'message': 'Device information uploaded successfully',
            'device_id': device_id,
            'data_received': response_data
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error uploading device info for {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/upload/device-info/battery/<device_id>', methods=['POST'])
def upload_battery_status(device_id):
    """
    Upload battery status information for a device
    Expected data:
    - battery_level: 0-100
    - is_charging: boolean
    - charging_method: string ('AC', 'USB', 'Wireless', 'Not charging')
    - battery_health: string ('Good', 'Overheat', 'Dead', etc.)
    - battery_temperature: integer (Celsius)
    - battery_voltage: integer (mV)
    """
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        platform = data.get('platform')
            
        # Extract battery information
        battery_level = data.get('battery_level')
        is_charging = data.get('is_charging', False)
        charging_method = data.get('charging_method', 'Unknown')
        battery_health = data.get('battery_health', 'Unknown')
        battery_temperature = data.get('battery_temperature')
        battery_voltage = data.get('battery_voltage')
        
        # Validate battery level
        if battery_level is not None:
            try:
                battery_level = int(battery_level)
                if not 0 <= battery_level <= 100:
                    return jsonify({'error': 'Battery level must be between 0 and 100'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid battery level format'}), 400
        
        # Log the received data
        current_app.logger.info(f"Battery status for {device_id}:")
        current_app.logger.info(f"  Battery Level: {battery_level}%")
        current_app.logger.info(f"  Is Charging: {is_charging}")
        current_app.logger.info(f"  Charging Method: {charging_method}")
        current_app.logger.info(f"  Battery Health: {battery_health}")
        current_app.logger.info(f"  Temperature: {battery_temperature}°C")
        current_app.logger.info(f"  Voltage: {battery_voltage}mV")
        
        # Get or create device info record
        device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
        
        if device_info:
            # Update existing record
            device_info.update_battery_status(
                battery_level=battery_level,
                is_charging=is_charging,
                charging_method=charging_method,
                battery_health=battery_health,
                battery_temperature=battery_temperature,
                battery_voltage=battery_voltage
            )
            if platform and hasattr(device_info, 'platform'):
                device_info.platform = platform
        else:
            # Create new record with only battery info
            device_info = DeviceInfo(
                device_id=device_id,
                battery_level=battery_level,
                is_charging=is_charging,
                charging_method=charging_method,
                battery_health=battery_health,
                battery_temperature=battery_temperature,
                battery_voltage=battery_voltage,
                platform=platform or 'android'
            )
            device_info.battery_updated_at = datetime.utcnow()
            db.session.add(device_info)
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': 'Battery status uploaded successfully',
            'device_id': device_id,
            'battery_data': {
                'battery_level': battery_level,
                'is_charging': is_charging,
                'charging_method': charging_method,
                'battery_health': battery_health,
                'battery_temperature': battery_temperature,
                'battery_voltage': battery_voltage,
                'updated_at': device_info.battery_updated_at.isoformat() if device_info.battery_updated_at else None
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error uploading battery status for {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/device/<device_id>/extended-info', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_extended_info(device_id):
    """Get extended device information including Android ID and phone numbers"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    """
    Get comprehensive device information including:
    - Android ID
    - Phone numbers  
    - Contacts list
    Supports Android ID lookup
    """
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        device_info = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        
        if not device_info:
            # Return default structure if no data found
            return jsonify({
                'device_id': actual_device_id,
                'requested_identifier': device_id,
                'android_id': None,
                'platform': 'android',
                'phone_numbers': [],
                'contacts': [],
                'battery': {
                    'level': None,
                    'is_charging': None,
                    'charging_method': None,
                    'health': None,
                    'temperature': None,
                    'voltage': None,
                    'last_updated': None,
                    'status': 'Unknown'
                },
                'created_at': None,
                'updated_at': None
            }), 200
            
        response_data = device_info.to_dict()
        response_data['requested_identifier'] = device_id
        
        # Transform battery_status to battery for frontend compatibility
        if 'battery_status' in response_data:
            battery_data = response_data['battery_status']
            response_data['battery'] = {
                'level': battery_data.get('battery_level'),
                'is_charging': battery_data.get('is_charging'),
                'charging_method': battery_data.get('charging_method'),
                'health': battery_data.get('battery_health'),
                'temperature': battery_data.get('battery_temperature'),
                'voltage': battery_data.get('battery_voltage'),
                'last_updated': battery_data.get('battery_updated_at'),
                'status': 'Charging' if battery_data.get('is_charging') else 'Not Charging' if battery_data.get('battery_level') is not None else 'Unknown'
            }
            del response_data['battery_status']  # Remove old format
        
        response_data['platform'] = getattr(device_info, 'platform', 'android')
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching device info for {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/device/<device_id>/contacts', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_contacts(device_id):
    """Get device contacts - supports Android ID"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
        
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        device_info = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        
        if not device_info:
            # Return empty contacts for devices without info
            return jsonify({
                'device_id': actual_device_id,
                'android_id': None,
                'requested_identifier': device_id,
                'contacts': [],
                'count': 0,
                'message': 'Device not synced yet'
            }), 200
        
        contacts = device_info.get_contacts() or []
        
        # Audit contact data access
        log_data_access(
            action=AuditActions.CONTACTS_ACCESSED,
            resource_type='device_contacts',
            resource_id=actual_device_id,
            success=True,
            details={'contact_count': len(contacts), 'requested_identifier': device_id}
        )
        
        return jsonify({
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'contacts': contacts,
            'count': len(contacts)
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching contacts for {device_id}: {e}")
        
        # Audit failed access
        log_data_access(
            action=AuditActions.CONTACTS_ACCESSED,
            resource_type='device_contacts',
            resource_id=device_id,
            success=False,
            error_message=str(e),
            details={'requested_identifier': device_id}
        )
        
        return jsonify({'error': 'Failed to load contacts'}), 500


def handle_sms_retrieval():
    """Handle SMS retrieval for the /upload/sms GET endpoint"""
    try:
        # Get device_id from query parameters
        device_id = request.args.get('device_id')
        if not device_id:
            return jsonify({'error': 'device_id parameter is required'}), 400
        
        # Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check device access for frontend users (if authenticated via session)
        if current_user.is_authenticated:
            if not check_device_access(device_id):
                return jsonify({'error': 'Access denied to this device'}), 403
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Get filter parameters
        date_from = request.args.get('date_from')  # YYYY-MM-DD
        date_to = request.args.get('date_to')      # YYYY-MM-DD
        sender = request.args.get('sender')        # Phone number filter
        search = request.args.get('search')        # Message content search
        status = request.args.get('status')        # 'read' or 'unread'
        
        # Build query for received SMS only
        query = SmsMessage.query.filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        )
        
        # Apply filters
        if date_from:
            try:
                date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(SmsMessage.date >= date_from_dt)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_dt = datetime.strptime(date_to, '%Y-%m-%d')
                # Add 1 day to include the entire date_to day
                date_to_dt = datetime.combine(date_to_dt.date(), datetime.max.time())
                query = query.filter(SmsMessage.date <= date_to_dt)
            except ValueError:
                pass
        
        if sender:
            # Use LIKE for better performance with index
            query = query.filter(SmsMessage.address.like(f'%{sender}%'))
            
        if search:
            # Use LIKE for message search (consider adding full-text search later)
            query = query.filter(SmsMessage.body.like(f'%{search}%'))
            
        if status:
            if status.lower() == 'read':
                query = query.filter(SmsMessage.read == True)
            elif status.lower() == 'unread':
                query = query.filter(SmsMessage.read == False)
        
        # Order by date descending (newest first)
        query = query.order_by(SmsMessage.date.desc())
        
        # Get paginated results
        if per_page > 100:  # Limit max per_page to prevent overload
            per_page = 100
            
        try:
            sms_messages = query.paginate(
                page=page, 
                per_page=per_page, 
                error_out=False
            )
        except Exception as e:
            # If SMS table doesn't exist, return empty response
            current_app.logger.warning(f"SMS table access failed for device {device_id}: {e}")
            return jsonify({
                'device_id': actual_device_id,
                'android_id': get_android_id_for_device(actual_device_id),
                'requested_identifier': device_id,
                'sms_messages': [],
                'pagination': {
                    'page': 1,
                    'per_page': per_page,
                    'total': 0,
                    'pages': 0,
                    'has_next': False,
                    'has_prev': False
                },
                'summary': {
                    'total_messages': 0,
                    'unread_messages': 0,
                    'read_messages': 0,
                    'unique_senders': 0
                },
                'filters_applied': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'sender': sender,
                    'search': search,
                    'status': status
                },
                'message': 'SMS table not available'
            }), 200
        
        # Convert to dictionaries for response
        sms_list = [sms.to_dict(nigerian_display=True) for sms in sms_messages.items]
        
        # Calculate summary statistics - use base query before pagination
        base_query = SmsMessage.query.filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        )
        
        total_count = base_query.count()
        unread_count = base_query.filter(SmsMessage.read == False).count()
        
        # Get unique senders count
        unique_senders = db.session.query(SmsMessage.address).filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        ).distinct().count()
        
        response_data = {
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'sms_messages': sms_list,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': sms_messages.total,
                'pages': sms_messages.pages,
                'has_next': sms_messages.has_next,
                'has_prev': sms_messages.has_prev
            },
            'summary': {
                'total_messages': total_count,
                'unread_messages': unread_count,
                'read_messages': total_count - unread_count,
                'unique_senders': unique_senders
            },
            'filters_applied': {
                'date_from': date_from,
                'date_to': date_to,
                'sender': sender,
                'search': search,
                'status': status
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving SMS for device {device_id}: {e}")
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({'error': f'Failed to load SMS messages: {str(e)}'}), 500


@routes.route('/api/sms', methods=['POST'])
@routes.route('/upload/sms', methods=['POST', 'GET'])  # Android compatibility endpoint
def upload_sms():
    """Upload SMS messages from Android device (received messages only) or retrieve SMS data"""
    try:
        # Support both basic auth (Android app) and session auth (frontend)
        auth = request.authorization
        
        # For GET requests (frontend), check session authentication first
        if request.method == 'GET':
            # Check if user is authenticated via session (frontend)
            if current_user.is_authenticated:
                # Frontend user is authenticated via session
                return handle_sms_retrieval()
            # Fall back to basic auth for Android app or direct API calls
            elif not auth or auth.username != 'admin' or auth.password != 'supersecret':
                current_app.logger.warning(f"Unauthorized SMS GET attempt from {request.remote_addr}")
                return jsonify({'error': 'Authentication required', 'redirect': '/login'}), 401
        
        # For POST requests (Android app), require basic auth
        elif request.method == 'POST':
            if not auth or auth.username != 'admin' or auth.password != 'supersecret':
                current_app.logger.warning(f"Unauthorized SMS POST attempt from {request.remote_addr}")
                return jsonify({'error': 'Unauthorized'}), 401

        # Handle GET request for SMS retrieval
        if request.method == 'GET':
            return handle_sms_retrieval()
        
        # Handle POST request for SMS upload (existing logic)

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Extract required fields
        device_id = data.get('device_id')
        sms_id = data.get('sms_id')
        address = data.get('address')
        body = data.get('body', '')
        date = data.get('date')
        sms_type = data.get('type')
        read = data.get('read', False)
        direction = data.get('direction', 'inbox')

        # Validate required fields
        if not all([device_id, sms_id, address, date]):
            return jsonify({'error': 'Missing required fields: device_id, sms_id, address, date'}), 400

        # Input validation and sanitization - Android-friendly
        if not isinstance(device_id, str) or len(device_id.strip()) == 0 or len(device_id) > 100:
            return jsonify({'error': 'Invalid device_id: must be non-empty string, max 100 chars'}), 400
            
        # Android sends sms_id as either int or string, be flexible
        try:
            sms_id = int(sms_id) if sms_id is not None else 0
            if sms_id <= 0:
                return jsonify({'error': 'Invalid sms_id: must be positive number'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid sms_id: must be numeric'}), 400
            
        if not isinstance(address, str) or len(address.strip()) == 0 or len(address) > 50:
            return jsonify({'error': 'Invalid address: must be non-empty string, max 50 chars'}), 400
            
        if not isinstance(body, str) or len(body) > 10000:  # Reasonable SMS length limit
            return jsonify({'error': 'Invalid body: must be string, max 10000 chars'}), 400

        # *CRITICAL FIX*: Parse date like call logs do
        try:
            if isinstance(date, (int, float)):
                sms_date = datetime.fromtimestamp(date / 1000)  # Android timestamp in milliseconds
            else:
                sms_date = datetime.fromisoformat(str(date))
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid date format'}), 400
            
        # Android may not send type or send it as null - handle gracefully
        if sms_type is not None:
            try:
                sms_type = int(sms_type)
            except (ValueError, TypeError):
                sms_type = 1  # Default to inbox type
        else:
            sms_type = 1  # Default to inbox type
            
        if not isinstance(read, bool):
            # Android might send as string "true"/"false" or 1/0
            if isinstance(read, str):
                read = read.lower() in ['true', '1', 'yes']
            elif isinstance(read, (int, float)):
                read = bool(read)
            else:
                read = False  # Default to unread
            
        # Sanitize inputs - handle Android's escaped content
        device_id = device_id.strip()
        address = address.strip()
        
        # Android escapes quotes and newlines in JSON, unescape them
        if body:
            # Unescape common Android JSON escaping
            body = body.replace('\\\"', '"')  # Unescape quotes
            body = body.replace('\\n', '\n')  # Unescape newlines
            body = body.replace('\\r', '\r')  # Unescape carriage returns
            body = body.replace('\\\\', '\\') # Unescape backslashes (do this last)
            body = body[:10000]  # Truncate if too long

        # Only accept received SMS (inbox direction)
        if direction != 'inbox':
            current_app.logger.info(f"Ignoring SMS from {device_id} - direction: {direction} (only inbox accepted)")
            return jsonify({'message': 'Only received SMS are processed'}), 200

        # Auto-create device info if it doesn't exist (for new Android devices)
        device_exists = DeviceInfo.query.filter_by(device_id=device_id).first()
        if not device_exists:
            # Create new device entry for Android device
            new_device = DeviceInfo(
                device_id=device_id,
                android_id=device_id,  # Use same as device_id for Android
                display_name=f"Android Device ({device_id[:12]}...)",
                phone_number="Unknown",
                updated_at=datetime.utcnow()
            )
            try:
                db.session.add(new_device)
                db.session.commit()
                current_app.logger.info(f"Auto-created device entry for {device_id}")
            except Exception as e:
                current_app.logger.warning(f"Could not auto-create device {device_id}: {e}")
                db.session.rollback()

        # Check if SMS already exists (prevent duplicates)
        existing_sms = SmsMessage.query.filter_by(
            device_id=device_id,
            sms_id=sms_id
        ).first()

        if existing_sms:
            current_app.logger.info(f"SMS {sms_id} from {device_id} already exists")
            return jsonify({'message': 'SMS already exists'}), 200

        # Create new SMS record with parsed date
        sms_message = SmsMessage(
            device_id=device_id,
            sms_id=sms_id,
            address=address,
            body=body,
            date=sms_date,  # Use parsed date instead of raw date
            type=sms_type,
            read=read,
            direction=direction
        )

        db.session.add(sms_message)
        db.session.commit()

        current_app.logger.info(f"SMS uploaded successfully: {device_id} from {address}")
        
        return jsonify({
            'message': 'SMS uploaded successfully',
            'sms_id': sms_id,
            'device_id': device_id
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error uploading SMS: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/device/<device_id>/sms', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_sms_frontend(device_id):
    """Get SMS for a specific device (frontend route)"""
    return get_device_sms(device_id)

@routes.route('/api/device/<device_id>/sms', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_sms(device_id):
    """Get SMS messages for a specific device (received messages only)"""
    try:
        current_app.logger.info(f"SMS request for device {device_id} by user {current_user.id if current_user.is_authenticated else 'anonymous'}")
        
        # Check device access for analysts
        if not check_device_access(device_id):
            current_app.logger.warning(f"Access denied to SMS for device {device_id}")
            return jsonify({'error': 'Access denied to this device'}), 403
            
        current_app.logger.info(f"Device access check passed for {device_id}")
        
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        current_app.logger.info(f"Resolved {device_id} to actual device ID: {actual_device_id}")
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Get filter parameters
        date_from = request.args.get('date_from')  # YYYY-MM-DD
        date_to = request.args.get('date_to')      # YYYY-MM-DD
        sender = request.args.get('sender')        # Phone number filter
        search = request.args.get('search')        # Message content search
        status = request.args.get('status')        # 'read' or 'unread'
        
        # Build query for received SMS only
        query = SmsMessage.query.filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        )
        
        # Apply filters
        if date_from:
            try:
                date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(SmsMessage.date >= date_from_dt)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_dt = datetime.strptime(date_to, '%Y-%m-%d')
                # Add 1 day to include the entire date_to day
                date_to_dt = datetime.combine(date_to_dt.date(), datetime.max.time())
                query = query.filter(SmsMessage.date <= date_to_dt)
            except ValueError:
                pass
        
        if sender:
            # Use LIKE for better performance with index
            query = query.filter(SmsMessage.address.like(f'%{sender}%'))
            
        if search:
            # Use LIKE for message search (consider adding full-text search later)
            query = query.filter(SmsMessage.body.like(f'%{search}%'))
            
        if status:
            if status.lower() == 'read':
                query = query.filter(SmsMessage.read == True)
            elif status.lower() == 'unread':
                query = query.filter(SmsMessage.read == False)
        
        # Order by date descending (newest first)
        query = query.order_by(SmsMessage.date.desc())
        
        # Get paginated results
        if per_page > 100:  # Limit max per_page to prevent overload
            per_page = 100
            
        try:
            sms_messages = query.paginate(
                page=page, 
                per_page=per_page, 
                error_out=False
            )
        except Exception as e:
            # If SMS table doesn't exist, return empty response
            current_app.logger.warning(f"SMS table access failed for device {device_id}: {e}")
            return jsonify({
                'device_id': actual_device_id,
                'android_id': get_android_id_for_device(actual_device_id),
                'requested_identifier': device_id,
                'sms_messages': [],
                'pagination': {
                    'page': 1,
                    'per_page': per_page,
                    'total': 0,
                    'pages': 0,
                    'has_next': False,
                    'has_prev': False
                },
                'summary': {
                    'total_messages': 0,
                    'unread_messages': 0,
                    'read_messages': 0,
                    'unique_senders': 0
                },
                'filters_applied': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'sender': sender,
                    'search': search,
                    'status': status
                },
                'message': 'SMS table not available'
            }), 200
        
        # Convert to dictionaries for response
        sms_list = [sms.to_dict(nigerian_display=True) for sms in sms_messages.items]
        
        # Calculate summary statistics - use base query before pagination
        base_query = SmsMessage.query.filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        )
        
        total_count = base_query.count()
        unread_count = base_query.filter(SmsMessage.read == False).count()
        
        # Get unique senders count
        unique_senders = db.session.query(SmsMessage.address).filter(
            SmsMessage.device_id == actual_device_id,
            SmsMessage.direction == 'inbox'
        ).distinct().count()
        
        # Audit SMS data access
        log_data_access(
            action=AuditActions.DATA_ACCESSED,
            resource_type='device_sms',
            resource_id=actual_device_id,
            success=True,
            details={
                'sms_count': len(sms_list),
                'total_sms': total_count,
                'page': page,
                'per_page': per_page,
                'filters': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'sender': sender,
                    'search': search,
                    'status': status
                },
                'requested_identifier': device_id
            }
        )
        
        response_data = {
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'sms_messages': sms_list,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': sms_messages.total,
                'pages': sms_messages.pages,
                'has_next': sms_messages.has_next,
                'has_prev': sms_messages.has_prev
            },
            'summary': {
                'total_messages': total_count,
                'unread_messages': unread_count,
                'read_messages': total_count - unread_count,
                'unique_senders': unique_senders
            },
            'filters_applied': {
                'date_from': date_from,
                'date_to': date_to,
                'sender': sender,
                'search': search,
                'status': status
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching SMS for device {device_id}: {e}")
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Audit failed access
        log_data_access(
            action=AuditActions.DATA_ACCESSED,
            resource_type='device_sms',
            resource_id=device_id,
            success=False,
            error_message=str(e),
            details={'requested_identifier': device_id, 'traceback': traceback.format_exc()}
        )
        
        return jsonify({'error': f'Failed to load SMS messages: {str(e)}'}), 500


def handle_call_logs_retrieval():
    """Handle call logs retrieval for the /upload/call GET endpoint"""
    try:
        # Get device_id from query parameters
        device_id = request.args.get('device_id')
        if not device_id:
            return jsonify({'error': 'device_id parameter is required'}), 400
        
        # Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check device access for frontend users (if authenticated via session)
        if current_user.is_authenticated:
            if not check_device_access(device_id):
                return jsonify({'error': 'Access denied to this device'}), 403
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Get filter parameters
        date_from = request.args.get('date_from')  # YYYY-MM-DD
        date_to = request.args.get('date_to')      # YYYY-MM-DD
        number = request.args.get('number')        # Phone number filter
        call_type = request.args.get('type')       # incoming, outgoing, missed
        min_duration = request.args.get('min_duration', type=int)  # Minimum duration in seconds
        
        # Build query
        query = CallLog.query.filter(CallLog.device_id == actual_device_id)
        
        # Apply filters
        if date_from:
            try:
                date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(CallLog.call_date >= date_from_dt)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_dt = datetime.strptime(date_to, '%Y-%m-%d')
                date_to_dt = datetime.combine(date_to_dt.date(), datetime.max.time())
                query = query.filter(CallLog.call_date <= date_to_dt)
            except ValueError:
                pass
        
        if number:
            query = query.filter(CallLog.phone_number.like(f'%{number}%'))
            
        if call_type and call_type in ['incoming', 'outgoing', 'missed']:
            query = query.filter(CallLog.call_type == call_type)
            
        if min_duration is not None and min_duration >= 0:
            query = query.filter(CallLog.duration >= min_duration)
        
        # Order by date descending (newest first)
        query = query.order_by(CallLog.call_date.desc())
        
        # Get paginated results
        if per_page > 100:  # Limit max per_page
            per_page = 100
            
        try:
            # Debug: Log the query and parameters
            current_app.logger.info(f"Call logs query for device {actual_device_id}: page={page}, per_page={per_page}")
            current_app.logger.info(f"Query filter: device_id == {actual_device_id}")
            
            call_logs = query.paginate(
                page=page, 
                per_page=per_page, 
                error_out=False
            )
        except Exception as e:
            # If call logs table doesn't exist, return empty response
            current_app.logger.warning(f"Call logs table access failed for device {device_id}: {e}")
            current_app.logger.error(f"Call logs paginate error details: {str(e)}")
            import traceback
            current_app.logger.error(f"Call logs paginate traceback: {traceback.format_exc()}")
            return jsonify({
                'device_id': actual_device_id,
                'android_id': get_android_id_for_device(actual_device_id),
                'requested_identifier': device_id,
                'call_logs': [],
                'pagination': {
                    'page': 1,
                    'per_page': per_page,
                    'total': 0,
                    'pages': 0,
                    'has_next': False,
                    'has_prev': False
                },
                'summary': {
                    'total_calls': 0,
                    'incoming_calls': 0,
                    'outgoing_calls': 0,
                    'missed_calls': 0,
                    'total_duration': 0,
                    'unique_numbers': 0
                },
                'filters_applied': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'number': number,
                    'type': call_type,
                    'min_duration': min_duration
                },
                'message': 'Call logs table not available'
            }), 200
        
        # Convert to dictionaries for response
        call_logs_list = [call.to_dict() for call in call_logs.items]
        
        # Calculate summary statistics
        base_query = CallLog.query.filter(CallLog.device_id == actual_device_id)
        
        total_count = base_query.count()
        incoming_count = base_query.filter(CallLog.call_type == 'incoming').count()
        outgoing_count = base_query.filter(CallLog.call_type == 'outgoing').count()
        missed_count = base_query.filter(CallLog.call_type == 'missed').count()
        
        # Calculate total duration
        total_duration = db.session.query(db.func.sum(CallLog.duration)).filter(
            CallLog.device_id == actual_device_id
        ).scalar() or 0
        
        # Get unique numbers count
        unique_numbers = db.session.query(CallLog.phone_number).filter(
            CallLog.device_id == actual_device_id
        ).distinct().count()
        
        response_data = {
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'call_logs': call_logs_list,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': call_logs.total,
                'pages': call_logs.pages,
                'has_next': call_logs.has_next,
                'has_prev': call_logs.has_prev
            },
            'summary': {
                'total_calls': total_count,
                'incoming_calls': incoming_count,
                'outgoing_calls': outgoing_count,
                'missed_calls': missed_count,
                'total_duration': total_duration,
                'unique_numbers': unique_numbers
            },
            'filters_applied': {
                'date_from': date_from,
                'date_to': date_to,
                'number': number,
                'type': call_type,
                'min_duration': min_duration
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error retrieving call logs for device {device_id}: {e}")
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({'error': f'Failed to load call logs: {str(e)}'}), 500


@routes.route('/upload/call', methods=['POST', 'GET'])
def upload_call_logs_android():
    """Upload call logs from Android device or retrieve call logs data"""
    try:
        # Support both basic auth (Android app) and session auth (frontend)
        auth = request.authorization
        
        # For GET requests (frontend), check session authentication first
        if request.method == 'GET':
            # Check if user is authenticated via session (frontend)
            if current_user.is_authenticated:
                # Frontend user is authenticated via session
                return handle_call_logs_retrieval()
            # Fall back to basic auth for Android app or direct API calls
            elif not auth or auth.username != 'admin' or auth.password != 'supersecret':
                current_app.logger.warning(f"Unauthorized call logs GET attempt from {request.remote_addr}")
                return jsonify({'error': 'Authentication required', 'redirect': '/login'}), 401
        
        # For POST requests (Android app), require basic auth
        elif request.method == 'POST':
            if not auth or auth.username != 'admin' or auth.password != 'supersecret':
                current_app.logger.warning(f"Unauthorized call logs POST attempt from {request.remote_addr}")
                return jsonify({'error': 'Unauthorized'}), 401

        # Handle GET request for call logs retrieval
        if request.method == 'GET':
            return handle_call_logs_retrieval()

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Debug: Log the received data to understand the Android format
        current_app.logger.info(f"Call log data received from Android: {data}")

        # Extract fields - handle both Android DataCollectionManager format and individual call log format
        device_id = data.get('device_id')
        
        # Handle Android DataCollectionManager format (sends "number", "name", "type", "date")
        # vs individual call log format (sends "phone_number", "contact_name", "call_type", "call_date")
        phone_number = data.get('phone_number') or data.get('number')
        contact_name = data.get('contact_name') or data.get('name', '')
        call_type = data.get('call_type') or data.get('type')
        call_date = data.get('call_date') or data.get('date')
        
        # Generate call_id if not provided (Android DataCollectionManager doesn't send this)
        call_id = data.get('call_id')
        if not call_id and call_date:
            # Use the date timestamp as call_id if not provided
            try:
                if isinstance(call_date, str):
                    # If it's a formatted date string, convert to timestamp
                    parsed_date = datetime.strptime(call_date, '%Y-%m-%d %H:%M:%S')
                    call_id = str(int(parsed_date.timestamp() * 1000))
                else:
                    call_id = str(call_date)
            except:
                call_id = str(int(datetime.utcnow().timestamp() * 1000))
        
        duration = data.get('duration', 0)
        direction = data.get('direction', 'log')

        # Validate required fields
        if not all([device_id, call_id, phone_number, call_date, call_type]):
            return jsonify({'error': 'Missing required fields: device_id, call_id, phone_number, call_date, call_type'}), 400

        # Input validation
        if not isinstance(device_id, str) or len(device_id.strip()) == 0 or len(device_id) > 100:
            return jsonify({'error': 'Invalid device_id: must be non-empty string, max 100 chars'}), 400

        if not isinstance(call_id, str) or len(call_id.strip()) == 0:
            return jsonify({'error': 'Invalid call_id: must be non-empty string'}), 400

        # Keep call_id as string for database storage (Android sends as string timestamp)
        # Validate it's numeric but keep as string
        try:
            int(call_id)  # Just validate it's numeric
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid call_id: must be numeric string'}), 400

        if not isinstance(phone_number, str) or len(phone_number.strip()) == 0:
            return jsonify({'error': 'Invalid phone_number: must be non-empty string'}), 400

        # Android DataCollectionManager sends: "Incoming", "Outgoing", "Missed", "Unknown" (capitalized)
        # Individual call log format sends: "incoming", "outgoing", "missed", "unknown" (lowercase)
        # Normalize to lowercase for consistency
        if call_type:
            call_type = call_type.lower()
            if call_type not in ['incoming', 'outgoing', 'missed', 'unknown']:
                return jsonify({'error': 'Invalid call_type: must be incoming, outgoing, missed, or unknown'}), 400

        # Parse call_date - handle both Android DataCollectionManager format (formatted string) and timestamp format
        try:
            if isinstance(call_date, str):
                # Check if it's a formatted date string (Android DataCollectionManager format)
                if ' ' in call_date and ':' in call_date:  # Format: "2024-01-01 12:00:00"
                    parsed_date = datetime.strptime(call_date, '%Y-%m-%d %H:%M:%S')
                else:
                    # Android sends timestamp as string
                    timestamp = int(call_date)
                    # Check if it's in milliseconds (> year 2000 in seconds)
                    if timestamp > 946684800000:  # Year 2000 in milliseconds
                        parsed_date = datetime.fromtimestamp(timestamp / 1000)
                    else:
                        parsed_date = datetime.fromtimestamp(timestamp)
            elif isinstance(call_date, (int, float)):
                # Direct timestamp
                if call_date > 946684800000:  # Year 2000 in milliseconds
                    parsed_date = datetime.fromtimestamp(call_date / 1000)
                else:
                    parsed_date = datetime.fromtimestamp(call_date)
            else:
                parsed_date = datetime.fromisoformat(str(call_date))
        except (ValueError, TypeError) as e:
            current_app.logger.error(f"Invalid call_date format: {call_date}, error: {e}")
            return jsonify({'error': f'Invalid call_date format: {call_date}. Expected timestamp string or formatted date'}), 400

        # Validate duration
        try:
            duration_int = int(duration)
            if duration_int < 0:
                duration_int = 0
        except (ValueError, TypeError):
            duration_int = 0

        # Auto-create device info if it doesn't exist
        device_exists = DeviceInfo.query.filter_by(device_id=device_id).first()
        if not device_exists:
            new_device = DeviceInfo(
                device_id=device_id,
                android_id=device_id,
                display_name=f"Android Device ({device_id[:12]}...)",
                phone_number="Unknown",
                updated_at=datetime.utcnow()
            )
            try:
                db.session.add(new_device)
                db.session.commit()
                current_app.logger.info(f"Auto-created device entry for {device_id}")
            except Exception as e:
                current_app.logger.warning(f"Could not auto-create device {device_id}: {e}")
                db.session.rollback()

        # Check if call log already exists (prevent duplicates)
        existing_call = CallLog.query.filter_by(
            device_id=device_id,
            call_id=call_id
        ).first()

        if existing_call:
            current_app.logger.info(f"Call log {call_id} from {device_id} already exists")
            return jsonify({'message': 'Call log already exists'}), 200

        # Create new call log record
        call_log = CallLog(
            device_id=device_id,
            call_id=call_id,
            phone_number=phone_number,
            contact_name=contact_name,
            call_type=call_type,
            call_date=parsed_date,
            duration=duration_int
        )

        db.session.add(call_log)
        db.session.commit()

        current_app.logger.info(f"Call log uploaded successfully: {device_id} - {call_type} {phone_number}")
        
        return jsonify({
            'message': 'Call log uploaded successfully',
            'call_id': call_id,
            'device_id': device_id
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error uploading call log from Android: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/device/<device_id>/call_logs', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_call_logs_frontend(device_id):
    """Get call logs for a specific device (frontend route)"""
    return get_device_call_logs(device_id)

@routes.route('/api/device/<device_id>/call_logs', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_device_call_logs(device_id):
    """Get call logs for a specific device"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
            
        # Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        # Get filter parameters
        date_from = request.args.get('date_from')  # YYYY-MM-DD
        date_to = request.args.get('date_to')      # YYYY-MM-DD
        number = request.args.get('number')        # Phone number filter
        call_type = request.args.get('type')       # incoming, outgoing, missed
        min_duration = request.args.get('min_duration', type=int)  # Minimum duration in seconds
        
        # Build query
        query = CallLog.query.filter(CallLog.device_id == actual_device_id)
        
        # Apply filters
        if date_from:
            try:
                date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(CallLog.call_date >= date_from_dt)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_dt = datetime.strptime(date_to, '%Y-%m-%d')
                date_to_dt = datetime.combine(date_to_dt.date(), datetime.max.time())
                query = query.filter(CallLog.call_date <= date_to_dt)
            except ValueError:
                pass
        
        if number:
            query = query.filter(CallLog.phone_number.like(f'%{number}%'))
            
        if call_type and call_type in ['incoming', 'outgoing', 'missed']:
            query = query.filter(CallLog.call_type == call_type)
            
        if min_duration is not None and min_duration >= 0:
            query = query.filter(CallLog.duration >= min_duration)
        
        # Order by date descending (newest first)
        query = query.order_by(CallLog.call_date.desc())
        
        # Get paginated results
        if per_page > 100:  # Limit max per_page
            per_page = 100
            
        try:
            # Debug: Log the query and parameters
            current_app.logger.info(f"Call logs query for device {actual_device_id}: page={page}, per_page={per_page}")
            current_app.logger.info(f"Query filter: device_id == {actual_device_id}")
            
            call_logs = query.paginate(
                page=page, 
                per_page=per_page, 
                error_out=False
            )
        except Exception as e:
            # If call logs table doesn't exist, return empty response
            current_app.logger.warning(f"Call logs table access failed for device {device_id}: {e}")
            current_app.logger.error(f"Call logs paginate error details: {str(e)}")
            import traceback
            current_app.logger.error(f"Call logs paginate traceback: {traceback.format_exc()}")
            return jsonify({
                'device_id': actual_device_id,
                'android_id': get_android_id_for_device(actual_device_id),
                'requested_identifier': device_id,
                'call_logs': [],
                'pagination': {
                    'page': 1,
                    'per_page': per_page,
                    'total': 0,
                    'pages': 0,
                    'has_next': False,
                    'has_prev': False
                },
                'summary': {
                    'total_calls': 0,
                    'incoming_calls': 0,
                    'outgoing_calls': 0,
                    'missed_calls': 0,
                    'total_duration': 0,
                    'unique_numbers': 0
                },
                'filters_applied': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'number': number,
                    'type': call_type,
                    'min_duration': min_duration
                },
                'message': 'Call logs table not available'
            }), 200
        
        # Convert to dictionaries for response
        call_logs_list = [call.to_dict() for call in call_logs.items]
        
        # Calculate summary statistics
        base_query = CallLog.query.filter(CallLog.device_id == actual_device_id)
        
        total_count = base_query.count()
        incoming_count = base_query.filter(CallLog.call_type == 'incoming').count()
        outgoing_count = base_query.filter(CallLog.call_type == 'outgoing').count()
        missed_count = base_query.filter(CallLog.call_type == 'missed').count()
        
        # Calculate total duration
        total_duration = db.session.query(db.func.sum(CallLog.duration)).filter(
            CallLog.device_id == actual_device_id
        ).scalar() or 0
        
        # Get unique numbers count
        unique_numbers = db.session.query(CallLog.phone_number).filter(
            CallLog.device_id == actual_device_id
        ).distinct().count()
        
        # Audit call logs data access
        log_data_access(
            action=AuditActions.DATA_ACCESSED,
            resource_type='device_call_logs',
            resource_id=actual_device_id,
            success=True,
            details={
                'call_logs_count': len(call_logs_list),
                'total_calls': total_count,
                'page': page,
                'per_page': per_page,
                'filters': {
                    'date_from': date_from,
                    'date_to': date_to,
                    'number': number,
                    'type': call_type,
                    'min_duration': min_duration
                },
                'requested_identifier': device_id
            }
        )
        
        response_data = {
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'call_logs': call_logs_list,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': call_logs.total,
                'pages': call_logs.pages,
                'has_next': call_logs.has_next,
                'has_prev': call_logs.has_prev
            },
            'summary': {
                'total_calls': total_count,
                'incoming_calls': incoming_count,
                'outgoing_calls': outgoing_count,
                'missed_calls': missed_count,
                'total_duration': total_duration,
                'unique_numbers': unique_numbers
            },
            'filters_applied': {
                'date_from': date_from,
                'date_to': date_to,
                'number': number,
                'type': call_type,
                'min_duration': min_duration
            }
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching call logs for device {device_id}: {e}")
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        
        # Audit failed access
        log_data_access(
            action=AuditActions.DATA_ACCESSED,
            resource_type='device_call_logs',
            resource_id=device_id,
            success=False,
            error_message=str(e),
            details={'requested_identifier': device_id, 'traceback': traceback.format_exc()}
        )
        
        return jsonify({'error': f'Failed to load call logs: {str(e)}'}), 500


@routes.route('/api/audio/<device_id>/latest', methods=['GET'])
@login_required
@require_permission('access_audio_data')
def latest_audio(device_id):
    """Get latest audio file for a device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    # Phase 4: Resolve Android ID to device_id
    actual_device_id = resolve_to_device_id(device_id)
    
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()

    latest = (
        Upload.query
        .filter_by(device_id=actual_device_id)
        .order_by(Upload.timestamp.desc())
        .first()
    )

    if not latest:
        return jsonify({'error': 'No recordings found'}), 404

    return jsonify({
        'device_id': actual_device_id,
        'android_id': get_android_id_for_device(actual_device_id),
        'requested_identifier': device_id,
        'filename': latest.filename,
        'url': f"/api/uploads/{latest.filename}"
    })


@routes.route('/api/dashboard-data')
@login_required
@require_permission('view_dashboard')
def api_dashboard_data():
    """Get dashboard data with role-based filtering"""
    try:
        # Try to get data from database
        try:
            uploads = Upload.query.order_by(Upload.timestamp.desc()).all()
        except Exception as db_error:
            print(f"Database error: {db_error}")
            uploads = []

        device_map = {}

        # First, build device map from uploads (existing logic)
        for upload in uploads:
            device_id = upload.device_id
            if device_id not in device_map:
                device_map[device_id] = {
                    'user_id': device_id,
                    'status': 'idle',
                    'location': {
                        'lat': 0.0,  # Default to 0,0 - will be updated with actual location data
                        'lng': 0.0
                    },
                    'session_start': None,
                    'current_session_id': None,
                    'latest_audio': f'/api/uploads/{upload.filename}',
                    'last_seen': upload.timestamp.isoformat(),
                    'latest_timestamp': upload.timestamp,  # Keep track for comparison
                    'uploads': []
                }
            else:
                # Update last_seen if this upload is more recent
                if upload.timestamp > device_map[device_id]['latest_timestamp']:
                    device_map[device_id]['last_seen'] = upload.timestamp.isoformat()
                    device_map[device_id]['latest_audio'] = f'/api/uploads/{upload.filename}'
                    device_map[device_id]['latest_timestamp'] = upload.timestamp
            
            device_map[device_id]['uploads'].append({
                'filename': upload.filename,
                'metadata_file': getattr(upload, 'metadata_file', None) or '',
                'timestamp': upload.timestamp.isoformat()
            })

        # Second, add devices from DeviceLocation table (even if no uploads)
        try:
            all_device_locations = DeviceLocation.query.all()
            for location in all_device_locations:
                device_id = location.device_id
                if device_id not in device_map:
                    # Create new device entry for devices that have location but no uploads
                    device_map[device_id] = {
                        'user_id': device_id,
                        'status': 'idle',
                        'location': {
                            'lat': location.latitude,
                            'lng': location.longitude
                        },
                        'session_start': None,
                        'current_session_id': None,
                        'latest_audio': None,  # No audio files yet
                        'last_seen': location.timestamp.isoformat(),
                        'latest_timestamp': location.timestamp,
                        'uploads': []
                    }
        except Exception as location_error:
            print(f"DeviceLocation query error: {location_error}")

        # Third, add devices from RecordingEvent table (even if no uploads/locations)
        try:
            all_recording_events = RecordingEvent.query.all()
            for event in all_recording_events:
                device_id = event.device_id
                if device_id not in device_map:
                    # Create new device entry for devices that have recording events but no uploads/locations
                    device_map[device_id] = {
                        'user_id': device_id,
                        'status': 'idle',
                        'location': {
                            'lat': event.start_latitude,
                            'lng': event.start_longitude
                        },
                        'session_start': None,
                        'current_session_id': None,
                        'latest_audio': None,  # No audio files yet
                        'last_seen': event.start_timestamp.isoformat(),
                        'latest_timestamp': event.start_timestamp,
                        'uploads': []
                    }
        except Exception as event_error:
            print(f"RecordingEvent query error: {event_error}")

        # Now update all devices with latest location data from DeviceLocation table
        for device_id in device_map.keys():
            latest_location = DeviceLocation.query.filter_by(device_id=device_id)\
                .order_by(DeviceLocation.date.desc(), DeviceLocation.time.desc()).first()
            
            if latest_location:
                # Update with actual location from DeviceLocation table
                device_map[device_id]['location'] = {
                    'lat': latest_location.latitude,
                    'lng': latest_location.longitude
                }
                # Use Nigerian time for display
                nigerian_datetime = latest_location.get_datetime_nigerian()
                device_map[device_id]['latest_location'] = {
                    'lat': latest_location.latitude,
                    'lng': latest_location.longitude,
                    'date': nigerian_datetime.strftime('%Y-%m-%d'),  # WAT
                    'time': nigerian_datetime.strftime('%H:%M:%S'),  # WAT
                    'timezone': 'WAT',
                    'timestamp': nigerian_datetime.isoformat()
                }
                # Update last_seen with location timestamp if it's more recent
                location_datetime_utc = latest_location.get_datetime_utc()
                if location_datetime_utc.replace(tzinfo=None) > device_map[device_id]['latest_timestamp']:
                    device_map[device_id]['last_seen'] = nigerian_datetime.isoformat()
            else:
                # Keep default 0,0 location if no location data exists
                device_map[device_id]['latest_location'] = {
                    'lat': 0.0,
                    'lng': 0.0,
                    'date': None,
                    'time': None,
                    'timezone': 'WAT',
                    'timestamp': None
                }
                
            # Get device status with color coding
            device_status = get_device_status(device_id)
            device_map[device_id]['status'] = device_status['status']
            device_map[device_id]['status_color'] = device_status['color']
            device_map[device_id]['status_icon'] = device_status['icon']
            device_map[device_id]['status_text'] = device_status['text']
            
            # Add recording status for dashboard controls
            recording_status = get_device_recording_status(device_id)
            device_map[device_id]['recording_status'] = recording_status
            
            # Add Android ID, display name, and battery info from DeviceInfo table
            try:
                device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
                device_map[device_id]['android_id'] = device_info.android_id if device_info else None
                device_map[device_id]['display_name'] = device_info.get_display_name() if device_info else device_id
                device_map[device_id]['platform'] = getattr(device_info, 'platform', 'android') if device_info else 'android'
                
                # Add battery information
                if device_info:
                    device_map[device_id]['battery'] = {
                        'level': device_info.battery_level,
                        'is_charging': device_info.is_charging,
                        'charging_method': device_info.charging_method,
                        'health': device_info.battery_health,
                        'temperature': device_info.battery_temperature,
                        'voltage': device_info.battery_voltage,
                        'last_updated': device_info.battery_updated_at.isoformat() if device_info.battery_updated_at else None
                    }
                else:
                    device_map[device_id]['battery'] = None
            except Exception as info_error:
                print(f"DeviceInfo query error for {device_id}: {info_error}")
                device_map[device_id]['android_id'] = None
                device_map[device_id]['display_name'] = device_id
                device_map[device_id]['platform'] = 'android'
                device_map[device_id]['battery'] = None

        # Clean up temporary timestamp field
        for device in device_map.values():
            del device['latest_timestamp']

        users = list(device_map.values())

        # Apply role-based filtering
        dashboard_data = {
            'active_sessions_count': 0,
            'total_users': len(users),
            'connection_status': 'connected',
            'users': users,
            'active_sessions': [],
            'stats': {
                'total_users': len(users),
                'active_sessions': 0,
                'total_recordings': len(uploads)
            },
            'last_updated': datetime.now().isoformat()
        }
        
        # Filter data based on user role
        filtered_data = filter_devices_by_access(dashboard_data)

        return jsonify(filtered_data)
    except Exception as e:
        print(f"Dashboard data error: {e}")
        return jsonify({
            'active_sessions_count': 0,
            'total_users': 0,
            'connection_status': 'error',
            'users': [],
            'active_sessions': [],
            'stats': {
                'total_users': 0,
                'active_sessions': 0,
                'total_recordings': 0
            },
            'error': str(e),
            'last_updated': datetime.now().isoformat()
        }), 500


@routes.route('/api/test-uploads', methods=['GET'])
@login_required
@require_permission('manage_system')
def test_uploads():
    """Test endpoint to verify upload directory and files"""
    try:
        upload_folder = current_app.config['UPLOAD_FOLDER']
        
        if not os.path.exists(upload_folder):
            return jsonify({
                'error': 'Upload folder does not exist',
                'upload_folder': upload_folder
            }), 404
        
        # List all files in upload directory
        files = []
        for filename in os.listdir(upload_folder):
            file_path = os.path.join(upload_folder, filename)
            if os.path.isfile(file_path):
                file_size = os.path.getsize(file_path)
                files.append({
                    'filename': filename,
                    'size': file_size,
                    'url': f'/api/uploads/{filename}'
                })
        
        return jsonify({
            'upload_folder': upload_folder,
            'total_files': len(files),
            'files': files[:10],  # Return first 10 files
            'sample_url': f'{request.host_url}api/uploads/{files[0]["filename"]}' if files else None
        })
        
    except Exception as e:
        current_app.logger.error(f"Error testing uploads: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/uploads/<filename>', methods=['OPTIONS'])
def download_file_options(filename):
    """Handle CORS preflight requests for audio files - Let Flask-CORS handle this"""
    # Flask-CORS will handle preflight requests automatically
    # No manual CORS headers needed
    pass


@routes.route('/api/uploads/<filename>')
@login_required
@require_permission('view_recordings')
def download_file(filename):
    """Serve uploaded audio files with proper CORS and authentication"""
    try:
        # Security: validate filename to prevent directory traversal
        import os
        if '..' in filename or '/' in filename or '\\' in filename:
            return jsonify({'error': 'Invalid filename'}), 400
        
        # Check device access for analysts
        if not check_device_access(filename):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Check if file exists
        upload_folder = current_app.config['UPLOAD_FOLDER']
        file_path = os.path.join(upload_folder, filename)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Serve file with proper headers for audio playback
        response = send_from_directory(upload_folder, filename)
        
        # Log audio data access
        log_data_access(AuditActions.AUDIO_DATA_ACCESSED, 'audio_file', filename, success=True)
        
        # Flask-CORS will handle CORS headers automatically
        # No manual CORS headers needed - this was causing the wildcard '*' conflict
        
        # Add caching headers for better performance
        response.headers['Cache-Control'] = 'public, max-age=3600'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error serving file {filename}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/resolve-audio-file', methods=['POST'])
@login_required
@require_permission('view_recordings')
def resolve_audio_file():
    """Resolve audio file reference to actual filename and URL"""
    try:
        from app.utils.audio_file_resolver import resolve_audio_file
        
        data = request.get_json()
        device_id = data.get('device_id')
        audio_file_id = data.get('audio_file_id')
        start_date = data.get('start_date')
        start_time = data.get('start_time')
        
        if not device_id:
            return jsonify({'error': 'device_id is required'}), 400
        
        # Resolve the audio file
        actual_filename, audio_url = resolve_audio_file(
            device_id=device_id,
            audio_file_id=audio_file_id,
            start_date=start_date,
            start_time=start_time
        )
        
        return jsonify({
            'success': True,
            'actual_filename': actual_filename,
            'audio_url': audio_url,
            'file_exists': actual_filename is not None
        })
        
    except Exception as e:
        current_app.logger.error(f"Error resolving audio file: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })


# ========== PHONE ENDPOINTS (for dual backend architecture) ==========

@routes.route('/api/register', methods=['POST'])
def register_phone():
    """Register a new phone device"""
    data = request.get_json()
    phone_id = data.get('phone_id')
    device_name = data.get('device_name')
    
    if not phone_id:
        return jsonify({'error': 'phone_id is required'}), 400
    
    # Log device registration attempt
    log_device_action(
        action=AuditActions.DEVICE_REGISTERED,
        device_id=phone_id,
        additional_data={
            'device_name': device_name,
            'registration_source': 'mobile_app',
            'user_agent': request.headers.get('User-Agent', 'Unknown')
        },
        success=True
    )

    platform = data.get('platform', 'android')
    android_id = data.get('android_id') or data.get('uuid') or phone_id

    try:
        device_info = DeviceInfo.query.filter_by(device_id=phone_id).first()

        if device_info:
            if android_id:
                device_info.android_id = android_id
            if device_name:
                device_info.display_name = device_name
            if platform and hasattr(device_info, 'platform'):
                device_info.platform = platform
            device_info.updated_at = datetime.utcnow()
        else:
            device_info = DeviceInfo(
                device_id=phone_id,
                android_id=android_id,
                display_name=device_name,
                platform=platform or 'android'
            )
            db.session.add(device_info)

        db.session.commit()
    except Exception as db_error:
        current_app.logger.error(f"Device registration save failed for {phone_id}: {db_error}")
        try:
            db.session.rollback()
        except Exception:
            pass
    
    # For now, just acknowledge registration
    # In a full implementation, you'd store device info in database
    return jsonify({
        'status': 'success',
        'message': f'Phone {phone_id} registered successfully',
        'phone_id': phone_id,
        'device_name': device_name,
        'timestamp': datetime.now().isoformat()
    }), 200


@routes.route('/api/location', methods=['POST'])
def update_location():
    """Update phone location and battery information"""
    data = request.get_json()
    
    # Support both formats: direct fields and nested location object
    phone_id = data.get('phone_id') or data.get('device_id')
    platform = data.get('platform')
    
    # Handle both flat structure and nested location object
    if 'location' in data:
        # Android app format: {"device_id": "...", "location": {"lat": ..., "lng": ...}}
        location_data = data['location']
        latitude = location_data.get('lat')
        longitude = location_data.get('lng')
    else:
        # Direct format: {"phone_id": "...", "latitude": ..., "longitude": ...}
        latitude = data.get('latitude')
        longitude = data.get('longitude')
    
    timestamp = data.get('timestamp')
    
    # Extract battery information (support both field names)
    battery_level = data.get('battery_level') or data.get('battery_percentage')
    is_charging = data.get('is_charging')
    charging_method = data.get('charging_method')
    battery_health = data.get('battery_health')
    battery_temperature = data.get('battery_temperature')
    battery_voltage = data.get('battery_voltage')
    
    if not phone_id or latitude is None or longitude is None:
        return jsonify({'error': 'device_id/phone_id, latitude/location.lat, and longitude/location.lng are required'}), 400
    
    try:
        # Check for duplicate location data (within last 2 minutes for same device and coordinates)
        current_time = datetime.utcnow()
        two_minutes_ago = current_time - timedelta(minutes=2)
        
        existing_location = DeviceLocation.query.filter(
            DeviceLocation.device_id == phone_id,
            DeviceLocation.latitude == latitude,
            DeviceLocation.longitude == longitude,
            DeviceLocation.timestamp >= two_minutes_ago
        ).first()
        
        if existing_location:
            current_app.logger.info(f"Duplicate location data detected for {phone_id} within 2 minutes - skipping insertion")
            return jsonify({
                'status': 'success',
                'message': f'Duplicate location data for device {phone_id} - already exists within 2 minutes',
                'duplicate': True,
                'existing_id': existing_location.id
            }), 200

        # Store location data in DeviceLocation table
        device_location = DeviceLocation(
            device_id=phone_id,
            latitude=latitude,
            longitude=longitude,
            timestamp=current_time
        )
        db.session.add(device_location)
        
        # Update battery information if provided
        if battery_level is not None:
            current_app.logger.info(f"🔋 Location update with battery data for {phone_id}: {battery_level}% (charging: {is_charging})")
            
            # Store or update device info with battery data
            device_info = DeviceInfo.query.filter_by(device_id=phone_id).first()
            
            if device_info:
                # Update existing record with battery info
                device_info.battery_level = battery_level
                device_info.battery_updated_at = datetime.utcnow()
                if is_charging is not None:
                    device_info.is_charging = is_charging
                if charging_method:
                    device_info.charging_method = charging_method
                if battery_health:
                    device_info.battery_health = battery_health
                if battery_temperature is not None:
                    device_info.battery_temperature = battery_temperature
                if battery_voltage is not None:
                    device_info.battery_voltage = battery_voltage
                device_info.updated_at = datetime.utcnow()
                if platform and hasattr(device_info, 'platform'):
                    device_info.platform = platform
            else:
                # Create new record with battery info
                device_info = DeviceInfo(
                    device_id=phone_id,
                    battery_level=battery_level,
                    is_charging=is_charging,
                    charging_method=charging_method,
                    battery_health=battery_health,
                    battery_temperature=battery_temperature,
                    battery_voltage=battery_voltage,
                    battery_updated_at=datetime.utcnow(),
                    platform=platform or 'android'
                )
                db.session.add(device_info)
        
        db.session.commit()
        
        response_data = {
            'status': 'success',
            'message': f'Location updated for phone {phone_id}',
            'phone_id': phone_id,
            'latitude': latitude,
            'longitude': longitude,
            'timestamp': timestamp or datetime.now().isoformat()
        }
        
        if battery_level is not None:
            response_data['battery_level'] = battery_level
            response_data['is_charging'] = is_charging
        
        return jsonify(response_data), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating location/battery for {phone_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/upload-audio', methods=['POST'])
def upload_audio_endpoint():
    """Upload audio file with authentication"""
    auth = request.authorization
    if not auth or not check_auth(auth.username, auth.password):
        return authenticate()
    
    phone_id = request.form.get('phone_id')
    audio_file = request.files.get('audio')
    
    if not phone_id:
        return jsonify({'error': 'phone_id is required'}), 400
    
    if not audio_file:
        return jsonify({'error': 'audio file is required'}), 400
    
    try:
        # Get file size before saving
        audio_file.seek(0, 2)  # Seek to end
        file_size = audio_file.tell()
        audio_file.seek(0)  # Reset to beginning
        
        # Save the audio file
        filename = f"{phone_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{audio_file.filename}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        
        # Ensure upload directory exists
        os.makedirs(current_app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        audio_file.save(filepath)
        
        # Create upload record in database with error handling
        try:
            from . import db
            upload = Upload(
                device_id=phone_id,
                filename=filename,
                metadata_file='',  # Will be updated when metadata is uploaded
                latitude=None,  # Could be extracted from metadata later
                longitude=None
            )
            db.session.add(upload)
            db.session.commit()
        except Exception as db_error:
            print(f"Database error (continuing anyway): {db_error}")
        
        return jsonify({
            'status': 'success',
            'message': 'Audio uploaded successfully',
            'phone_id': phone_id,
            'filename': filename,
            'file_size': file_size,
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({'error': str(e)}), 500


# ========== SESSION MANAGEMENT ENDPOINTS ==========

@routes.route('/api/start-listening/<user_id>', methods=['POST'])
@login_required
@require_permission('control_recordings')
def start_listening(user_id):
    """Start listening session for a user"""
    try:
        # Check device access for analysts (user_id here is device_id in context)
        if not check_device_access(user_id):
            return jsonify({'error': 'Access denied to this device'}), 403
            
        # For now, just acknowledge the start request
        # In a full implementation, you'd update user status in database
        return jsonify({
            'status': 'success',
            'message': f'Started listening for user {user_id}',
            'user_id': user_id,
            'session_id': f'session_{user_id}_{datetime.now().strftime("%Y%m%d_%H%M%S")}',
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        print(f"Start listening error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/stop-listening/<user_id>', methods=['POST'])
@login_required
@require_permission('control_recordings')
def stop_listening(user_id):
    """Stop listening session for a user"""
    try:
        # Check device access for analysts (user_id here is device_id in context)
        if not check_device_access(user_id):
            return jsonify({'error': 'Access denied to this device'}), 403
            
        # For now, just acknowledge the stop request
        # In a full implementation, you'd update user status in database
        return jsonify({
            'status': 'success',
            'message': f'Stopped listening for user {user_id}',
            'user_id': user_id,
            'timestamp': datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        print(f"Stop listening error: {e}")
        return jsonify({'error': str(e)}), 500


# ========== DEVICE DETAIL ENDPOINTS ==========

@routes.route('/api/device/<device_id>/details', methods=['GET'])
@login_required
def get_device_details(device_id):
    """Get detailed information for a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
        
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)

        # Get latest upload for basic device info
        latest_upload = (
            Upload.query
            .filter_by(device_id=actual_device_id)
            .order_by(Upload.timestamp.desc())
            .first()
        )

        # Get latest location using new date/time structure
        latest_location = (
            DeviceLocation.query
            .filter_by(device_id=actual_device_id)
            .order_by(DeviceLocation.date.desc(), DeviceLocation.time.desc())
            .first()
        )

        if not latest_upload and not latest_location:
            return jsonify({'error': 'Device not found'}), 404

        # Determine current location (prefer DeviceLocation over Upload)
        if latest_location:
            current_location = {
                'lat': latest_location.latitude,
                'lng': latest_location.longitude
            }
            last_seen = latest_location.get_datetime_utc().isoformat()
        elif latest_upload and latest_upload.latitude and latest_upload.longitude:
            current_location = {
                'lat': latest_upload.latitude,
                'lng': latest_upload.longitude
            }
            last_seen = latest_upload.timestamp.isoformat()
        else:
            current_location = {'lat': 0.0, 'lng': 0.0}  # Default location
            last_seen = latest_upload.timestamp.isoformat() if latest_upload else None

        device_info_record = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        device_display_name = device_info_record.get_display_name() if device_info_record else actual_device_id
        device_android_id = get_android_id_for_device(actual_device_id)
        device_platform = getattr(device_info_record, 'platform', 'android') if device_info_record else 'android'

        return jsonify({
            'data': {
                'device_id': actual_device_id,
                'android_id': device_android_id,
                'platform': device_platform,
                'display_name': device_display_name,
                'requested_identifier': device_id,
                'status': 'idle',  # You can enhance this based on your logic
                'location': current_location,
                'last_seen': last_seen,
                'total_uploads': Upload.query.filter_by(device_id=device_id).count(),
                'latest_audio': f'/api/uploads/{latest_upload.filename}' if latest_upload else None
            }
        })

    except Exception as e:
        print(f"Get device details error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/location-history', methods=['GET'])
@login_required
def get_device_location_history(device_id):
    """Get location history for a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
        
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)

        # Get optional query parameters for pagination/filtering
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 100, type=int)
        days = request.args.get('days', None, type=int)  # No default limit - show all historical data

        # Calculate date filter only if days parameter is provided
        date_filter = None
        if days is not None:
            from datetime import timedelta
            date_filter = datetime.utcnow() - timedelta(days=days)

        # Query location history
        query = (
            DeviceLocation.query
            .filter_by(device_id=actual_device_id)
        )
        
        # Apply date filter only if specified
        if date_filter is not None:
            query = query.filter(DeviceLocation.timestamp >= date_filter)
            
        locations = query.order_by(DeviceLocation.timestamp.desc()).paginate(page=page, per_page=per_page, error_out=False)

        # Log location data access
        log_data_access(AuditActions.LOCATION_DATA_ACCESSED, 'location_history', actual_device_id, success=True)

        return jsonify({
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'data': [location.to_dict() for location in locations.items],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': locations.total,
                'pages': locations.pages
            }
        })

    except Exception as e:
        print(f"Get device location history error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/debug/data-summary/<device_id>', methods=['GET'])
@login_required
@require_permission('manage_system')
def debug_data_summary(device_id):
    """Debug endpoint to show what data we have for a device"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403

        # Get all data for this device
        uploads = Upload.query.filter_by(device_id=device_id).all()
        recording_events = RecordingEvent.query.filter_by(device_id=device_id).all()
        
        return jsonify({
            'device_id': device_id,
            'uploads': [
                {
                    'id': upload.id,
                    'filename': upload.filename,
                    'timestamp': upload.timestamp.isoformat()
                } for upload in uploads
            ],
            'recording_events': [
                {
                    'id': event.id,
                    'start_timestamp': event.start_timestamp.isoformat() if event.start_timestamp else None,
                    'audio_file_id': event.audio_file_id
                } for event in recording_events
            ],
            'summary': {
                'total_uploads': len(uploads),
                'total_recording_events': len(recording_events),
                'recording_events_with_audio': len([e for e in recording_events if e.audio_file_id])
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/audio-files', methods=['GET'])
@login_required
def get_device_audio_files(device_id):
    """Get audio files for a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
        
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)

        # Get all uploads for this device
        uploads = Upload.query.filter_by(device_id=actual_device_id).order_by(Upload.timestamp.desc()).all()
        
        # Log audio data access
        log_data_access(AuditActions.AUDIO_DATA_ACCESSED, 'audio_files', actual_device_id, success=True)
        
        audio_files = []
        for upload in uploads:
            audio_files.append({
                'filename': upload.filename,
                'timestamp': upload.timestamp.isoformat(),
                'url': f'/api/uploads/{upload.filename}',
                'metadata_file': upload.metadata_file
            })

        return jsonify({
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'audio_files': audio_files,
            'total_files': len(audio_files)
        })

    except Exception as e:
        print(f"Get device audio files error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/recording-events', methods=['GET'])
@login_required
def get_device_recording_events(device_id):
    """Get recording events for a specific device"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
        
    try:
        # Phase 4: Resolve Android ID to device_id
        actual_device_id = resolve_to_device_id(device_id)

        # Get optional query parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 100, type=int)
        days = request.args.get('days', None, type=int)  # No default limit - show all historical data

        # Calculate date filter only if days parameter is provided
        date_filter = None
        if days is not None:
            from datetime import timedelta
            date_filter = datetime.utcnow() - timedelta(days=days)

        # Query recording events
        query = (
            RecordingEvent.query
            .filter_by(device_id=actual_device_id)
        )
        
        # Apply date filter only if specified
        if date_filter is not None:
            query = query.filter(
                db.or_(
                    RecordingEvent.start_timestamp >= date_filter,
                    RecordingEvent.start_date >= date_filter.date()
                )
            )
        
        events = query.order_by(
                RecordingEvent.start_timestamp.desc().nullslast(),
                RecordingEvent.start_date.desc(),
                RecordingEvent.start_time.desc()
            ).paginate(page=page, per_page=per_page, error_out=False)

        # Get available audio uploads for this device to correlate with recording events
        uploads = Upload.query.filter_by(device_id=actual_device_id).all()
        upload_map = {upload.filename: upload for upload in uploads}

        # Enhance events with audio file information
        enhanced_events = []
        for event in events.items:
            event_dict = event.to_dict()
            
            print(f"Processing event {event.id}: audio_file_id = {repr(event.audio_file_id)}")
            
            # If event already has audio_file_id, use it
            if event.audio_file_id and event.audio_file_id.strip():
                event_dict['audio_file_id'] = event.audio_file_id
                print(f"  Using existing audio_file_id: {event.audio_file_id}")
            else:
                # Try to find matching audio file by timestamp correlation
                # Look for upload files that match this device and are close in time
                event_time = event.start_timestamp
                if event_time:
                    matched = False
                    for filename, upload in upload_map.items():
                        time_diff = abs((upload.timestamp - event_time).total_seconds())
                        print(f"  Checking {filename}: time_diff = {time_diff} seconds")
                        # If upload is within 30 minutes of recording start, consider it a match
                        if time_diff <= 1800:  # 30 minutes
                            event_dict['audio_file_id'] = filename
                            print(f"  Matched with {filename} (time_diff: {time_diff}s)")
                            matched = True
                            break
                    if not matched:
                        print(f"  No matching audio file found")
                else:
                    print(f"  No start_timestamp available for correlation")
            
            enhanced_events.append(event_dict)

        # Synthetic events removed - only show real recording events

        print(f"Returning {len(enhanced_events)} events, {len([e for e in enhanced_events if e.get('audio_file_id')])} with audio")

        return jsonify({
            'device_id': actual_device_id,
            'android_id': get_android_id_for_device(actual_device_id),
            'requested_identifier': device_id,
            'data': enhanced_events,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': len(enhanced_events),
                'pages': 1
            }
        })

    except Exception as e:
        print(f"Get device recording events error: {e}")
        return jsonify({'error': str(e)}), 500


# ========== EXTERNAL SOFTWARE DATA ENDPOINTS ==========

@routes.route('/api/external/location', methods=['POST'])
def receive_location_data():
    """Receive location data from external software (accepts old timestamp format and battery data)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        device_id = data.get('device_id')
        timestamp = data.get('timestamp')
        location = data.get('location', {})
        
        # Extract battery information (support both field names)
        battery_level = data.get('battery_level') or data.get('battery_percentage')
        is_charging = data.get('is_charging')
        charging_method = data.get('charging_method')
        battery_health = data.get('battery_health')
        battery_temperature = data.get('battery_temperature')
        battery_voltage = data.get('battery_voltage')
        
        if not device_id or not timestamp or not location.get('lat') or not location.get('lng'):
            return jsonify({
                'error': 'Missing required fields: device_id, timestamp, location.lat, location.lng'
            }), 400

        # Parse timestamp (external software sends old format)
        try:
            timestamp_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except:
            try:
                # Fallback for different timestamp formats
                timestamp_dt = datetime.strptime(timestamp, '%Y-%m-%dT%H:%M:%S.%fZ')
            except:
                timestamp_dt = datetime.utcnow()

        # Check for duplicate location data (within last 2 minutes for same device and coordinates)
        from . import db
        two_minutes_ago = timestamp_dt - timedelta(minutes=2)
        
        existing_location = DeviceLocation.query.filter(
            DeviceLocation.device_id == device_id,
            DeviceLocation.latitude == float(location['lat']),
            DeviceLocation.longitude == float(location['lng']),
            DeviceLocation.timestamp >= two_minutes_ago
        ).first()
        
        if existing_location:
            current_app.logger.info(f"Duplicate location data detected for {device_id} within 2 minutes - skipping insertion")
            return jsonify({
                'status': 'success',
                'message': f'Duplicate location data for device {device_id} - already exists within 2 minutes',
                'duplicate': True,
                'existing_id': existing_location.id
            }), 200

        # Save location to database using new date/time structure
        location_record = DeviceLocation(
            device_id=device_id,
            latitude=location['lat'],
            longitude=location['lng'],
            timestamp=timestamp_dt  # Model will convert this to date/time automatically
        )
        
        db.session.add(location_record)
        
        # Update battery information if provided
        if battery_level is not None:
            current_app.logger.info(f"🔋 External location update with battery data for {device_id}: {battery_level}% (charging: {is_charging})")
            
            # Store or update device info with battery data
            device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
            
            if device_info:
                # Update existing record with battery info
                device_info.battery_level = battery_level
                device_info.battery_updated_at = datetime.utcnow()
                if is_charging is not None:
                    device_info.is_charging = is_charging
                if charging_method:
                    device_info.charging_method = charging_method
                if battery_health:
                    device_info.battery_health = battery_health
                if battery_temperature is not None:
                    device_info.battery_temperature = battery_temperature
                if battery_voltage is not None:
                    device_info.battery_voltage = battery_voltage
                device_info.updated_at = datetime.utcnow()
            else:
                # Create new record with battery info
                device_info = DeviceInfo(
                    device_id=device_id,
                    battery_level=battery_level,
                    is_charging=is_charging,
                    charging_method=charging_method,
                    battery_health=battery_health,
                    battery_temperature=battery_temperature,
                    battery_voltage=battery_voltage,
                    battery_updated_at=datetime.utcnow()
                )
                db.session.add(device_info)
        
        db.session.commit()

        # Log external location data reception
        log_data_access(
            action=AuditActions.LOCATION_DATA_RECEIVED,
            resource_type='location_data',
            resource_id=device_id,
            details={
                'latitude': location['lat'],
                'longitude': location['lng'],
                'timestamp': timestamp,
                'source': 'external_api'
            },
            success=True
        )

        # Return response with both formats for compatibility
        response_data = {
            'status': 'success',
            'message': f'Location data saved for device {device_id}',
            'stored_date': location_record.date.isoformat(),
            'stored_time': location_record.time.isoformat(),
            'nigerian_time': location_record.get_datetime_nigerian().strftime('%Y-%m-%d %H:%M:%S WAT'),
            'utc_time': location_record.get_datetime_utc().strftime('%Y-%m-%d %H:%M:%S UTC')
        }
        
        # Include battery data in response if it was provided
        if battery_level is not None:
            response_data['battery_level'] = battery_level
            response_data['is_charging'] = is_charging
            response_data['charging_method'] = charging_method
        
        return jsonify(response_data), 200

    except Exception as e:
        print(f"Receive location data error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/external/heartbeat', methods=['POST'])
def receive_device_heartbeat():
    """Receive lightweight heartbeat signal when GPS location is unavailable"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        device_id = data.get('device_id')
        timestamp_str = data.get('timestamp')
        reason = data.get('reason', 'unknown')
        
        # Battery information (optional)
        battery_percentage = data.get('battery_percentage')
        battery_charging = data.get('battery_charging')
        battery_status = data.get('battery_status')
        charging_method = data.get('charging_method')
        
        if not device_id:
            return jsonify({'error': 'Missing required field: device_id'}), 400

        # Parse timestamp
        try:
            if timestamp_str:
                timestamp_dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            else:
                timestamp_dt = datetime.utcnow()
        except:
            timestamp_dt = datetime.utcnow()

        # Save heartbeat to database and update device's last_heartbeat for fast lookup
        from . import db
        from .models import DeviceHeartbeat, DeviceInfo

        # Update or create compact last-heartbeat on DeviceInfo (fast lookup)
        device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
        if not device_info:
            device_info = DeviceInfo(device_id=device_id)
            db.session.add(device_info)

        device_info.last_heartbeat = timestamp_dt
        device_info.last_heartbeat_reason = reason
        device_info.updated_at = datetime.utcnow()

        # Insert a history row only if the previous heartbeat is older than threshold
        insert_history = True
        try:
            last_hb = DeviceHeartbeat.query.filter_by(device_id=device_id)\
                .order_by(DeviceHeartbeat.timestamp.desc()).first()
            if last_hb:
                delta = (timestamp_dt - last_hb.timestamp).total_seconds()
                # If last heartbeat was less than 2 minutes ago, skip inserting duplicate history
                if delta >= 0 and delta < (2 * 60):
                    insert_history = False
        except Exception:
            # If any error occurs while checking last heartbeat, fall back to inserting
            insert_history = True

        if insert_history:
            heartbeat = DeviceHeartbeat(
                device_id=device_id,
                timestamp=timestamp_dt,
                reason=reason,
                battery_percentage=battery_percentage,
                battery_charging=battery_charging,
                battery_status=battery_status,
                charging_method=charging_method
            )
            db.session.add(heartbeat)

        db.session.commit()

        current_app.logger.info(f"💓 Heartbeat received from {device_id}: {reason} (history_inserted={insert_history})")

        return jsonify({
            'status': 'success',
            'message': f'Heartbeat received for device {device_id}',
            'timestamp': timestamp_dt.isoformat(),
            'history_inserted': insert_history
        }), 200

    except Exception as e:
        current_app.logger.error(f"Receive heartbeat error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/external/recording-event', methods=['POST'])
def receive_recording_event():
    """Receive recording start/stop events from external software (accepts old timestamp format)"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        device_id = data.get('device_id')
        event_type = data.get('event_type')  # 'recording_start' or 'recording_stop'
        timestamp = data.get('timestamp')
        location = data.get('location', {})
        audio_file_id = data.get('audio_file_id')  # Optional
        
        if not device_id or not event_type or not timestamp or not location.get('lat') or not location.get('lng'):
            return jsonify({
                'error': 'Missing required fields: device_id, event_type, timestamp, location.lat, location.lng'
            }), 400

        # CRITICAL FIX: Resolve device ID consistently like the command endpoint
        actual_device_id = resolve_to_device_id(device_id)

        # Parse timestamp (external software sends old format)
        try:
            timestamp_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        except:
            try:
                # Fallback for different timestamp formats
                timestamp_dt = datetime.strptime(timestamp, '%Y-%m-%dT%H:%M:%S.%fZ')
            except:
                timestamp_dt = datetime.utcnow()

        from . import db

        if event_type == 'recording_start':
            # iOS DUPLICATE FIX: Check if same device sent recording_start in last 3 seconds
            # This prevents duplicate entries when iOS sends recording_start twice
            recent_cutoff = datetime.utcnow() - timedelta(seconds=3)
            recent_start = RecordingEvent.query.filter(
                RecordingEvent.device_id == actual_device_id,
                RecordingEvent.start_timestamp >= recent_cutoff
            ).order_by(RecordingEvent.start_timestamp.desc()).first()
            
            if recent_start:
                # Found recent recording_start within 3 seconds
                # If new event has audio_file_id but old one doesn't, UPDATE the existing one
                if audio_file_id and not recent_start.audio_file_id:
                    current_app.logger.info(f"📝 Updating existing recording event {recent_start.id} with audio_file_id: {audio_file_id}")
                    recent_start.audio_file_id = audio_file_id
                    db.session.commit()
                    
                    return jsonify({
                        'status': 'success',
                        'message': f'Updated existing recording event with audio_file_id',
                        'event_id': recent_start.id,
                        'audio_file_id': audio_file_id,
                        'note': 'Duplicate recording_start prevented - updated existing event'
                    }), 200
                else:
                    # Duplicate with no new information - reject
                    current_app.logger.warning(f"⚠️  Duplicate recording_start ignored for {actual_device_id} (within 3 seconds)")
                    return jsonify({
                        'status': 'success',
                        'message': 'Duplicate recording_start event ignored',
                        'note': 'Recording already started within last 3 seconds'
                    }), 200
            
            # Create new recording event - model will convert timestamp to date/time
            recording_event = RecordingEvent(
                device_id=actual_device_id,
                start_timestamp=timestamp_dt,  # Model will split this automatically
                start_latitude=location['lat'],
                start_longitude=location['lng'],
                audio_file_id=audio_file_id
            )
            
            db.session.add(recording_event)
            db.session.commit()

            # Log recording start event reception
            log_data_access(
                action=AuditActions.RECORDING_EVENT_RECEIVED,
                resource_type='recording_event',
                resource_id=actual_device_id,
                details={
                    'event_type': 'recording_start',
                    'latitude': location['lat'],
                    'longitude': location['lng'],
                    'timestamp': timestamp,
                    'audio_file_id': audio_file_id,
                    'source': 'external_api',
                    'original_device_id': device_id,
                    'resolved_device_id': actual_device_id
                },
                success=True
            )

            return jsonify({
                'status': 'success',
                'message': f'Recording start event saved for device {actual_device_id}',
                'stored_start_date': recording_event.start_date.isoformat(),
                'stored_start_time': recording_event.start_time.isoformat(),
                'nigerian_time': recording_event.get_start_datetime_nigerian().strftime('%Y-%m-%d %H:%M:%S WAT'),
                'original_device_id': device_id,
                'resolved_device_id': actual_device_id
            }), 200

        elif event_type == 'recording_stop':
            # Find the most recent recording event without stop data (using new structure)
            # Use more robust query that checks both stop_date and stop_timestamp for consistency
            recording_event = (
                RecordingEvent.query
                .filter_by(device_id=actual_device_id)
                .filter(
                    db.or_(
                        RecordingEvent.stop_date.is_(None),
                        RecordingEvent.stop_timestamp.is_(None)
                    )
                )
                .order_by(RecordingEvent.start_date.desc(), RecordingEvent.start_time.desc())
                .first()
            )
            
            if recording_event:
                # Update existing event with stop data
                # Use transaction with retry logic to handle race conditions
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        # Refresh the object to get latest state
                        db.session.refresh(recording_event)
                        
                        # Double-check the event is still active (not updated by another process)
                        if recording_event.stop_date is not None or recording_event.stop_timestamp is not None:
                            # Event was already updated by another process, find a different one
                            recording_event = (
                                RecordingEvent.query
                                .filter_by(device_id=actual_device_id)
                                .filter(
                                    db.or_(
                                        RecordingEvent.stop_date.is_(None),
                                        RecordingEvent.stop_timestamp.is_(None)
                                    )
                                )
                                .filter(RecordingEvent.id != recording_event.id)
                                .order_by(RecordingEvent.start_date.desc(), RecordingEvent.start_time.desc())
                                .first()
                            )
                            
                            if not recording_event:
                                # No other active events found, create new one
                                break
                        
                        # Manually set stop timestamp and let the model handle conversion
                        recording_event.stop_timestamp = timestamp_dt
                        # Convert timestamp to date/time for storage
                        import pytz
                        if timestamp_dt.tzinfo is None:
                            timestamp_dt = pytz.utc.localize(timestamp_dt)
                        else:
                            timestamp_dt = timestamp_dt.astimezone(pytz.utc)
                        
                        recording_event.stop_date = timestamp_dt.date()
                        recording_event.stop_time = timestamp_dt.time().replace(microsecond=0)
                        recording_event.stop_latitude = location['lat']
                        recording_event.stop_longitude = location['lng']
                        
                        db.session.commit()
                        break  # Success, exit retry loop
                        
                    except Exception as e:
                        db.session.rollback()
                        if attempt == max_retries - 1:
                            # Last attempt failed, create new event
                            recording_event = None
                            break
                        # Wait briefly before retry
                        import time
                        time.sleep(0.1)

                # Log recording stop event reception
                log_data_access(
                    action=AuditActions.RECORDING_EVENT_RECEIVED,
                    resource_type='recording_event',
                    resource_id=actual_device_id,
                    details={
                        'event_type': 'recording_stop',
                        'latitude': location['lat'],
                        'longitude': location['lng'],
                        'timestamp': timestamp,
                        'source': 'external_api',
                        'original_device_id': device_id,
                        'resolved_device_id': actual_device_id
                    },
                    success=True
                )

                return jsonify({
                    'status': 'success',
                    'message': f'Recording stop event saved for device {actual_device_id}',
                    'stored_stop_date': recording_event.stop_date.isoformat(),
                    'stored_stop_time': recording_event.stop_time.isoformat(),
                    'nigerian_time': recording_event.get_stop_datetime_nigerian().strftime('%Y-%m-%d %H:%M:%S WAT'),
                    'original_device_id': device_id,
                    'resolved_device_id': actual_device_id
                }), 200
            else:
                # NO NEW EVENT CREATION - Only update existing events
                # If no active recording found, this is likely a stop event without a corresponding start
                # We should NOT create a new event, just log the issue and return success
                
                # Log the issue for debugging
                log_data_access(
                    action=AuditActions.RECORDING_EVENT_RECEIVED,
                    resource_type='recording_event',
                    resource_id=actual_device_id,
                    details={
                        'event_type': 'recording_stop_no_active_recording',
                        'latitude': location['lat'],
                        'longitude': location['lng'],
                        'timestamp': timestamp,
                        'note': 'Stop event received but no active recording found - ignoring stop event',
                        'source': 'external_api',
                        'original_device_id': device_id,
                        'resolved_device_id': actual_device_id
                    },
                    success=True
                )

                return jsonify({
                    'status': 'success',
                    'message': f'Recording stop event received for device {actual_device_id} but no active recording found - event ignored',
                    'note': 'No active recording to stop - this stop event was ignored',
                    'original_device_id': device_id,
                    'resolved_device_id': actual_device_id
                }), 200

        else:
            return jsonify({'error': 'Invalid event_type. Must be "recording_start" or "recording_stop"'}), 400

    except Exception as e:
        print(f"Receive recording event error: {e}")
        return jsonify({'error': str(e)}), 500


# ===================== DELETE ENDPOINTS =====================
# DELETE endpoints have been removed for data security and integrity
# All data is now read-only to prevent accidental data loss

# @routes.route('/api/upload/<int:upload_id>', methods=['DELETE'])
# @routes.route('/api/device-location/<int:location_id>', methods=['DELETE']) 
# @routes.route('/api/recording-event/<int:event_id>', methods=['DELETE'])
# DELETE functionality removed - data is now read-only


# ===================== EXTERNAL STORAGE ENDPOINTS =====================

@routes.route('/api/upload/device-data/<device_id>', methods=['POST'])
def upload_device_data(device_id):
    """Upload comprehensive device data from Android app"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Import models
        from .models import FileSystemMetadata, FileSystemTree, DeviceInfo, CallLog, SmsMessage, db
        
        # Handle Android app's comprehensive device data structure
        device_info_data = data.get('device_info', {})
        call_logs_data = data.get('call_logs', [])
        contacts_data = data.get('contacts', [])
        sms_messages_data = data.get('sms_messages', [])
        files_data = data.get('files', [])
        media_data = data.get('media', {})
        app_data = data.get('app_data', {})
        
        # Handle collection timestamp
        collection_timestamp = data.get('collection_timestamp')
        if collection_timestamp:
            collection_dt = datetime.fromtimestamp(collection_timestamp / 1000.0)
        else:
            collection_dt = datetime.utcnow()
        
        # 1. Update device info
        if device_info_data:
            device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
            if not device_info:
                device_info = DeviceInfo(device_id=device_id)
                db.session.add(device_info)
            
            # Update device info fields
            device_info.display_name = device_info_data.get('model', device_id)
            # Store additional device info in contacts field as JSON
            device_info.contacts = json.dumps({
                'manufacturer': device_info_data.get('manufacturer'),
                'model': device_info_data.get('model'),
                'android_version': device_info_data.get('android_version'),
                'api_level': device_info_data.get('api_level'),
                'phone_number': device_info_data.get('phone_number'),
                'storage_info': device_info_data.get('storage_info', {})
            })
        
        # 2. Handle call logs
        if call_logs_data:
            for call_data in call_logs_data:
                # Check if call log already exists
                existing_call = CallLog.query.filter_by(
                    device_id=device_id,
                    call_id=f"{call_data.get('number', '')}_{call_data.get('date', '')}"
                ).first()
                
                if not existing_call:
                    call_log = CallLog(
                        device_id=device_id,
                        call_id=f"{call_data.get('number', '')}_{call_data.get('date', '')}",
                        phone_number=call_data.get('number'),
                        contact_name=call_data.get('name'),
                        call_type=call_data.get('type', '').lower(),
                        call_date=datetime.fromtimestamp(int(call_data.get('date', 0)) / 1000.0) if call_data.get('date') else datetime.utcnow(),
                        duration=int(call_data.get('duration', 0))
                    )
                    db.session.add(call_log)
        
        # 3. Handle SMS messages
        if sms_messages_data:
            for sms_data in sms_messages_data:
                # Check if SMS already exists
                existing_sms = SmsMessage.query.filter_by(
                    device_id=device_id,
                    sms_id=f"{sms_data.get('address', '')}_{sms_data.get('date', '')}"
                ).first()
                
                if not existing_sms:
                    sms_message = SmsMessage(
                        device_id=device_id,
                        sms_id=f"{sms_data.get('address', '')}_{sms_data.get('date', '')}",
                        address=sms_data.get('address'),
                        body=sms_data.get('body', ''),
                        date=datetime.fromtimestamp(int(sms_data.get('date', 0)) / 1000.0) if sms_data.get('date') else datetime.utcnow(),
                        type=1 if sms_data.get('type') == 'Inbox' else 2
                    )
                    db.session.add(sms_message)
        
        # 4. Handle file system metadata and tree
        if files_data or media_data:
            # Create or update file system metadata
            metadata = FileSystemMetadata.query.filter_by(device_id=device_id).first()
            if not metadata:
                metadata = FileSystemMetadata(device_id=device_id)
                db.session.add(metadata)
            
            # Update metadata
            metadata.total_folders = len([f for f in files_data if f.get('is_directory', False)])
            metadata.total_files = len([f for f in files_data if not f.get('is_directory', False)])
            metadata.total_size_bytes = sum(f.get('size', 0) for f in files_data)
            metadata.collection_status = 'completed'
            metadata.timestamp = collection_dt
            
            # Clear existing tree data for this device
            FileSystemTree.query.filter_by(device_id=device_id).delete()
            
            # Insert file system tree data
            for file_item in files_data:
                insert_file_item(file_item, device_id, file_item.get('parent_path'))
            
            # Calculate folder sizes after inserting all data
            calculate_folder_sizes(device_id)
        
        # 5. Handle media data
        if media_data:
            # Add media files to file system tree
            for media_type, media_files in media_data.items():
                if isinstance(media_files, list):
                    for media_file in media_files:
                        file_item = {
                            'name': media_file.get('name', ''),
                            'path': media_file.get('path', ''),
                            'size': media_file.get('size', 0),
                            'is_directory': False,
                            'file_type': media_type.title()
                        }
                        # Let insert_file_item derive parent_path from path
                        insert_file_item(file_item, device_id, None)
        
        # 6. Handle app data (store in device info)
        if app_data and 'installed_apps' in app_data:
            # Store app data in device info
            if device_info_data:
                device_info = DeviceInfo.query.filter_by(device_id=device_id).first()
                if device_info:
                    # Store app data in phone_numbers field as JSON
                    device_info.phone_numbers = json.dumps({
                        'installed_apps': app_data['installed_apps']
                    })
        
        db.session.commit()
        
        return jsonify({
            'message': 'Comprehensive device data uploaded successfully',
            'device_id': device_id,
            'call_logs_count': len(call_logs_data),
            'sms_count': len(sms_messages_data),
            'files_count': len(files_data),
            'media_types': list(media_data.keys()) if media_data else []
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error uploading device data: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/upload/file-system-tree/<device_id>', methods=['POST'])
def upload_file_system_tree(device_id):
    """Upload file system tree structure"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        from .models import FileSystemTree, FileSystemMetadata, db
        
        # Clear existing tree data for this device
        FileSystemTree.query.filter_by(device_id=device_id).delete()
        FileSystemMetadata.query.filter_by(device_id=device_id).delete()
        
        # Store metadata
        metadata = FileSystemMetadata(
            device_id=device_id,
            total_folders=data.get('folder_count', 0),
            total_files=data.get('file_count', 0),
            total_size_bytes=data.get('total_size', 0),
            collection_status='completed'
        )
        db.session.add(metadata)
        
        # Insert new tree data
        if 'folders' in data:
            for folder in data['folders']:
                insert_folder_recursive(folder, device_id, None)
        
        if 'files' in data:
            for file_item in data['files']:
                insert_file_item(file_item, device_id, None)
        
        # Calculate folder sizes after inserting all data
        calculate_folder_sizes(device_id)
        
        db.session.commit()
        
        return jsonify({
            'message': 'File system tree uploaded successfully',
            'device_id': device_id,
            'metadata': {
                'total_folders': metadata.total_folders,
                'total_files': metadata.total_files,
                'total_size_bytes': metadata.total_size_bytes
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error uploading file system tree: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/upload/file', methods=['POST'])
def upload_file_on_demand():
    """Upload file on demand when requested from dashboard"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()
        
        # Handle file upload
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        device_id = request.form.get('device_id')
        file_path = request.form.get('file_path')
        file_size = request.form.get('file_size', 0)
        file_hash = request.form.get('file_hash', '')
        
        if not device_id or not file_path:
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Save file to uploads directory
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)
        
        # Create safe filename
        safe_filename = f"{device_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        filepath = os.path.join(upload_folder, safe_filename)
        
        file.save(filepath)
        
        # Update file system tree with actual file path
        from .models import FileSystemTree, FileDownloadRequest, db
        
        # Find the file in the tree and update with actual path
        file_item = FileSystemTree.query.filter_by(
            device_id=device_id, 
            path=file_path
        ).first()
        
        if file_item:
            file_item.file_hash = file_hash
            file_item.size_bytes = int(file_size) if file_size else 0
        
        # Update existing download request to completed
        existing_download_request = FileDownloadRequest.query.filter_by(
            device_id=device_id,
            file_path=file_path
        ).filter(FileDownloadRequest.request_status.in_(['pending', 'downloading'])).first()
        
        if existing_download_request:
            existing_download_request.request_status = 'completed'
            existing_download_request.completed_at = datetime.utcnow()
            existing_download_request.download_url = f"/api/external-storage/download/{safe_filename}"
            current_app.logger.info(f"File download request completed: {file_path}")
            db.session.commit()
            
            return jsonify({
                'message': 'File uploaded successfully',
                'filename': safe_filename,
                'download_url': f'/api/external-storage/download/{safe_filename}',
                'request_id': existing_download_request.id
            }), 200
        else:
            # Create new download request record if none exists (backward compatibility)
            download_request = FileDownloadRequest(
                device_id=device_id,
                file_path=file_path,
                file_name=file.filename,
                file_size=int(file_size) if file_size else 0,
                request_status='completed',
                download_url=f'/api/external-storage/download/{safe_filename}',
                expires_at=datetime.utcnow() + timedelta(hours=24)  # 24 hour expiration
            )
            db.session.add(download_request)
            db.session.commit()
            
            return jsonify({
                'message': 'File uploaded successfully',
                'filename': safe_filename,
                'download_url': f'/api/external-storage/download/{safe_filename}',
                'expires_at': download_request.expires_at.isoformat()
            }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error uploading file: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/file-system/tree', methods=['OPTIONS'])
def get_file_system_tree_options(device_id):
    """Handle CORS preflight requests for file system tree endpoint"""
    # Flask-CORS will handle the preflight request automatically
    return '', 200

@routes.route('/api/device/<device_id>/file-system/tree', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_file_system_tree(device_id):
    """Get file system tree structure for device"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        from .models import FileSystemTree, FileSystemMetadata
        
        # Get metadata
        metadata = FileSystemMetadata.query.filter_by(device_id=device_id).first()
        
        # Get root level items (items with no parent or parent is root)
        root_items = FileSystemTree.query.filter_by(
            device_id=device_id,
            parent_path=None
        ).order_by(FileSystemTree.is_directory.desc(), FileSystemTree.name.asc()).all()
        
        # Get root level items for common Android root aliases
        alias_roots = ["/sdcard", "/storage/emulated/0"]
        root_items_with_parent = []
        for root_path in alias_roots:
            root_items_with_parent += FileSystemTree.query.filter_by(
                device_id=device_id,
                parent_path=root_path
            ).order_by(FileSystemTree.is_directory.desc(), FileSystemTree.name.asc()).all()
        
        # Combine and sort (deduplicate by path)
        seen_paths = set()
        all_root_items = []
        for item in list(root_items) + list(root_items_with_parent):
            if getattr(item, 'path', None) and item.path in seen_paths:
                continue
            if getattr(item, 'path', None):
                seen_paths.add(item.path)
            all_root_items.append(item)
        all_root_items.sort(key=lambda x: (not x.is_directory, x.name.lower()))
        
        # Format metadata for frontend
        metadata_dict = None
        if metadata:
            # Format file size
            size_formatted = "0 B"
            if metadata.total_size_bytes > 0:
                size_names = ["B", "KB", "MB", "GB", "TB"]
                i = 0
                size_bytes = metadata.total_size_bytes
                while size_bytes >= 1024 and i < len(size_names) - 1:
                    size_bytes /= 1024.0
                    i += 1
                size_formatted = f"{size_bytes:.1f} {size_names[i]}"
            
            metadata_dict = {
                'total_files': metadata.total_files,
                'total_folders': metadata.total_folders,
                'total_size_formatted': size_formatted,
                'timestamp': metadata.timestamp.isoformat() if metadata.timestamp else None
            }
        
        return jsonify({
            'metadata': metadata_dict,
            'root_items': [item.to_dict() for item in all_root_items]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting file system tree: {e}")
        return jsonify({'error': str(e)}), 500



@routes.route('/api/device/<device_id>/file-system/folder/<path:folder_path>', methods=['OPTIONS'])
def get_folder_contents_options(device_id, folder_path):
    """Handle CORS preflight requests for folder contents endpoint"""
    # Flask-CORS will handle the preflight request automatically
    return '', 200


@routes.route('/api/device/<device_id>/file-system/folder/<path:folder_path>', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_folder_contents(device_id, folder_path):
    """Get contents of a specific folder with pagination"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        from .models import FileSystemTree, db
        
        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        file_type = request.args.get('file_type', 'all')
        sort_by = request.args.get('sort_by', 'name')  # name, size, date, type
        sort_order = request.args.get('sort_order', 'asc')  # asc, desc
        
        # Normalize incoming path and build alias set for common Android roots
        normalized_path = folder_path if folder_path.startswith('/') else f'/{folder_path}'

        # If deeper subpaths under sdcard or storage/emulated/0, alias only the root segment
        def build_aliases(path_value):
            if path_value.startswith('/sdcard'):
                # Map /sdcard/... <-> /storage/emulated/0/...
                alt = path_value.replace('/sdcard', '/storage/emulated/0', 1)
                return [path_value, alt]
            if path_value.startswith('/storage/emulated/0'):
                alt = path_value.replace('/storage/emulated/0', '/sdcard', 1)
                return [path_value, alt]
            return [path_value]

        parent_paths = build_aliases(normalized_path)
        # Treat root folder specially: include top-level entries with NULL parent_path
        is_root_request = normalized_path in ('/sdcard', '/storage/emulated/0', '/')
        query = FileSystemTree.query.filter(FileSystemTree.device_id == device_id)
        if is_root_request:
            query = query.filter(
                db.or_(
                    FileSystemTree.parent_path == None,
                    FileSystemTree.parent_path.in_(parent_paths)
                )
            )
        else:
            query = query.filter(FileSystemTree.parent_path.in_(parent_paths))
        
        # Filter by file type
        if file_type != 'all':
            if file_type == 'directories':
                query = query.filter_by(is_directory=True)
            elif file_type == 'files':
                query = query.filter_by(is_directory=False)
            else:
                query = query.filter_by(file_type=file_type)
        
        # Apply sorting
        if sort_by == 'name':
            order_column = FileSystemTree.name
        elif sort_by == 'size':
            order_column = FileSystemTree.size_bytes
        elif sort_by == 'date':
            order_column = FileSystemTree.last_modified
        elif sort_by == 'type':
            order_column = FileSystemTree.file_type
        else:
            order_column = FileSystemTree.name
        
        if sort_order == 'desc':
            query = query.order_by(order_column.desc())
        else:
            query = query.order_by(order_column.asc())
        
        # Get paginated results
        pagination = query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        return jsonify({
            'items': [item.to_dict() for item in pagination.items],
            'pagination': {
                'page': pagination.page,
                'per_page': pagination.per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            },
            'total_items': pagination.total
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting folder contents: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/file-system/search', methods=['OPTIONS'])
def search_files_options(device_id):
    """Handle CORS preflight requests for file search endpoint"""
    # Flask-CORS will handle the preflight request automatically
    return '', 200

@routes.route('/api/device/<device_id>/file-system/search', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def search_files(device_id):
    """Search files across the device's file system"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        from .models import FileSystemTree
        
        # Get search parameters
        query = request.args.get('q', '')
        file_type = request.args.get('file_type', 'all')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
        
        # Build search query
        search_query = FileSystemTree.query.filter_by(device_id=device_id)
        
        # Search in name and path
        search_query = search_query.filter(
            db.or_(
                FileSystemTree.name.ilike(f'%{query}%'),
                FileSystemTree.path.ilike(f'%{query}%')
            )
        )
        
        # Filter by file type
        if file_type != 'all':
            if file_type == 'directories':
                search_query = search_query.filter_by(is_directory=True)
            elif file_type == 'files':
                search_query = search_query.filter_by(is_directory=False)
            else:
                search_query = search_query.filter_by(file_type=file_type)
        
        # Order by relevance (name matches first, then path matches)
        search_query = search_query.order_by(
            db.case(
                (FileSystemTree.name.ilike(f'{query}%'), 1),
                (FileSystemTree.name.ilike(f'%{query}%'), 2),
                else_=3
            ),
            FileSystemTree.name.asc()
        )
        
        # Get paginated results
        pagination = search_query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        return jsonify({
            'device_id': device_id,
            'query': query,
            'results': [item.to_dict() for item in pagination.items],
            'pagination': {
                'page': pagination.page,
                'per_page': pagination.per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            },
            'filters': {
                'file_type': file_type
            }
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error searching files: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/file/<path:file_path>/download', methods=['POST'])
@login_required
@require_permission('view_dashboard')
def request_file_download(device_id, file_path):
    """Request file download from device"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        from .models import FileSystemTree, FileDownloadRequest, db
        
        # Find the file in the tree
        file_item = FileSystemTree.query.filter_by(
            device_id=device_id,
            path=file_path
        ).first()
        
        if not file_item:
            return jsonify({'error': 'File not found'}), 404
        
        if file_item.is_directory:
            return jsonify({'error': 'Cannot download directory'}), 400
        
        # Check if there's already a pending request
        existing_request = FileDownloadRequest.query.filter_by(
            device_id=device_id,
            file_path=file_path,
            request_status='pending'
        ).first()
        
        if existing_request:
            return jsonify({
                'message': 'Download request already pending',
                'request_id': existing_request.id,
                'status': existing_request.request_status
            }), 200
        
        # Create new download request
        download_request = FileDownloadRequest(
            device_id=device_id,
            file_path=file_path,
            file_name=file_item.name,
            file_size=file_item.size_bytes,
            request_status='pending',
            requested_by=current_user.username if current_user.is_authenticated else 'unknown'
        )
        
        db.session.add(download_request)
        db.session.commit()
        
        current_app.logger.info(f"File download request created: {file_path} for device {device_id}")
        
        return jsonify({
            'message': 'Download request created successfully',
            'request_id': download_request.id,
            'status': download_request.request_status,
            'file_name': file_item.name,
            'file_size': file_item.size_bytes
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error requesting file download: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/download-request/<int:request_id>/status', methods=['GET'])
@login_required
@require_permission('view_dashboard')
def get_download_request_status(device_id, request_id):
    """Get the status of a download request"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        from .models import FileDownloadRequest
        
        # Find the download request
        download_request = FileDownloadRequest.query.filter_by(
            id=request_id,
            device_id=device_id
        ).first()
        
        if not download_request:
            return jsonify({'error': 'Download request not found'}), 404
        
        return jsonify(download_request.to_dict()), 200
        
    except Exception as e:
        current_app.logger.error(f"Error getting download request status: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/device/<device_id>/recalculate-folder-sizes', methods=['POST'])
@login_required
@require_permission('view_dashboard')
def recalculate_folder_sizes(device_id):
    """Manually recalculate folder sizes for a device"""
    try:
        # Check device access for analysts
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Calculate folder sizes
        calculate_folder_sizes(device_id)
        
        # Get updated metadata
        from .models import FileSystemMetadata
        metadata = FileSystemMetadata.query.filter_by(device_id=device_id).first()
        
        return jsonify({
            'message': 'Folder sizes recalculated successfully',
            'device_id': device_id,
            'metadata': metadata.to_dict() if metadata else None
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error recalculating folder sizes: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/external-storage/download/<filename>')
@login_required
@require_permission('view_dashboard')
def download_external_file(filename):
    """Download external storage file"""
    try:
        # Security: validate filename to prevent directory traversal
        if '..' in filename or '/' in filename or '\\' in filename:
            return jsonify({'error': 'Invalid filename'}), 400
        
        # Check if file exists
        upload_folder = current_app.config['UPLOAD_FOLDER']
        file_path = os.path.join(upload_folder, filename)
        
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # Extract device_id from filename for access check
        device_id = filename.split('_')[0]
        if not check_device_access(device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Log file access
        log_data_access(AuditActions.AUDIO_DATA_ACCESSED, 'external_file', filename, success=True)
        
        # Serve file
        response = send_from_directory(upload_folder, filename)
        response.headers['Cache-Control'] = 'public, max-age=3600'
        
        return response
        
    except Exception as e:
        current_app.logger.error(f"Error downloading external file {filename}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


# Helper functions for file system tree insertion
def calculate_folder_sizes(device_id):
    """Calculate folder sizes by summing up all files within each folder"""
    from .models import FileSystemTree, db
    
    # Get all directories for this device
    directories = FileSystemTree.query.filter_by(
        device_id=device_id,
        is_directory=True
    ).all()
    
    for directory in directories:
        # Calculate total size of all files in this directory and subdirectories
        total_size = calculate_directory_size_recursive(device_id, directory.path)
        
        # Update the directory size
        directory.size_bytes = total_size
        db.session.add(directory)
    
    db.session.commit()

def calculate_directory_size_recursive(device_id, directory_path):
    """Recursively calculate the total size of a directory"""
    from .models import FileSystemTree
    
    total_size = 0
    
    # Get all direct children of this directory
    children = FileSystemTree.query.filter_by(
        device_id=device_id,
        parent_path=directory_path
    ).all()
    
    for child in children:
        if child.is_directory:
            # Recursively calculate subdirectory size
            total_size += calculate_directory_size_recursive(device_id, child.path)
        else:
            # Add file size
            total_size += child.size_bytes or 0
    
    return total_size

def format_file_size(size_bytes):
    """Format file size in human readable format"""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.1f} {size_names[i]}"

def insert_folder_recursive(folder_data, device_id, parent_path):
    """Recursively insert folder data into database"""
    from .models import FileSystemTree, db
    from datetime import datetime
    import re
    
    # Parse last_modified - Android sends string like "2024-01-15 10:30:00"
    last_modified = None
    if 'last_modified' in folder_data and folder_data['last_modified']:
        try:
            # Try to parse the date string from Android
            date_str = folder_data['last_modified']
            if isinstance(date_str, str):
                # Handle format like "2024-01-15 10:30:00"
                last_modified = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            else:
                # Handle timestamp
                last_modified = datetime.fromtimestamp(date_str)
        except (ValueError, TypeError):
            last_modified = None
    
    # Insert current folder
    folder = FileSystemTree(
        device_id=device_id,
        path=folder_data['path'],
        name=folder_data['name'],
        parent_path=parent_path,
        is_directory=True,
        size_bytes=folder_data.get('total_size', folder_data.get('total_size_bytes', 0)),
        file_type='Directory',
        last_modified=last_modified,
        permissions=folder_data.get('permissions', ''),
        directory_type=folder_data.get('directory_type', 'Other')
    )
    db.session.add(folder)
    
    # Insert subfolders
    if 'subfolders' in folder_data:
        for subfolder in folder_data['subfolders']:
            insert_folder_recursive(subfolder, device_id, folder_data['path'])
    
    # Insert files in this folder
    if 'files' in folder_data:
        for file_item in folder_data['files']:
            insert_file_item(file_item, device_id, folder_data['path'])


def insert_file_item(file_data, device_id, parent_path):
    """Insert file item into database"""
    from .models import FileSystemTree, db
    from datetime import datetime
    
    # Parse last_modified - Android sends string like "2024-01-15 10:30:00"
    last_modified = None
    if 'last_modified' in file_data and file_data['last_modified']:
        try:
            # Try to parse the date string from Android
            date_str = file_data['last_modified']
            if isinstance(date_str, str):
                # Handle format like "2024-01-15 10:30:00"
                last_modified = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            else:
                # Handle timestamp
                last_modified = datetime.fromtimestamp(date_str)
        except (ValueError, TypeError):
            last_modified = None
    
    # Derive parent_path from path if not provided
    effective_parent_path = parent_path
    try:
        file_path_value = file_data['path']
        if not effective_parent_path and isinstance(file_path_value, str):
            if '/' in file_path_value:
                # Use directory portion before the last slash; ensure at least '/'
                effective_parent_path = file_path_value.rsplit('/', 1)[0] or '/'
    except Exception:
        pass

    file_item = FileSystemTree(
        device_id=device_id,
        path=file_data['path'],
        name=file_data['name'],
        parent_path=effective_parent_path,
        is_directory=False,
        size_bytes=file_data.get('size', file_data.get('size_bytes', 0)),
        file_type=file_data.get('file_type', 'Other'),
        file_extension=file_data.get('file_extension', ''),
        last_modified=last_modified,
        permissions=file_data.get('permissions', ''),
        file_hash=file_data.get('file_hash', ''),
        is_hidden=file_data.get('is_hidden', False)
    )
    db.session.add(file_item)


# ===================== EXPORT ENDPOINTS =====================

@routes.route('/api/export/device-locations/<device_id>')
@login_required
@require_permission('export_data')
def export_device_locations(device_id):
    """Export device location data to CSV"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    """Export device location data with separate date/time columns in Nigerian timezone"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()

        # Get optional query parameters
        days = request.args.get('days', 30, type=int)
        format_type = request.args.get('format', 'csv').lower()  # csv or json
        timezone_display = request.args.get('timezone', 'nigerian').lower()  # 'utc' or 'nigerian'

        # Calculate date filter
        from datetime import timedelta
        date_filter = datetime.utcnow() - timedelta(days=days)

        # Query location data ordered by ID
        locations = (
            DeviceLocation.query
            .filter_by(device_id=device_id)
            .filter(DeviceLocation.date >= date_filter.date())
            .order_by(DeviceLocation.id.asc())  # Order by ID for consistent export
            .all()
        )

        if format_type == 'json':
            return jsonify({
                'device_id': device_id,
                'export_date': datetime.utcnow().isoformat(),
                'total_records': len(locations),
                'timezone': 'WAT' if timezone_display == 'nigerian' else 'UTC',
                'data': [loc.to_dict(nigerian_display=(timezone_display == 'nigerian')) for loc in locations]
            })
        
        elif format_type == 'csv':
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.writer(output)
            
            if timezone_display == 'nigerian':
                # Write header for Nigerian timezone
                writer.writerow(['ID', 'Device_ID', 'Latitude', 'Longitude', 'Date_WAT', 'Time_WAT'])
                
                # Write data with Nigerian timezone
                for loc in locations:
                    nigerian_time = loc.get_datetime_nigerian()
                    writer.writerow([
                        loc.id,
                        loc.device_id,
                        loc.latitude,
                        loc.longitude,
                        nigerian_time.strftime('%Y-%m-%d'),
                        nigerian_time.strftime('%H:%M:%S')
                    ])
                    
                tz_suffix = '_WAT'
            else:
                # Write header for UTC
                writer.writerow(['ID', 'Device_ID', 'Latitude', 'Longitude', 'Date_UTC', 'Time_UTC'])
                
                # Write data in UTC
                for loc in locations:
                    writer.writerow([
                        loc.id,
                        loc.device_id,
                        loc.latitude,
                        loc.longitude,
                        loc.date.isoformat(),
                        loc.time.isoformat()
                    ])
                    
                tz_suffix = '_UTC'
            
            output.seek(0)
            filename = f"{device_id}_locations_{datetime.now().strftime('%Y%m%d')}{tz_suffix}.csv"
            
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename={filename}'}
            )
        
        else:
            return jsonify({'error': 'Invalid format. Use "csv" or "json"'}), 400

    except Exception as e:
        print(f"Export device locations error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/export/recording-events/<device_id>')
@login_required
@require_permission('export_data')
def export_recording_events(device_id):
    """Export recording events data to CSV"""
    # Check device access for analysts
    if not check_device_access(device_id):
        return jsonify({'error': 'Access denied to this device'}), 403
    """Export recording events data with separate date/time columns in Nigerian timezone"""
    try:
        auth = request.authorization
        if not auth or not check_auth(auth.username, auth.password):
            return authenticate()

        # Get optional query parameters
        days = request.args.get('days', 30, type=int)
        format_type = request.args.get('format', 'csv').lower()  # csv or json
        timezone_display = request.args.get('timezone', 'nigerian').lower()  # 'utc' or 'nigerian'

        # Calculate date filter
        from datetime import timedelta
        date_filter = datetime.utcnow() - timedelta(days=days)

        # Query recording events ordered by ID
        events = (
            RecordingEvent.query
            .filter_by(device_id=device_id)
            .filter(RecordingEvent.start_date >= date_filter.date())
            .order_by(RecordingEvent.id.asc())  # Order by ID for consistent export
            .all()
        )

        if format_type == 'json':
            return jsonify({
                'device_id': device_id,
                'export_date': datetime.utcnow().isoformat(),
                'total_records': len(events),
                'timezone': 'WAT' if timezone_display == 'nigerian' else 'UTC',
                'data': [event.to_dict(nigerian_display=(timezone_display == 'nigerian')) for event in events]
            })
        
        elif format_type == 'csv':
            import csv
            from io import StringIO
            
            output = StringIO()
            writer = csv.writer(output)
            
            if timezone_display == 'nigerian':
                # Write header for Nigerian timezone
                writer.writerow([
                    'ID', 'Device_ID', 'Start_Date_WAT', 'Start_Time_WAT', 'Start_Latitude', 'Start_Longitude',
                    'Stop_Date_WAT', 'Stop_Time_WAT', 'Stop_Latitude', 'Stop_Longitude', 'Audio_File_ID'
                ])
                
                # Write data with Nigerian timezone
                for event in events:
                    start_nigerian = event.get_start_datetime_nigerian()
                    stop_nigerian = event.get_stop_datetime_nigerian()
                    
                    writer.writerow([
                        event.id,
                        event.device_id,
                        start_nigerian.strftime('%Y-%m-%d'),
                        start_nigerian.strftime('%H:%M:%S'),
                        event.start_latitude,
                        event.start_longitude,
                        stop_nigerian.strftime('%Y-%m-%d') if stop_nigerian else '',
                        stop_nigerian.strftime('%H:%M:%S') if stop_nigerian else '',
                        event.stop_latitude or '',
                        event.stop_longitude or '',
                        event.audio_file_id or ''
                    ])
                    
                tz_suffix = '_WAT'
            else:
                # Write header for UTC
                writer.writerow([
                    'ID', 'Device_ID', 'Start_Date_UTC', 'Start_Time_UTC', 'Start_Latitude', 'Start_Longitude',
                    'Stop_Date_UTC', 'Stop_Time_UTC', 'Stop_Latitude', 'Stop_Longitude', 'Audio_File_ID'
                ])
                
                # Write data in UTC
                for event in events:
                    writer.writerow([
                        event.id,
                        event.device_id,
                        event.start_date.isoformat(),
                        event.start_time.isoformat(),
                        event.start_latitude,
                        event.start_longitude,
                        event.stop_date.isoformat() if event.stop_date else '',
                        event.stop_time.isoformat() if event.stop_time else '',
                        event.stop_latitude or '',
                        event.stop_longitude or '',
                        event.audio_file_id or ''
                    ])
                    
                tz_suffix = '_UTC'
            
            output.seek(0)
            filename = f"{device_id}_recording_events_{datetime.now().strftime('%Y%m%d')}{tz_suffix}.csv"
            
            return Response(
                output.getvalue(),
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename={filename}'}
            )
        
        else:
            return jsonify({'error': 'Invalid format. Use "csv" or "json"'}), 400

    except Exception as e:
        print(f"Export recording events error: {e}")
        return jsonify({'error': str(e)}), 500


@routes.route('/api/audit-logs', methods=['GET'])
@login_required
@require_permission('access_audit_logs')
def get_audit_logs():
    """Get audit logs for system monitoring"""
    try:
        # Get query parameters
        limit = request.args.get('limit', 50, type=int)
        page = request.args.get('page', 1, type=int)
        offset = (page - 1) * limit  # Convert page to offset
        action = request.args.get('action')
        user_id = request.args.get('user_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        # Check if audit log table exists
        try:
            # Build query
            query = AuditLog.query
            
            # SECURITY: Hide super_super_admin activities from super_user
            if current_user.role == 'super_user':
                # Exclude audit logs from super_super_admin users
                super_super_admin_users = User.query.filter_by(role='super_super_admin').all()
                super_super_admin_ids = [user.id for user in super_super_admin_users]
                if super_super_admin_ids:
                    query = query.filter(~AuditLog.user_id.in_(super_super_admin_ids))
            
            if action:
                query = query.filter(AuditLog.action == action)
            
            if user_id:
                query = query.filter(AuditLog.user_id == user_id)
            
            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    query = query.filter(AuditLog.timestamp >= start_dt)
                except ValueError:
                    return jsonify({'error': 'Invalid start_date format'}), 400
            
            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    query = query.filter(AuditLog.timestamp <= end_dt)
                except ValueError:
                    return jsonify({'error': 'Invalid end_date format'}), 400
            
            # Execute query with pagination
            total = query.count()
            logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()
            
        except Exception as db_error:
            # Handle database/table structure issues
            current_app.logger.error(f"Database error in audit logs: {db_error}")
            return jsonify({
                'error': 'Audit log table not available',
                'logs': [],
                'total': 0,
                'limit': limit,
                'offset': offset,
                'page': page,
                'total_pages': 0
            }), 200  # Return empty results instead of error
        
        # Format results
        result = []
        for log in logs:
            try:
                user = User.query.get(log.user_id) if log.user_id else None
                result.append({
                    'id': log.id,
                    'timestamp': log.timestamp.isoformat() + 'Z' if log.timestamp else None,  # Add 'Z' to indicate UTC
                    'user_id': log.user_id,
                    'username': user.username if user else (log.username if hasattr(log, 'username') else 'Unknown'),
                    'action': log.action,
                    'resource_type': log.resource_type,
                    'resource_id': log.resource_id,
                    'old_value': log.old_value,
                    'new_value': log.new_value,
                    'success': log.success,
                    'user_agent': getattr(log, 'user_agent', None)
                })
            except Exception as format_error:
                # Skip problematic log entries
                current_app.logger.warning(f"Error formatting audit log entry {log.id}: {format_error}")
                continue
        
        # Audit this access (use simple audit call to avoid recursion)
        try:
            log_data_access(
                action=AuditActions.AUDIT_LOG_ACCESSED,
                resource_type='audit_logs',
                resource_id='query',
                details={'query_params': dict(request.args), 'result_count': len(result)},
                success=True
            )
        except Exception:
            # Don't fail if audit logging fails
            pass
        
        return jsonify({
            'logs': result,
            'total': total,
            'limit': limit,
            'offset': offset,
            'page': page,
            'total_pages': (total + limit - 1) // limit  # Calculate total pages
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching audit logs: {e}")
        # Return graceful error with empty results
        return jsonify({
            'error': 'Unable to fetch audit logs',
            'logs': [],
            'total': 0,
            'limit': limit,
            'offset': offset
        }), 200  # Return 200 instead of 500 to avoid breaking the UI


# ========== DEVICE MANAGEMENT ENDPOINTS ==========

@routes.route('/api/device/<device_id>/rename', methods=['PUT'])
@login_required 
@require_role(['super_super_admin', 'super_user'])
def rename_device(device_id):
    """
    Rename device display name
    Only super_super_admin and super_user can rename devices
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        new_display_name = data.get('display_name', '').strip()
        
        # Input validation
        if not new_display_name:
            return jsonify({'error': 'Display name cannot be empty'}), 400
            
        if len(new_display_name) > 200:
            return jsonify({'error': 'Display name cannot exceed 200 characters'}), 400
            
        # Prevent XSS attacks - basic HTML/script tag detection
        dangerous_chars = ['<', '>', 'script', 'javascript:', 'onload', 'onerror']
        if any(char in new_display_name.lower() for char in dangerous_chars):
            return jsonify({'error': 'Display name contains invalid characters'}), 400
        
        # Resolve to actual device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check device access for analysts (though they can't rename anyway)
        if not check_device_access(actual_device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Check for duplicate display names
        existing = DeviceInfo.query.filter_by(display_name=new_display_name).first()
        if existing and existing.device_id != actual_device_id:
            return jsonify({
                'error': 'Display name already taken',
                'message': f'The name "{new_display_name}" is already used by another device'
            }), 409  # 409 Conflict
        
        # Get or create device info
        device_info = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        if not device_info:
            device_info = DeviceInfo(device_id=actual_device_id)
            db.session.add(device_info)
        
        old_display_name = device_info.display_name
        device_info.display_name = new_display_name
        
        db.session.commit()
        
        # Clear cache to ensure new name is resolved
        from app.device_utils import clear_device_cache
        clear_device_cache()
        
        # Audit log
        AuditLog.create(
            user_id=current_user.id,
            action='device_renamed',
            resource_type='device',
            resource_id=actual_device_id,
            old_value=old_display_name or actual_device_id,
            new_value=new_display_name
        )
        
        return jsonify({
            'success': True,
            'device_id': actual_device_id,
            'old_display_name': old_display_name,
            'new_display_name': new_display_name,
            'message': f'Device renamed to "{new_display_name}"'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error renaming device {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/device/<device_id>/reset-name', methods=['PUT'])
@login_required 
@require_role(['super_super_admin', 'super_user'])
def reset_device_name(device_id):
    """
    Reset device display name to device_id
    Only super_super_admin and super_user can reset device names
    """
    try:
        # Resolve to actual device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check device access
        if not check_device_access(actual_device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Get device info
        device_info = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        if not device_info or not device_info.display_name:
            return jsonify({
                'error': 'Device has no custom display name to reset'
            }), 400
        
        old_display_name = device_info.display_name
        device_info.display_name = None
        
        db.session.commit()
        
        # Clear cache
        from app.device_utils import clear_device_cache
        clear_device_cache()
        
        # Audit log
        AuditLog.create(
            user_id=current_user.id,
            action='device_name_reset',
            resource_type='device',
            resource_id=actual_device_id,
            old_value=old_display_name,
            new_value=actual_device_id
        )
        
        return jsonify({
            'success': True,
            'device_id': actual_device_id,
            'old_display_name': old_display_name,
            'message': f'Device name reset to "{actual_device_id}"'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error resetting device name {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/device/<device_id>/phone-numbers', methods=['PUT'])
@login_required
@require_permission('view_dashboard')
def update_device_phone_numbers(device_id):
    """
    Update phone numbers for a device
    Allows manual entry of phone numbers when device sync is not working
    """
    try:
        # Resolve to actual device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        # Check device access
        if not check_device_access(actual_device_id):
            return jsonify({'error': 'Access denied to this device'}), 403
        
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        phone_numbers = data.get('phone_numbers', [])
        if not isinstance(phone_numbers, list):
            return jsonify({'error': 'phone_numbers must be a list'}), 400
        
        # Validate phone number format - Nigerian numbers priority
        import re
        
        def validate_phone_number(phone):
            # Clean phone number (remove spaces, dashes, parentheses)
            cleaned_phone = re.sub(r'[\s\-\(\)]', '', phone)
            
            # Nigerian phone number patterns (priority)
            nigerian_patterns = [
                r'^0[789][01]\d{8}$',           # 08012345678, 07012345678, 09012345678
                r'^234[789][01]\d{8}$',         # 2348012345678, 2347012345678, 2349012345678
                r'^\+234[789][01]\d{8}$',       # +2348012345678, +2347012345678, +2349012345678
            ]
            
            # Check Nigerian patterns first (priority)
            for pattern in nigerian_patterns:
                if re.match(pattern, cleaned_phone):
                    return True
            
            # International patterns (fallback) - but exclude numbers that start with 234 (Nigerian country code)
            if not cleaned_phone.startswith('234'):
                international_patterns = [
                    r'^\+[1-9]\d{6,14}$',           # +1234567890 (international with country code)
                    r'^[1-9]\d{9,14}$',             # 1234567890 (without country code, 10-15 digits total)
                ]
                
                for pattern in international_patterns:
                    if re.match(pattern, cleaned_phone):
                        return True
            
            return False
        
        for phone in phone_numbers:
            if not isinstance(phone, str):
                return jsonify({'error': f'Phone number must be a string: {phone}'}), 400
            
            if not validate_phone_number(phone):
                return jsonify({'error': f'Invalid phone number format: {phone}. Nigerian formats: 08012345678, 2348012345678, +2348012345678. International: +1234567890'}), 400
        
        # Get or create device info
        device_info = DeviceInfo.query.filter_by(device_id=actual_device_id).first()
        if not device_info:
            device_info = DeviceInfo(device_id=actual_device_id)
            db.session.add(device_info)
        
        # Store old phone numbers for audit
        old_phone_numbers = device_info.get_phone_numbers()
        
        # Update phone numbers
        device_info.phone_numbers = json.dumps(phone_numbers) if phone_numbers else None
        device_info.updated_at = datetime.utcnow()
        
        db.session.commit()
        
        # Audit log
        AuditLog.create(
            user_id=current_user.id,
            action='device_phone_numbers_updated',
            resource_type='device',
            resource_id=actual_device_id,
            old_value=json.dumps(old_phone_numbers) if old_phone_numbers else None,
            new_value=json.dumps(phone_numbers) if phone_numbers else None
        )
        
        current_app.logger.info(f"Phone numbers updated for device {actual_device_id}: {phone_numbers}")
        
        return jsonify({
            'success': True,
            'device_id': actual_device_id,
            'phone_numbers': phone_numbers,
            'message': f'Phone numbers updated successfully'
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Error updating phone numbers for device {device_id}: {e}")
        return jsonify({'error': 'Internal server error'}), 500


@routes.route('/api/test-ip', methods=['GET', 'POST'])
def test_ip_detection():
    """
    Test endpoint to diagnose IP address detection issues
    Shows all IP-related headers and detection methods
    """
    
    def get_real_ip(request_obj):
        """Enhanced IP detection that handles proxies and CDNs"""
        proxy_headers = [
            'CF-Connecting-IP',    # Cloudflare
            'True-Client-IP',      # Cloudflare/Akamai 
            'X-Real-IP',          # Nginx
            'X-Forwarded-For',    # Standard proxy header
            'X-Client-IP',        # Some proxies
            'X-Forwarded',        # Rare
            'X-Cluster-Client-IP', # Some load balancers
            'Forwarded-For',      # Rare
            'Forwarded'           # RFC 7239
        ]
        
        for header in proxy_headers:
            value = request_obj.headers.get(header)
            if value:
                # X-Forwarded-For can contain multiple IPs
                if header == 'X-Forwarded-For':
                    ip = value.split(',')[0].strip()
                else:
                    ip = value.strip()
                
                if ip and ip != 'unknown' and '.' in ip:
                    return ip
        
        return request_obj.remote_addr
    
    ip_info = {
        'current_detection': {
            'request.remote_addr': request.remote_addr,
            'enhanced_detection': get_real_ip(request),
        },
        'proxy_headers': {
            'X-Forwarded-For': request.headers.get('X-Forwarded-For'),
            'X-Real-IP': request.headers.get('X-Real-IP'),
            'X-Forwarded-Proto': request.headers.get('X-Forwarded-Proto'),
            'CF-Connecting-IP': request.headers.get('CF-Connecting-IP'),
            'X-Client-IP': request.headers.get('X-Client-IP'),
            'True-Client-IP': request.headers.get('True-Client-IP'),
        },
        'request_info': {
            'method': request.method,
            'user_agent': request.user_agent.string,
            'host': request.host,
            'url': request.url,
        },
        'environment': {
            'REMOTE_ADDR': request.environ.get('REMOTE_ADDR'),
            'HTTP_X_FORWARDED_FOR': request.environ.get('HTTP_X_FORWARDED_FOR'),
            'HTTP_X_REAL_IP': request.environ.get('HTTP_X_REAL_IP'),
        }
    }
    
    return jsonify(ip_info)

@routes.route('/api/device/<device_id>/export', methods=['POST'])
@login_required
def export_device_data(device_id):
    """
    Export all device data to Excel file with date filtering
    Only analysts can export assigned devices, super users can export any device
    """
    try:
        # Check device access
        if not check_device_access(device_id):
            log_permission_denied('device_export', device_id, 'device access denied')
            return jsonify({'error': 'Access denied to this device'}), 403
        
        # Operators cannot export data
        if current_user.role == 'operator':
            log_permission_denied('device_export', device_id, 'operators cannot export data')
            return jsonify({'error': 'Operators are not allowed to export data'}), 403
        
        # Get date filters from request
        data = request.get_json() or {}
        start_date = None
        end_date = None
        
        # Parse date filters if provided
        if data.get('start_date'):
            try:
                start_date = datetime.strptime(data['start_date'], '%Y-%m-%d')
            except ValueError:
                return jsonify({'error': 'Invalid start_date format. Use YYYY-MM-DD'}), 400
        
        if data.get('end_date'):
            try:
                end_date = datetime.strptime(data['end_date'], '%Y-%m-%d')
                # Set end time to end of day
                end_date = end_date.replace(hour=23, minute=59, second=59)
            except ValueError:
                return jsonify({'error': 'Invalid end_date format. Use YYYY-MM-DD'}), 400
        
        # Validate date range
        if start_date and end_date and start_date > end_date:
            return jsonify({'error': 'Start date cannot be after end date'}), 400
        
        # Resolve device ID
        actual_device_id = resolve_to_device_id(device_id)
        
        # Import and use export service
        from .services.device_excel_export import export_device_to_excel
        
        # Generate Excel file
        excel_file = export_device_to_excel(actual_device_id, start_date, end_date)
        
        # Generate filename
        date_suffix = datetime.now().strftime('%Y-%m-%d')
        filename = f"{actual_device_id}_data_export_{date_suffix}.xlsx"
        
        # Audit log the export
        from .utils.audit import log_data_access, AuditActions
        
        # Count exported records for audit details
        export_details = {
            'device_id': actual_device_id,
            'export_format': 'excel',
            'tables_exported': ['locations', 'recordings', 'contacts', 'sms_messages', 'call_logs'],
            'date_range': {
                'start_date': start_date.strftime('%Y-%m-%d') if start_date else 'all_time',
                'end_date': end_date.strftime('%Y-%m-%d') if end_date else 'all_time'
            },
            'filename': filename
        }
        
        log_data_access(
            action=AuditActions.DEVICE_DATA_EXPORTED,
            resource_type='device_export',
            resource_id=actual_device_id,
            success=True,
            details=export_details
        )
        
        # Return file as download
        from flask import send_file
        return send_file(
            excel_file,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except Exception as e:
        current_app.logger.error(f"Error exporting device data for {device_id}: {e}")
        
        # Audit log the failed export
        try:
            from .utils.audit import log_data_access, AuditActions
            log_data_access(
                action=AuditActions.DEVICE_DATA_EXPORTED,
                resource_type='device_export',
                resource_id=device_id,
                success=False,
                error_message=str(e)
            )
        except:
            pass
        
        return jsonify({'error': 'Failed to export device data'}), 500
