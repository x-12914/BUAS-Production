#!/usr/bin/env python3
"""Check if device is receiving stream_start command"""

from app import create_app, db
from app.models import DeviceInfo, LiveStreamSession
from app.device_utils import resolve_to_device_id, get_android_id_for_device
from datetime import datetime, timedelta

app = create_app()

with app.app_context():
    print("=" * 70)
    print("CHECKING: Is device receiving stream_start command?")
    print("=" * 70)
    
    # Device identifiers
    android_polls_with = "samsungSM-S908U1"
    print(f"\n1. Device polling identifier: {android_polls_with}")
    
    # Resolve to device_id
    resolved_device_id = resolve_to_device_id(android_polls_with)
    print(f"2. Resolved device_id: {resolved_device_id}")
    
    # Get android_id
    android_id = get_android_id_for_device(resolved_device_id)
    print(f"3. Android ID for device: {android_id}")
    
    # Check recent sessions
    print("\n" + "=" * 70)
    print("4. Recent LiveStreamSessions (last 10 minutes):")
    print("=" * 70)
    ten_minutes_ago = datetime.utcnow() - timedelta(minutes=10)
    recent_sessions = LiveStreamSession.query.filter(
        LiveStreamSession.start_time >= ten_minutes_ago
    ).order_by(LiveStreamSession.start_time.desc()).all()
    
    if recent_sessions:
        for session in recent_sessions:
            print(f"\n   Session {session.id}:")
            print(f"   - device_id: {session.device_id}")
            print(f"   - status: {session.status}")
            print(f"   - created: {session.start_time}")
            print(f"   - ended: {session.end_time}")
            
            # Check if this session matches our device
            matches_device = False
            if session.device_id == resolved_device_id:
                matches_device = True
                print(f"   - ✅ Matches resolved device_id ({resolved_device_id})")
            elif android_id and session.device_id == android_id:
                matches_device = True
                print(f"   - ✅ Matches android_id ({android_id})")
            else:
                print(f"   - ❌ Does NOT match this device")
            
            # Check if it's in the right state for command polling
            if matches_device:
                if session.status == 'requested':
                    print(f"   - ✅ Status is 'requested' - device SHOULD receive stream_start")
                elif session.status == 'active':
                    print(f"   - ⚠️  Status is 'active' - device already connected")
                elif session.status == 'stopped':
                    print(f"   - ❌ Status is 'stopped' - device will NOT receive command")
                    if session.end_time:
                        time_diff = (session.end_time - session.start_time).total_seconds()
                        print(f"   - ⚠️  Session was stopped after {time_diff:.0f} seconds")
    else:
        print("   No recent sessions found")
    
    # Simulate command polling check
    print("\n" + "=" * 70)
    print("5. Simulating command polling check:")
    print("=" * 70)
    
    # Check for requested sessions with resolved device_id
    session1 = LiveStreamSession.query.filter_by(
        device_id=resolved_device_id,
        status='requested'
    ).order_by(LiveStreamSession.start_time.desc()).first()
    
    if session1:
        print(f"   ✅ Found session {session1.id} with device_id={resolved_device_id}, status='requested'")
        print(f"   → Device SHOULD receive: {{'command': 'stream_start', 'session_id': {session1.id}}}")
    else:
        print(f"   ❌ No session found with device_id={resolved_device_id}, status='requested'")
        
        # Check with android_id
        if android_id:
            session2 = LiveStreamSession.query.filter_by(
                device_id=android_id,
                status='requested'
            ).order_by(LiveStreamSession.start_time.desc()).first()
            
            if session2:
                print(f"   ✅ Found session {session2.id} with device_id={android_id} (android_id), status='requested'")
                print(f"   → Device SHOULD receive: {{'command': 'stream_start', 'session_id': {session2.id}}}")
            else:
                print(f"   ❌ No session found with device_id={android_id} (android_id), status='requested'")
    
    # Instructions
    print("\n" + "=" * 70)
    print("HOW TO CHECK IF DEVICE RECEIVES COMMAND:")
    print("=" * 70)
    print("\nA. Backend Logs (VPS):")
    print("   pm2 logs flask-server --lines 100 | grep -E 'stream_start|command.*samsungSM|device.*samsungSM'")
    print("\nB. Android Logs (Local):")
    print("   adb logcat -s PersistentService:D | grep -E 'STREAM_START|stream_start|Command.*stream'")
    print("\nC. Real-time Backend Monitoring:")
    print("   pm2 logs flask-server --lines 0")
    print("   (Then click 'Listen Live' and watch for command polling logs)")
    print("\nD. Check Command Polling Endpoint Directly:")
    print(f"   curl 'http://localhost:5000/api/command?device_id={android_polls_with}'")
    print("   (Should return stream_start command if session exists)")

