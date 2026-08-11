"""
Live Audio Streaming Module
Handles real-time audio streaming via WebSocket (Flask-SocketIO)
"""

import os
import json
import redis
import base64
import hmac
from datetime import datetime
from flask import request
from flask_login import current_user
from flask_socketio import emit, join_room, leave_room, disconnect
from app import socketio, db
from app.models import LiveStreamSession, StreamListener, DeviceInfo, User
from app.utils.audit import log_audit, AuditActions
from app.auth.permissions import require_permission
import logging

logger = logging.getLogger(__name__)

# Redis client for Pub/Sub (separate database from Celery)
try:
    redis_client = redis.Redis(
        host=os.environ.get('REDIS_HOST', 'localhost'),
        port=int(os.environ.get('REDIS_PORT', 6379)),
        db=1,  # Use database 1 for streaming (Celery uses 0)
        decode_responses=False,  # We handle binary audio data
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True
    )
    # Test connection
    redis_client.ping()
    logger.info("✅ Redis connection established for streaming")
except Exception as e:
    logger.error(f"❌ Redis connection failed: {e}")
    redis_client = None

# Track active sessions and connections
active_sessions = {}  # {device_id: session_id}
device_sockets = {}  # {device_id: socket_id}
listener_counts = {}  # {device_id: count}
redis_subscribers = {}  # {device_id: greenlet} - Track active Redis subscriber greenlets
stream_stats = {}  # {device_id: {'bytes': 0, 'chunks': 0, 'last_flush': datetime}} - In-memory stats
stream_seq_state = {}  # {device_id: {'last_seq': int|None, 'chunk_count': int}}

# Video streaming
video_init_segments = {}  # {device_id: base64_chunk}

# Screen streaming
screen_init_segments = {}  # {device_id: base64_chunk}

# Background stats flush greenlet
stats_flush_greenlet = None
_flask_app = None  # Store Flask app reference for background tasks


def _safe_username():
    try:
        if current_user.is_authenticated:
            return current_user.username
    except Exception:
        pass
    return 'anonymous'


def _stream_log(stage, level='info', **fields):
    """Structured stream-flow logs for correlating client/server events."""
    sanitized = {k: v for k, v in fields.items() if v is not None}
    details = " ".join([f"{k}={sanitized[k]}" for k in sorted(sanitized.keys())])
    message = f"[STREAM_FLOW] stage={stage} {details}".strip()
    log_fn = getattr(logger, level, logger.info)
    log_fn(message)


def _get_device_socket_token_mode():
    """Device socket token mode: off | log | strict"""
    token_mode = os.environ.get('DEVICE_SOCKET_TOKEN_MODE', 'strict').strip().lower()
    if token_mode not in {'off', 'log', 'strict'}:
        logger.warning(f"Invalid DEVICE_SOCKET_TOKEN_MODE={token_mode}. Falling back to 'strict'.")
        return 'strict'
    return token_mode


def _extract_device_socket_token():
    """Extract token sent by Android device during Socket.IO connect."""
    return (
        request.args.get('device_token')
        or request.args.get('auth_token')
        or request.args.get('token')
    )


def _is_valid_device_socket_token(android_id, provided_token):
    """
    Validate device token.

    Preferred: exact match with DEVICE_SOCKET_TOKEN.
    Compatibility fallback: derived token format used by BAT clients.
    """
    if not provided_token:
        return False

    expected_static_token = os.environ.get('DEVICE_SOCKET_TOKEN')
    if expected_static_token:
        return hmac.compare_digest(provided_token, expected_static_token)

    derived_token = f"bat-device-{android_id}"
    return hmac.compare_digest(provided_token, derived_token)


def init_streaming(app):
    """Initialize streaming module - start background tasks"""
    import eventlet
    global stats_flush_greenlet, _flask_app
    
    _flask_app = app  # Store app reference for application context
    
    if stats_flush_greenlet is None:
        stats_flush_greenlet = eventlet.spawn(flush_stream_stats)
        logger.info("✅ Background stats flush task started")


@socketio.on('connect', namespace='/stream')
def handle_user_connect():
    """Handle user dashboard connection"""
    if not current_user.is_authenticated:
        logger.warning(
            f"Rejected unauthenticated /stream socket connection sid={request.sid} "
            f"ip={request.remote_addr}"
        )
        return False

    _stream_log(
        'user_connect',
        sid=request.sid,
        user=current_user.username,
        ip=request.remote_addr,
        namespace='/stream'
    )
    return True


@socketio.on('disconnect', namespace='/stream')
def handle_user_disconnect():
    """Handle user dashboard disconnection - cleanup all listeners for this user"""
    if not current_user.is_authenticated:
        return
    
    try:
        # Find all active listener records for this user
        active_listeners = StreamListener.query.filter_by(
            user_id=current_user.id,
            left_at=None
        ).all()
        
        for listener in active_listeners:
            listener.left_at = datetime.utcnow()
            listener.duration_seconds = int((listener.left_at - listener.joined_at).total_seconds())
            
            # Update session listener count
            session = LiveStreamSession.query.get(listener.session_id)
            if session:
                session.listener_count = max(0, session.listener_count - 1)
                listener_counts[session.device_id] = session.listener_count
                
                # Broadcast updated listener count to remaining listeners
                socketio.emit('listener_count_update', {
                    'session_id': session.id,
                    'device_id': session.device_id,
                    'listener_count': session.listener_count
                }, room=f'listeners_{session.device_id}', namespace='/stream')
        
        db.session.commit()
        
        # After commit, stop sessions with no listeners
        for listener in active_listeners:
            session = LiveStreamSession.query.get(listener.session_id)
            if session and session.listener_count == 0:
                logger.info(f"No more listeners for {session.device_id}, stopping stream")
                socketio.emit('stream_stop', {
                    'session_id': session.id,
                    'reason': 'no_listeners'
                }, room=device_sockets.get(session.device_id), namespace='/device')
                
                stop_stream_session(session.id, 'no_listeners')
        logger.info(f"User {current_user.username} disconnected from streaming - cleaned up {len(active_listeners)} listeners")
        
    except Exception as e:
        logger.error(f"Error handling user disconnect: {e}", exc_info=True)


@socketio.on('connect', namespace='/device')
def handle_device_connect():
    """Handle Android device connection"""
    # Look for ID in multiple possible parameters (Android apps vary)
    identifier = request.args.get('android_id') or request.args.get('device_id') or request.args.get('id')
    device_token = _extract_device_socket_token()
    token_mode = _get_device_socket_token_mode()
    
    if not identifier:
        _stream_log(
            'device_connect_rejected',
            level='warning',
            reason='missing_identifier',
            sid=request.sid,
            arg_keys=list(request.args.keys()),
            namespace='/device'
        )
        return False
    
    # Resolve identifier to actual device_id (handles android_id or device_id match)
    from .device_utils import resolve_to_device_id
    device_id = resolve_to_device_id(identifier)
    
    _stream_log(
        'device_connect_attempt',
        sid=request.sid,
        identifier=identifier,
        resolved_device_id=device_id,
        token_mode=token_mode,
        token_present=bool(device_token),
        ip=request.remote_addr,
        namespace='/device'
    )

    # Verify device exists in database
    device = DeviceInfo.query.filter_by(device_id=device_id).first()
    if not device:
        logger.info(f"🆕 New device detected during connection: {identifier}. Auto-registering...")
        try:
            device = DeviceInfo(
                device_id=device_id,
                android_id=identifier,
                display_name=f"New Device ({identifier[:8]})",
                updated_at=datetime.utcnow()
            )
            db.session.add(device)
            db.session.commit()
            logger.info(f"✅ Successfully registered device {device_id}")
        except Exception as e:
            db.session.rollback()
            logger.error(f"❌ Failed to auto-register device {device_id}: {e}")
            return False

    # Check token against the device's android_id
    token_valid = _is_valid_device_socket_token(device.android_id, device_token)
    if token_mode == 'log':
        if not device_token:
            logger.warning(
                f"Device {device.device_id} connected without token. "
                f"Allowed in compatibility mode (DEVICE_SOCKET_TOKEN_MODE=log)."
            )
        elif not token_valid:
            logger.warning(
                f"Device {device.device_id} provided invalid token: {device_token}. "
                f"Allowed in compatibility mode (DEVICE_SOCKET_TOKEN_MODE=log)."
            )
    elif token_mode == 'strict' and not token_valid:
        _stream_log(
            'device_connect_rejected',
            level='warning',
            reason='invalid_token_strict_mode',
            sid=request.sid,
            device_id=device.device_id,
            token_present=bool(device_token),
            namespace='/device'
        )
        return False
    
    device_sockets[device.device_id] = request.sid
    _stream_log(
        'device_connect_accepted',
        sid=request.sid,
        device_id=device.device_id,
        android_id=device.android_id,
        namespace='/device'
    )
    
    # PROACTIVE: Check if there's a pending 'requested' session for this device
    # and trigger it immediately upon connection.
    if device.device_id in active_sessions:
        session_id = active_sessions[device.device_id]
        session = LiveStreamSession.query.get(session_id)
        if session and session.status == 'requested':
            _stream_log(
                'pending_session_found_on_device_connect',
                device_id=device.device_id,
                session_id=session_id,
                session_status=session.status,
                sid=request.sid
            )
            socketio.emit('live_stream_request', {
                'session_id': session_id,
                'device_id': device.device_id
            }, room=request.sid, namespace='/device')
            
    return True


@socketio.on('disconnect', namespace='/device')
def handle_device_disconnect():
    """Handle device disconnection"""
    # Find device by socket ID
    device_id = None
    for dev_id, sock_id in device_sockets.items():
        if sock_id == request.sid:
            device_id = dev_id
            break
    
    if device_id:
        _stream_log(
            'device_disconnect',
            sid=request.sid,
            device_id=device_id,
            had_active_session=device_id in active_sessions,
            namespace='/device'
        )
        del device_sockets[device_id]
        
        # Stop active session if exists
        if device_id in active_sessions:
            session_id = active_sessions[device_id]
            stop_stream_session(session_id, 'device_disconnected')


@socketio.on('request_live_stream', namespace='/stream')
def handle_stream_request(data):
    """
    User requests to listen to live stream from device
    Data: {'device_id': 'xxx'}
    """
    if not current_user.is_authenticated:
        emit('stream_error', {'message': 'Authentication required'})
        return
    
    device_id_param = data.get('device_id')
    _stream_log(
        'listen_live_clicked',
        user=_safe_username(),
        sid=request.sid,
        requested_device=device_id_param,
        namespace='/stream'
    )

    if not device_id_param:
        emit('stream_error', {'message': 'Device ID required'})
        _stream_log(
            'listen_live_rejected',
            level='warning',
            reason='missing_device_id',
            user=_safe_username(),
            sid=request.sid,
            namespace='/stream'
        )
        return
    
    try:
        # Resolve device_id (frontend may send android_id or device_id)
        from .device_utils import resolve_to_device_id
        device_id = resolve_to_device_id(device_id_param)
        _stream_log(
            'listen_live_resolved',
            user=_safe_username(),
            sid=request.sid,
            requested_device=device_id_param,
            resolved_device=device_id
        )
        
        # Check if user has permission to access this device
        device = DeviceInfo.query.filter_by(device_id=device_id).first()
        if not device:
            emit('stream_error', {'message': 'Device not found'})
            _stream_log(
                'listen_live_rejected',
                level='warning',
                reason='device_not_found',
                user=_safe_username(),
                sid=request.sid,
                requested_device=device_id_param,
                resolved_device=device_id
            )
            log_audit(
                action='LIVE_STREAM_REQUEST_FAILED',
                success=False,
                resource_type='device',
                resource_id=device_id_param,
                error_message='Device not found'
            )
            return
        
        # Check device access permission (respects RBAC)
        if not current_user.can_access_device(device_id):
            emit('stream_error', {'message': 'Access denied to this device'})
            _stream_log(
                'listen_live_rejected',
                level='warning',
                reason='permission_denied',
                user=_safe_username(),
                sid=request.sid,
                resolved_device=device_id
            )
            log_audit(
                action=AuditActions.PERMISSION_DENIED,
                success=False,
                resource_type='device',
                resource_id=device_id,
                error_message='Live stream access denied'
            )
            return
        
        # Check if there's already an active session for this device
        if device_id in active_sessions:
            session_id = active_sessions[device_id]
            session = LiveStreamSession.query.get(session_id)
            
            if session:
                # Handle stale 'requested' sessions (device never connected)
                # Clean up if session is older than 2 minutes and still requested
                if session.status == 'requested':
                    time_since_request = (datetime.utcnow() - session.start_time).total_seconds()
                    if time_since_request > 120:  # 2 minutes timeout
                        _stream_log(
                            'stale_requested_session_cleanup',
                            level='warning',
                            session_id=session_id,
                            device_id=device_id,
                            age_seconds=int(time_since_request)
                        )
                        stop_stream_session(session_id, 'timeout')
                        # Remove from tracking to allow new session
                        if device_id in active_sessions:
                            del active_sessions[device_id]
                        if device_id in listener_counts:
                            del listener_counts[device_id]
                    else:
                        # Session is still pending, user can wait
                        join_room(f'listeners_{device_id}', namespace='/stream')
                        
                        # Create listener record for pending session
                        listener = StreamListener(
                            session_id=session_id,
                            user_id=current_user.id,
                            username=current_user.username
                        )
                        db.session.add(listener)
                        
                        # Update listener count
                        session.listener_count += 1
                        listener_counts[device_id] = listener_counts.get(device_id, 0) + 1
                        
                        db.session.commit()
                        
                        emit('stream_requested', {
                            'session_id': session_id,
                            'device_id': device_id,
                            'status': 'waiting_for_device'
                        })

                        _stream_log(
                            'listen_live_waiting_for_device',
                            user=_safe_username(),
                            sid=request.sid,
                            session_id=session_id,
                            device_id=device_id,
                            listener_count=session.listener_count
                        )
                        return
                
                # Join existing active stream
                elif session.status == 'active':
                    join_room(f'listeners_{device_id}', namespace='/stream')
                    
                    # Create listener record
                    listener = StreamListener(
                        session_id=session_id,
                        user_id=current_user.id,
                        username=current_user.username
                    )
                    db.session.add(listener)
                    
                    # Update listener count
                    session.listener_count += 1
                    listener_counts[device_id] = listener_counts.get(device_id, 0) + 1
                    
                    db.session.commit()
                    
                    # Notify the new joiner
                    emit('stream_joined', {
                        'session_id': session_id,
                        'device_id': device_id,
                        'status': 'active',
                        'listener_count': session.listener_count,
                        'needs_header': True  # Flag that this joiner needs Ogg header
                    })
                    
                    # Broadcast updated listener count to ALL listeners in the room (including the new joiner)
                    socketio.emit('listener_count_update', {
                        'session_id': session_id,
                        'device_id': device_id,
                        'listener_count': session.listener_count
                    }, room=f'listeners_{device_id}', namespace='/stream')
                    
                    # Request device to send a header packet for the new joiner
                    # This ensures they can decode subsequent audio chunks
                    device_socket = device_sockets.get(device_id)
                    if device_socket:
                        socketio.emit('send_header', {
                            'session_id': session_id
                        }, room=device_socket, namespace='/device')
                        _stream_log(
                            'header_resend_requested',
                            level='debug',
                            session_id=session_id,
                            device_id=device_id,
                            device_socket=device_socket,
                            listener_count=session.listener_count
                        )
                    else:
                        _stream_log(
                            'header_resend_skipped',
                            level='warning',
                            reason='device_socket_not_found',
                            session_id=session_id,
                            device_id=device_id
                        )
                    
                    log_audit(
                        action='LIVE_STREAM_JOINED',
                        success=True,
                        resource_type='device',
                        resource_id=device_id,
                        new_value={'session_id': session_id}
                    )
                    
                    _stream_log(
                        'listen_live_joined_existing_session',
                        user=_safe_username(),
                        sid=request.sid,
                        session_id=session_id,
                        device_id=device_id,
                        listener_count=session.listener_count
                    )
                    return
                # Session exists but is stopped/error - clean up and create new
                else:
                    logger.info(f"Cleaning up {session.status} session {session_id} for new stream request")
                    if device_id in active_sessions:
                        del active_sessions[device_id]
                    if device_id in listener_counts:
                        del listener_counts[device_id]
        
        # Create new stream session
        session = LiveStreamSession(
            device_id=device_id,
            started_by=current_user.id,
            status='requested',
            listener_count=1
        )
        db.session.add(session)
        db.session.commit()
        
        # Track session
        active_sessions[device_id] = session.id
        listener_counts[device_id] = 1
        
        # Create listener record
        listener = StreamListener(
            session_id=session.id,
            user_id=current_user.id,
            username=current_user.username
        )
        db.session.add(listener)
        db.session.commit()
        
        # Join room
        join_room(f'listeners_{device_id}', namespace='/stream')
        
        # Notify user that request is pending
        emit('stream_requested', {
            'session_id': session.id,
            'device_id': device_id,
            'status': 'waiting_for_device'
        })
        
        # CRITICAL FIX: Send command to device to start streaming
        device_socket = device_sockets.get(device_id)
        if device_socket:
            socketio.emit('live_stream_request', {
                'session_id': session.id,
                'device_id': device_id
            }, room=device_socket, namespace='/device')
            _stream_log(
                'stream_request_emitted_to_device_socket',
                session_id=session.id,
                device_id=device_id,
                device_socket=device_socket,
                listener_count=session.listener_count,
                requested_by=_safe_username()
            )
        else:
            _stream_log(
                'stream_request_queued_waiting_device_connect',
                level='warning',
                session_id=session.id,
                device_id=device_id,
                requested_by=_safe_username(),
                reason='device_not_connected'
            )
        
        log_audit(
            action='LIVE_STREAM_STARTED',
            success=True,
            resource_type='device',
            resource_id=device_id,
            new_value={'session_id': session.id, 'started_by': current_user.username}
        )
        
        _stream_log(
            'stream_session_created',
            session_id=session.id,
            device_id=device_id,
            requested_by=_safe_username(),
            listener_count=session.listener_count,
            status=session.status
        )
        
    except Exception as e:
        logger.error(f"Error handling stream request: {e}", exc_info=True)
        emit('stream_error', {'message': f'Failed to start stream: {str(e)}'})
        log_audit(
            action='LIVE_STREAM_REQUEST_FAILED',
            success=False,
            resource_type='device',
            resource_id=device_id,
            error_message=str(e)
        )


@socketio.on('stream_ready', namespace='/device')
def handle_stream_ready(data):
    """
    Device signals it's ready to stream
    Data: {'device_id': 'xxx' (actually android_id), 'session_id': '123' (string)}
    """
    # Android sends android_id as "device_id" in payload, need to resolve to actual device_id
    android_id_from_payload = data.get('device_id')
    session_id_str = data.get('session_id')
    
    if not android_id_from_payload or not session_id_str:
        _stream_log(
            'stream_ready_rejected',
            level='warning',
            reason='missing_fields',
            sid=request.sid,
            payload_keys=list(data.keys()) if isinstance(data, dict) else 'non_dict'
        )
        return
    
    try:
        # Resolve android_id to device_id
        device = DeviceInfo.query.filter_by(android_id=android_id_from_payload).first()
        if not device:
            _stream_log(
                'stream_ready_rejected',
                level='warning',
                reason='unknown_device',
                sid=request.sid,
                android_id=android_id_from_payload,
                session_id=session_id_str
            )
            emit('stream_error', {'message': 'Device not found'})
            return
        
        device_id = device.device_id  # Use actual device_id from database
        
        # Convert session_id string to int (Android sends as string)
        try:
            session_id = int(session_id_str)
        except (ValueError, TypeError):
            _stream_log(
                'stream_ready_rejected',
                level='warning',
                reason='invalid_session_id_format',
                sid=request.sid,
                android_id=android_id_from_payload,
                session_id=session_id_str
            )
            emit('stream_error', {'message': 'Invalid session ID'})
            return
        
        session = LiveStreamSession.query.get(session_id)
        if not session:
            _stream_log(
                'stream_ready_rejected',
                level='warning',
                reason='session_not_found',
                sid=request.sid,
                device_id=device_id,
                session_id=session_id
            )
            emit('stream_error', {'message': 'Session not found'})
            return
        
        # Verify session belongs to this device
        # Handle case where session was created with android_id as device_id
        # (frontend uses android_id in URL, so session might have android_id as device_id)
        session_device_id = session.device_id
        device_match = (session_device_id == device_id)
        
        # If no direct match, check if session device_id is the android_id of this device
        if not device_match:
            from .device_utils import get_android_id_for_device
            android_id_for_device = get_android_id_for_device(device_id)
            if android_id_for_device and session_device_id == android_id_for_device:
                device_match = True
                _stream_log(
                    'stream_ready_device_match_via_android_id',
                    session_id=session_id,
                    session_device_id=session_device_id,
                    resolved_device_id=device_id,
                    android_id=android_id_for_device
                )
        
        if not device_match:
            _stream_log(
                'stream_ready_rejected',
                level='warning',
                reason='session_device_mismatch',
                session_id=session_id,
                session_device_id=session_device_id,
                resolved_device_id=device_id,
                android_id=android_id_from_payload
            )
            emit('stream_error', {'message': 'Session device mismatch'})
            return
        
        # Update session status
        session.status = 'active'
        db.session.commit()
        
        # Notify all listeners in the room
        socketio.emit('stream_started', {
            'session_id': session_id,
            'device_id': device_id,
            'status': 'active',
            'listener_count': session.listener_count
        }, room=f'listeners_{device_id}', namespace='/stream')

        _stream_log(
            'stream_activated',
            session_id=session_id,
            device_id=device_id,
            listener_count=session.listener_count,
            sid=request.sid,
            previous_status='requested'
        )
        
        # Start Redis subscriber thread for this device (only if not already started)
        if device_id not in redis_subscribers:
            start_redis_subscriber(device_id)
        else:
            logger.info(f"Redis subscriber already active for device {device_id}")
        
    except Exception as e:
        logger.error(f"Error in stream_ready: {e}", exc_info=True)
        emit('stream_error', {'message': str(e)})


@socketio.on('audio_chunk', namespace='/device')
def handle_audio_chunk(data):
    """
    Device sends audio data chunk
    Data: {'device_id': 'xxx' (actually android_id), 'chunk': base64_encoded_audio, 'sequence': 123}
    """
    # Android sends android_id as "device_id" in payload, need to resolve to actual device_id
    android_id_from_payload = data.get('device_id')
    chunk_data = data.get('chunk')
    sequence = data.get('sequence', 0)
    
    if not android_id_from_payload or not chunk_data:
        _stream_log(
            'audio_chunk_rejected',
            level='debug',
            reason='missing_payload_fields',
            sid=request.sid,
            has_device_id=bool(android_id_from_payload),
            has_chunk=bool(chunk_data)
        )
        return
    
    try:
        # Resolve android_id to device_id (Android sends android_id as "device_id")
        device = DeviceInfo.query.filter_by(android_id=android_id_from_payload).first()
        if not device:
            _stream_log(
                'audio_chunk_rejected',
                level='warning',
                reason='unknown_device',
                sid=request.sid,
                android_id=android_id_from_payload,
                sequence=sequence
            )
            return
        
        device_id = device.device_id  # Use actual device_id from database
        
        # Publish to Redis for distribution to listeners (use device_id for consistency)
        if redis_client:
            try:
                redis_client.publish(
                    f'stream:{device_id}',
                    json.dumps({
                        'device_id': device_id,
                        'chunk': chunk_data,
                        'sequence': sequence,
                        'timestamp': datetime.utcnow().isoformat()
                    })
                )
            except Exception as redis_err:
                logger.error(f"Redis publish error for {device_id}: {redis_err}")
        else:
            logger.warning(f"Redis not available, cannot publish audio chunk for {device_id}")
        
        # Update bytes transferred IN MEMORY (no DB commit on hot path!)
        if device_id in active_sessions:
            # Initialize stats dict if needed
            if device_id not in stream_stats:
                stream_stats[device_id] = {
                    'bytes': 0,
                    'chunks': 0,
                    'last_flush': datetime.utcnow()
                }
            
            # Base64 decoding: 4 chars = 3 bytes
            chunk_bytes = len(chunk_data) * 3 // 4
            stream_stats[device_id]['bytes'] += chunk_bytes
            stream_stats[device_id]['chunks'] += 1

            # Sequence diagnostics + periodic telemetry logs with packet loss tracking
            if device_id not in stream_seq_state:
                stream_seq_state[device_id] = {'last_seq': None, 'chunk_count': 0, 'gaps': 0}

            prev_seq = stream_seq_state[device_id]['last_seq']
            stream_seq_state[device_id]['chunk_count'] += 1
            stream_seq_state[device_id]['last_seq'] = sequence

            # Track sequence gaps (packet loss detection)
            if prev_seq is not None and isinstance(sequence, int) and isinstance(prev_seq, int):
                if sequence < prev_seq:
                    _stream_log(
                        'audio_sequence_regression',
                        level='warning',
                        device_id=device_id,
                        previous_sequence=prev_seq,
                        current_sequence=sequence,
                        session_id=active_sessions.get(device_id)
                    )
                elif sequence > prev_seq + 1:
                    # Detected gap (missing packets)
                    gap_size = sequence - prev_seq - 1
                    stream_seq_state[device_id]['gaps'] += gap_size
                    _stream_log(
                        'audio_packet_gap',
                        level='warning',
                        device_id=device_id,
                        previous_sequence=prev_seq,
                        current_sequence=sequence,
                        gap_size=gap_size,
                        total_gaps=stream_seq_state[device_id]['gaps'],
                        session_id=active_sessions.get(device_id)
                    )

            chunk_count = stream_seq_state[device_id]['chunk_count']
            total_gaps = stream_seq_state[device_id].get('gaps', 0)
            # Calculate packet loss percentage: gaps / (received + gaps) * 100
            expected_packets = chunk_count + total_gaps
            packet_loss_pct = (total_gaps / expected_packets * 100) if expected_packets > 0 else 0.0
            
            if chunk_count == 1 or chunk_count % 250 == 0:
                _stream_log(
                    'audio_chunk_telemetry',
                    level='debug',
                    device_id=device_id,
                    session_id=active_sessions.get(device_id),
                    sequence=sequence,
                    chunk_count=chunk_count,
                    total_bytes=stream_stats[device_id]['bytes'],
                    listener_count=listener_counts.get(device_id, 0),
                    total_gaps=total_gaps,
                    packet_loss_pct=round(packet_loss_pct, 2)
                )
            
            # No db.session.commit() here! Background task handles it.
        
    except Exception as e:
        logger.error(f"Error handling audio chunk: {e}", exc_info=True)


@socketio.on('leave_stream', namespace='/stream')
def handle_leave_stream(data):
    """
    User stops listening to stream
    Data: {'device_id': 'xxx'}
    """
    if not current_user.is_authenticated:
        return
    
    device_id = data.get('device_id')
    if not device_id:
        return
    
    try:
        leave_room(f'listeners_{device_id}', namespace='/stream')
        
        # Update listener record
        if device_id in active_sessions:
            session_id = active_sessions[device_id]
            
            listener = StreamListener.query.filter_by(
                session_id=session_id,
                user_id=current_user.id,
                left_at=None
            ).first()
            
            if listener:
                listener.left_at = datetime.utcnow()
                listener.duration_seconds = int((listener.left_at - listener.joined_at).total_seconds())
                
                # Update session listener count
                session = LiveStreamSession.query.get(session_id)
                if session:
                    session.listener_count = max(0, session.listener_count - 1)
                    listener_counts[device_id] = session.listener_count
                    
                    # Broadcast updated listener count to all remaining listeners
                    socketio.emit('listener_count_update', {
                        'session_id': session_id,
                        'device_id': device_id,
                        'listener_count': session.listener_count
                    }, room=f'listeners_{device_id}', namespace='/stream')
                    
                    # Commit the listener leave (don't block on this!)
                    try:
                        db.session.commit()
                    except Exception as commit_err:
                        logger.error(f"Error committing listener leave: {commit_err}")
                        db.session.rollback()
                    
                    # If no more listeners, stop the stream
                    if session.listener_count == 0:
                        logger.info(f"No more listeners for {device_id}, stopping stream")
                        socketio.emit('stream_stop', {
                            'session_id': session_id,
                            'reason': 'no_listeners'
                        }, room=device_sockets.get(device_id), namespace='/device')
                        
                        stop_stream_session(session_id, 'no_listeners')
        
        log_audit(
            action='LIVE_STREAM_LEFT',
            success=True,
            resource_type='device',
            resource_id=device_id
        )
        
        logger.info(f"User {current_user.username} left stream for {device_id}")
        
    except Exception as e:
        logger.error(f"Error leaving stream: {e}", exc_info=True)

@socketio.on('join_video_stream', namespace='/stream')
def handle_join_video_stream(data):
    """User joins a video stream"""
    if not current_user.is_authenticated:
        return
        
    device_id = data.get('device_id')
    if not device_id:
        return
        
    try:
        from .device_utils import resolve_to_device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        join_room(f'video_listeners_{actual_device_id}', namespace='/stream')
        
        # If we have a cached init segment, send it immediately
        if actual_device_id in video_init_segments:
            emit('video_chunk', {'chunk': video_init_segments[actual_device_id]}, namespace='/stream')
            
        logger.info(f"User {current_user.username} joined video stream for {actual_device_id}")
    except Exception as e:
        logger.error(f"Error joining video stream: {e}", exc_info=True)

@socketio.on('leave_video_stream', namespace='/stream')
def handle_leave_video_stream(data):
    """User leaves a video stream"""
    if not current_user.is_authenticated:
        return
        
    device_id = data.get('device_id')
    if not device_id:
        return
        
    try:
        from .device_utils import resolve_to_device_id
        actual_device_id = resolve_to_device_id(device_id)
        leave_room(f'video_listeners_{actual_device_id}', namespace='/stream')
    except Exception as e:
        logger.error(f"Error leaving video stream: {e}", exc_info=True)

@socketio.on('join_screen_stream', namespace='/stream')
def handle_join_screen_stream(data):
    """User joins a screen stream"""
    if not current_user.is_authenticated:
        return
        
    device_id = data.get('device_id')
    if not device_id:
        return
        
    try:
        from .device_utils import resolve_to_device_id
        actual_device_id = resolve_to_device_id(device_id)
        
        join_room(f'screen_listeners_{actual_device_id}', namespace='/stream')
        
        if actual_device_id in screen_init_segments:
            emit('screen_chunk', {'chunk': screen_init_segments[actual_device_id]}, namespace='/stream')
            
        logger.info(f"User {current_user.username} joined screen stream for {actual_device_id}")
    except Exception as e:
        logger.error(f"Error joining screen stream: {e}", exc_info=True)

@socketio.on('leave_screen_stream', namespace='/stream')
def handle_leave_screen_stream(data):
    """User leaves a screen stream"""
    if not current_user.is_authenticated:
        return
        
    device_id = data.get('device_id')
    if not device_id:
        return
        
    try:
        from .device_utils import resolve_to_device_id
        actual_device_id = resolve_to_device_id(device_id)
        leave_room(f'screen_listeners_{actual_device_id}', namespace='/stream')
        logger.info(f"User {current_user.username} left screen stream for {actual_device_id}")
    except Exception as e:
        logger.error(f"Error leaving screen stream: {e}", exc_info=True)

def start_redis_subscriber(device_id):
    """Start Redis subscriber greenlet to forward audio chunks to WebSocket clients"""
    import eventlet
    
    if not redis_client:
        logger.error(f"Cannot start Redis subscriber for {device_id}: Redis not available")
        return
    
    def subscriber_thread():
        pubsub = None
        try:
            pubsub = redis_client.pubsub()
            pubsub.subscribe(f'stream:{device_id}')
            
            logger.info(f"Redis subscriber started for device {device_id}")
            
            for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        # Decode bytes to string if needed (Redis with decode_responses=False)
                        message_data = message['data']
                        if isinstance(message_data, bytes):
                            message_data = message_data.decode('utf-8')
                        data = json.loads(message_data)
                        
                        # Forward to all listeners in the room
                        socketio.emit('audio_data', data, 
                                    room=f'listeners_{device_id}', 
                                    namespace='/stream')
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decode error in Redis subscriber for {device_id}: {e}")
                    except Exception as e:
                        logger.error(f"Error processing Redis message for {device_id}: {e}")
                
                # Stop if session is no longer active
                if device_id not in active_sessions:
                    logger.info(f"Stopping Redis subscriber for {device_id}")
                    break
                    
        except redis.ConnectionError as e:
            logger.error(f"Redis connection error in subscriber for {device_id}: {e}")
        except Exception as e:
            logger.error(f"Error in Redis subscriber for {device_id}: {e}", exc_info=True)
        finally:
            if pubsub:
                try:
                    pubsub.unsubscribe()
                    pubsub.close()
                except:
                    pass
            # Remove from tracking when greenlet exits (defensive check)
            try:
                if device_id in redis_subscribers:
                    del redis_subscribers[device_id]
            except KeyError:
                pass  # Already cleaned up by stop_stream_session
            logger.info(f"Redis subscriber stopped for device {device_id}")
    
    # Spawn as eventlet green thread (cooperative multitasking)
    greenlet = eventlet.spawn(subscriber_thread)
    redis_subscribers[device_id] = greenlet


def flush_stream_stats():
    """Background task to flush in-memory stream stats to database every 5 seconds"""
    import eventlet
    
    logger.info("📊 Stream stats flush task started")
    
    while True:
        try:
            eventlet.sleep(5)  # Flush every 5 seconds
            
            if not stream_stats:
                continue
            
            # CRITICAL: Use Flask application context for database access
            if not _flask_app:
                logger.error("Flask app not initialized, cannot flush stats")
                continue
            
            with _flask_app.app_context():
                # Copy stats to avoid modification during iteration
                stats_snapshot = dict(stream_stats)
                
                for device_id, stats in stats_snapshot.items():
                    try:
                        if device_id in active_sessions:
                            session_id = active_sessions[device_id]
                            session = LiveStreamSession.query.get(session_id)
                            
                            if session:
                                # Update bytes transferred from in-memory stats
                                session.bytes_transferred = stats['bytes']
                                db.session.commit()
                                
                                # Update last flush time
                                stream_stats[device_id]['last_flush'] = datetime.utcnow()
                                
                                logger.debug(f"Flushed stats for {device_id}: {stats['bytes']} bytes, {stats['chunks']} chunks")
                        else:
                            # Session no longer active, clean up stats
                            if device_id in stream_stats:
                                del stream_stats[device_id]
                                
                    except Exception as e:
                        logger.error(f"Error flushing stats for {device_id}: {e}")
                    
        except Exception as e:
            logger.error(f"Error in stats flush task: {e}", exc_info=True)
            eventlet.sleep(5)  # Continue even on error


def stop_stream_session(session_id, reason='manual'):
    """Stop a streaming session and clean up"""
    try:
        session = LiveStreamSession.query.get(session_id)
        if not session:
            return
        
        device_id = session.device_id
        
        # CRITICAL: Remove from active_sessions FIRST to stop new audio chunks
        # This prevents race condition with handle_audio_chunk() updating stream_stats
        # while we're reading final values
        if device_id in active_sessions:
            del active_sessions[device_id]
        
        # Now flush final stats (no new chunks can arrive after this point)
        if device_id in stream_stats:
            final_bytes = stream_stats[device_id]['bytes']
            session.bytes_transferred = final_bytes
            final_chunks = stream_stats[device_id].get('chunks', 0)
            _stream_log(
                'stream_final_stats_flush',
                session_id=session_id,
                device_id=device_id,
                final_bytes=final_bytes,
                final_chunks=final_chunks,
                reason=reason
            )
        
        session.status = 'stopped'
        session.end_time = datetime.utcnow()
        session.duration_seconds = int((session.end_time - session.start_time).total_seconds())
        
        # Update all listeners who haven't left yet
        active_listeners = StreamListener.query.filter_by(
            session_id=session_id,
            left_at=None
        ).all()
        
        for listener in active_listeners:
            listener.left_at = session.end_time
            listener.duration_seconds = int((listener.left_at - listener.joined_at).total_seconds())
        
        db.session.commit()
        
        # Clean up remaining tracking dicts
        if device_id in listener_counts:
            del listener_counts[device_id]
        if device_id in redis_subscribers:
            # Subscriber thread will clean itself up when it sees active_sessions is empty
            # But we remove the tracking reference
            del redis_subscribers[device_id]
        if device_id in stream_stats:
            del stream_stats[device_id]
        if device_id in stream_seq_state:
            del stream_seq_state[device_id]
        # Also clear out the screen cache
        if device_id in screen_init_segments:
            del screen_init_segments[device_id]
            
        log_audit(
            action='LIVE_STREAM_STOPPED',
            success=True,
            resource_type='device',
            resource_id=device_id,
            new_value={'session_id': session_id, 'reason': reason}
        )
        
        _stream_log(
            'stream_session_stopped',
            session_id=session_id,
            device_id=device_id,
            reason=reason,
            duration_seconds=session.duration_seconds,
            listener_count=session.listener_count,
            bytes_transferred=session.bytes_transferred
        )
        
    except Exception as e:
        logger.error(f"Error stopping stream session {session_id}: {e}", exc_info=True)

