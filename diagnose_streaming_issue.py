#!/usr/bin/env python3
"""Diagnose why stream_start command isn't reaching the device"""

from app import create_app, db
from app.models import DeviceInfo, LiveStreamSession
from app.device_utils import resolve_to_device_id, get_android_id_for_device

app = create_app()

with app.app_context():
    print("=" * 70)
    print("DIAGNOSIS: Why stream_start command isn't reaching device")
    print("=" * 70)
    
    # Step 1: What Android polls with
    android_polls_with = "samsungSM-S908U1"
    print(f"\n1. Android polls with: device_id={android_polls_with}")
    
    # Step 2: Resolve to device_id
    resolved_device_id = resolve_to_device_id(android_polls_with)
    print(f"2. resolve_to_device_id('{android_polls_with}') = '{resolved_device_id}'")
    
    # Step 3: Get android_id for resolved device_id
    android_id = get_android_id_for_device(resolved_device_id)
    print(f"3. get_android_id_for_device('{resolved_device_id}') = {android_id}")
    
    # Step 4: Check session 9
    print("\n" + "=" * 70)
    print("4. Checking LiveStreamSession 9:")
    print("=" * 70)
    session = LiveStreamSession.query.filter_by(id=9).first()
    if session:
        print(f"   Session 9: device_id={session.device_id}, status={session.status}")
        print(f"   Created: {session.start_time}")
        
        # Check if session matches resolved device_id
        if session.device_id == resolved_device_id:
            print(f"   ✅ Session device_id matches resolved device_id")
        else:
            print(f"   ❌ Session device_id ({session.device_id}) != resolved device_id ({resolved_device_id})")
        
        # Check if session matches android_id
        if android_id and session.device_id == android_id:
            print(f"   ✅ Session device_id matches android_id ({android_id})")
        else:
            print(f"   ❌ Session device_id ({session.device_id}) != android_id ({android_id})")
        
        # Check status
        if session.status == 'requested':
            print(f"   ✅ Session status is 'requested'")
        else:
            print(f"   ❌ Session status is '{session.status}', not 'requested'")
    else:
        print("   ❌ Session 9 does not exist!")
    
    # Step 5: Simulate the command polling logic
    print("\n" + "=" * 70)
    print("5. Simulating command polling logic:")
    print("=" * 70)
    
    # First check: session with resolved device_id
    stream_session_1 = LiveStreamSession.query.filter_by(
        device_id=resolved_device_id,
        status='requested'
    ).order_by(LiveStreamSession.start_time.desc()).first()
    
    if stream_session_1:
        print(f"   ✅ Found session {stream_session_1.id} with device_id={resolved_device_id}, status='requested'")
    else:
        print(f"   ❌ No session found with device_id={resolved_device_id}, status='requested'")
        
        # Second check: session with android_id as device_id
        if android_id:
            stream_session_2 = LiveStreamSession.query.filter_by(
                device_id=android_id,
                status='requested'
            ).order_by(LiveStreamSession.start_time.desc()).first()
            
            if stream_session_2:
                print(f"   ✅ Found session {stream_session_2.id} with device_id={android_id} (android_id), status='requested'")
            else:
                print(f"   ❌ No session found with device_id={android_id} (android_id), status='requested'")
    
    # Step 6: Check all requested sessions
    print("\n" + "=" * 70)
    print("6. All 'requested' sessions in database:")
    print("=" * 70)
    all_requested = LiveStreamSession.query.filter_by(status='requested').all()
    if all_requested:
        for s in all_requested:
            print(f"   Session {s.id}: device_id={s.device_id}, created={s.start_time}")
    else:
        print("   No 'requested' sessions found")
    
    # Step 7: Check DeviceInfo records
    print("\n" + "=" * 70)
    print("7. DeviceInfo records for both identifiers:")
    print("=" * 70)
    device1 = DeviceInfo.query.filter_by(device_id=android_polls_with).first()
    if device1:
        print(f"   ✅ Found: device_id={device1.device_id}, android_id={device1.android_id}")
    else:
        print(f"   ❌ Not found: device_id={android_polls_with}")
    
    device2 = DeviceInfo.query.filter_by(device_id=android_id).first() if android_id else None
    if device2:
        print(f"   ✅ Found: device_id={device2.device_id}, android_id={device2.android_id}")
    else:
        print(f"   ❌ Not found: device_id={android_id} (if android_id is None, this is expected)")
    
    # Step 8: Check if backend is checking correctly
    print("\n" + "=" * 70)
    print("8. Expected behavior:")
    print("=" * 70)
    print(f"   Android polls: ?device_id={android_polls_with}")
    print(f"   Backend resolves: {android_polls_with} -> {resolved_device_id}")
    print(f"   Backend gets android_id: {android_id}")
    print(f"   Backend checks session with device_id={resolved_device_id} -> {stream_session_1 is not None}")
    if not stream_session_1 and android_id:
        print(f"   Backend checks session with device_id={android_id} -> {stream_session_2 is not None if 'stream_session_2' in locals() else 'N/A'}")
    
    print("\n" + "=" * 70)
    print("RECOMMENDATION:")
    print("=" * 70)
    if session and session.status != 'requested':
        print("   ⚠️  Session status is not 'requested'. Check if session was created correctly.")
    if not stream_session_1 and (not android_id or not stream_session_2):
        print("   ⚠️  No matching session found. Check:")
        print("      - Is the backend code deployed?")
        print("      - Is the backend restarted?")
        print("      - Check backend logs for command polling requests")
        print("      - Verify device is actually polling /api/command")

