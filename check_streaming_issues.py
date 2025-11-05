#!/usr/bin/env python3
"""Check streaming issues one by one"""

from app import create_app, db
from app.models import DeviceInfo, LiveStreamSession
from app.device_utils import resolve_to_device_id

app = create_app()

with app.app_context():
    print("=" * 70)
    print("CHECK 1: DeviceInfo for device_id '85c3da0a1a3f2da8'")
    print("=" * 70)
    device = DeviceInfo.query.filter_by(device_id='85c3da0a1a3f2da8').first()
    if device:
        print(f"✅ Found: device_id={device.device_id}")
        print(f"   android_id={device.android_id}")
        print(f"   display_name={device.display_name}")
    else:
        print("❌ NOT FOUND: device_id '85c3da0a1a3f2da8' does not exist in DeviceInfo")
    
    print("\n" + "=" * 70)
    print("CHECK 2: DeviceInfo for 'samsungSM-S908U1' (as device_id or android_id)")
    print("=" * 70)
    device2 = DeviceInfo.query.filter_by(device_id='samsungSM-S908U1').first()
    if device2:
        print(f"✅ Found by device_id: device_id={device2.device_id}, android_id={device2.android_id}")
    else:
        device3 = DeviceInfo.query.filter_by(android_id='samsungSM-S908U1').first()
        if device3:
            print(f"✅ Found by android_id: device_id={device3.device_id}, android_id={device3.android_id}")
        else:
            print("❌ NOT FOUND: 'samsungSM-S908U1' not found as device_id or android_id")
            print("   This means Android device 'samsungSM-S908U1' is not registered in DeviceInfo")
    
    print("\n" + "=" * 70)
    print("CHECK 3: LiveStreamSession for session_id 8")
    print("=" * 70)
    session = LiveStreamSession.query.filter_by(id=8).first()
    if session:
        print(f"✅ Found: session_id={session.id}")
        print(f"   device_id={session.device_id}")
        print(f"   status={session.status}")
        print(f"   started_by={session.started_by}")
        print(f"   start_time={session.start_time}")
    else:
        print("❌ NOT FOUND: session_id 8 does not exist")
    
    print("\n" + "=" * 70)
    print("CHECK 4: All pending/requested LiveStreamSessions")
    print("=" * 70)
    pending = LiveStreamSession.query.filter_by(status='requested').all()
    if pending:
        for s in pending:
            print(f"Session {s.id}: device_id={s.device_id}, status={s.status}, created={s.start_time}")
    else:
        print("No pending 'requested' sessions found")
    
    print("\n" + "=" * 70)
    print("CHECK 5: Test resolve_to_device_id('samsungSM-S908U1')")
    print("=" * 70)
    resolved = resolve_to_device_id('samsungSM-S908U1')
    print(f"Input: 'samsungSM-S908U1'")
    print(f"Resolved to: '{resolved}'")
    if resolved == 'samsungSM-S908U1':
        print("⚠️  Resolution returned same value - may not be in database")
    else:
        print(f"✅ Resolution successful: 'samsungSM-S908U1' -> '{resolved}'")
    
    print("\n" + "=" * 70)
    print("CHECK 6: Check if resolved device_id matches session device_id")
    print("=" * 70)
    if session:
        if resolved == session.device_id:
            print(f"✅ MATCH: Resolved device_id '{resolved}' matches session device_id '{session.device_id}'")
        else:
            print(f"❌ MISMATCH: Resolved device_id '{resolved}' != session device_id '{session.device_id}'")
            print("   This is the problem - device polling won't find the session!")
    
    print("\n" + "=" * 70)
    print("CHECK 7: All DeviceInfo records (to see what's actually in DB)")
    print("=" * 70)
    all_devices = DeviceInfo.query.all()
    print(f"Total DeviceInfo records: {len(all_devices)}")
    for d in all_devices[:10]:  # Show first 10
        print(f"  device_id={d.device_id}, android_id={d.android_id}, display_name={d.display_name}")
    if len(all_devices) > 10:
        print(f"  ... and {len(all_devices) - 10} more")

