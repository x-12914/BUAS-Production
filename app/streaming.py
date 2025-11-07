"""
Live Audio Streaming Module
Handles real-time audio streaming via WebSocket (Flask-SocketIO)
"""

import os
import json
import redis
import base64
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

# Background stats flush greenlet
stats_flush_greenlet = None
_flask_app = None  # Store Flask app reference for background tasks


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
    # TODO: Implement proper authentication for Socket.IO
    # For now, allow all connections to test functionality
    logger.info(f"Client connected to streaming namespace from {request.sid}")
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
                
                # If no more listeners, stop the stream
                if session.listener_count == 0:
                    logger.info(f"No more listeners for {session.device_id}, stopping stream")
                    socketio.emit('stream_stop', {
                        'session_id': session.id,
                        'reason': 'no_listeners'
                    }, room=device_sockets.get(session.device_id), namespace='/device')
                    
                    stop_stream_session(session.id, 'no_listeners')
        
        db.session.commit()
        logger.info(f"User {current_user.username} disconnected from streaming - cleaned up {len(active_listeners)} listeners")
        
    except Exception as e:
        logger.error(f"Error handling user disconnect: {e}", exc_info=True)


@socketio.on('connect', namespace='/device')
def handle_device_connect():
    """Handle Android device connection"""
    android_id = request.args.get('android_id')
    
    if not android_id:
        logger.warning("Device connection attempt without android_id")
        disconnect()
        return False
    
    # Verify device exists in database
    device = DeviceInfo.query.filter_by(android_id=android_id).first()
    if not device:
        logger.warning(f"Unknown device attempted connection: {android_id}")
        disconnect()
        return False
    
    device_sockets[device.device_id] = request.sid
    logger.info(f"Device {device.device_id} connected to streaming namespace")
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
        logger.info(f"Device {device_id} disconnected from streaming")
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
    if not device_id_param:
        emit('stream_error', {'message': 'Device ID required'})
        return
    
    try:
        # Resolve device_id (frontend may send android_id or device_id)
        from .device_utils import resolve_to_device_id
        device_id = resolve_to_device_id(device_id_param)
        
        # Check if user has permission to access this device
        device = DeviceInfo.query.filter_by(device_id=device_id).first()
        if not device:
            emit('stream_error', {'message': 'Device not found'})
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
                        logger.warning(f"Cleaning up stale session {session_id} for {device_id} (requested {time_since_request:.0f}s ago)")
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
                        
                        logger.info(f"User {current_user.username} waiting for existing stream request for {device_id}")
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
                        logger.debug(f"Requested header resend from device {device_id}")
                    else:
                        logger.warning(f"Cannot request header from {device_id}: device socket not found")
                    
                    log_audit(
                        action='LIVE_STREAM_JOINED',
                        success=True,
                        resource_type='device',
                        resource_id=device_id,
                        new_value={'session_id': session_id}
                    )
                    
                    logger.info(f"User {current_user.username} joined existing stream for {device_id} - {session.listener_count} total listeners")
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
        
        log_audit(
            action='LIVE_STREAM_STARTED',
            success=True,
            resource_type='device',
            resource_id=device_id,
            new_value={'session_id': session.id, 'started_by': current_user.username}
        )
        
        logger.info(f"Stream session {session.id} created for device {device_id} by {current_user.username}")
        
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
        logger.warning("stream_ready received without device_id or session_id")
        return
    
    try:
        # Resolve android_id to device_id
        device = DeviceInfo.query.filter_by(android_id=android_id_from_payload).first()
        if not device:
            logger.warning(f"stream_ready from unknown device: {android_id_from_payload}")
            emit('stream_error', {'message': 'Device not found'})
            return
        
        device_id = device.device_id  # Use actual device_id from database
        
        # Convert session_id string to int (Android sends as string)
        try:
            session_id = int(session_id_str)
        except (ValueError, TypeError):
            logger.warning(f"Invalid session_id format: {session_id_str}")
            emit('stream_error', {'message': 'Invalid session ID'})
            return
        
        session = LiveStreamSession.query.get(session_id)
        if not session:
            logger.warning(f"Stream session {session_id} not found")
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
                logger.info(f"Session {session_id} device match via android_id: session.device_id={session_device_id} matches android_id={android_id_for_device} of device_id={device_id}")
        
        if not device_match:
            logger.warning(f"Session {session_id} device mismatch: session.device_id={session_device_id}, resolved device_id={device_id}, android_id={android_id_from_payload}")
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
        
        logger.info(f"Stream {session_id} for device {device_id} is now active")
        
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
        return
    
    try:
        # Resolve android_id to device_id (Android sends android_id as "device_id")
        device = DeviceInfo.query.filter_by(android_id=android_id_from_payload).first()
        if not device:
            logger.warning(f"Audio chunk from unknown device: {android_id_from_payload}")
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
                    
                    db.session.commit()
                    
                    # Broadcast updated listener count to all remaining listeners
                    socketio.emit('listener_count_update', {
                        'session_id': session_id,
                        'device_id': device_id,
                        'listener_count': session.listener_count
                    }, room=f'listeners_{device_id}', namespace='/stream')
                    
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
            logger.info(f"Final stats flush for {device_id}: {final_bytes} bytes")
        
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
        
        log_audit(
            action='LIVE_STREAM_STOPPED',
            success=True,
            resource_type='device',
            resource_id=device_id,
            new_value={'session_id': session_id, 'reason': reason}
        )
        
        logger.info(f"Stream session {session_id} stopped: {reason}")
        
    except Exception as e:
        logger.error(f"Error stopping stream session {session_id}: {e}", exc_info=True)

