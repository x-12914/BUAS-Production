#!/usr/bin/env python3
"""
Remove mock/test devices from the database
These devices are tracked in git and should not be in production
"""

import sqlite3
from datetime import datetime

def remove_mock_devices():
    """Remove all mock device entries from the database"""
    
    print("🧹 Removing Mock Devices from Database")
    print("=" * 60)
    
    # Mock device IDs to remove
    mock_devices = [
        'device123',
        'device456', 
        'device789',
        'ITELitel_A665L',
        'samsungSM-G998U1'
    ]
    
    print(f"🎯 Target devices: {', '.join(mock_devices)}")
    print()
    
    try:
        conn = sqlite3.connect('uploads.db')
        cursor = conn.cursor()
        
        # Tables that contain device_id
        tables_with_devices = [
            'device_location',
            'recording_event',
            'device_command',
            'device_info',
            'device_assignments',
            'sms_messages',
            'call_logs',
            'upload',
            'uploads'
        ]
        
        total_deleted = 0
        
        for table in tables_with_devices:
            # Check if table exists
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (table,)
            )
            if not cursor.fetchone():
                continue
            
            # Count records before deletion
            placeholders = ','.join('?' * len(mock_devices))
            cursor.execute(
                f"SELECT COUNT(*) FROM {table} WHERE device_id IN ({placeholders})",
                mock_devices
            )
            count_before = cursor.fetchone()[0]
            
            if count_before > 0:
                # Delete mock device records
                cursor.execute(
                    f"DELETE FROM {table} WHERE device_id IN ({placeholders})",
                    mock_devices
                )
                deleted = cursor.rowcount
                total_deleted += deleted
                print(f"✅ {table:20s}: Deleted {deleted:4d} records")
        
        # Commit changes
        conn.commit()
        conn.close()
        
        print()
        print("=" * 60)
        print(f"🎉 Cleanup Complete!")
        print(f"📊 Total records deleted: {total_deleted}")
        print()
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error cleaning mock devices: {e}")
        return False

if __name__ == "__main__":
    if remove_mock_devices():
        print("✅ Database cleanup successful")
        print("\n📋 Next steps:")
        print("   1. Database files will be added to .gitignore")
        print("   2. You'll run git commands to untrack the database files")
    else:
        print("❌ Database cleanup failed")
