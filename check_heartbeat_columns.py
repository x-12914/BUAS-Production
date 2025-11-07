#!/usr/bin/env python3
"""
Check if heartbeat columns exist in the production database
"""
from app import create_app, db
from sqlalchemy import inspect

def check_columns():
    app = create_app()
    
    with app.app_context():
        print("=" * 80)
        print("CHECKING DATABASE COLUMNS")
        print("=" * 80)
        
        # Show database path
        print(f"\n📁 Database URI: {db.engine.url}")
        
        inspector = inspect(db.engine)
        
        # Check device_info columns
        print("\n📊 device_info table columns:")
        device_info_columns = inspector.get_columns('device_info')
        for col in device_info_columns:
            print(f"  - {col['name']} ({col['type']})")
        
        # Check if heartbeat columns exist
        column_names = [c['name'] for c in device_info_columns]
        print("\n🔍 Heartbeat columns check:")
        print(f"  last_heartbeat: {'✅ EXISTS' if 'last_heartbeat' in column_names else '❌ MISSING'}")
        print(f"  last_heartbeat_reason: {'✅ EXISTS' if 'last_heartbeat_reason' in column_names else '❌ MISSING'}")
        
        # Check device_heartbeats table
        print("\n📋 Tables in database:")
        tables = inspector.get_table_names()
        for table in tables:
            marker = "✅" if table == "device_heartbeats" else "  "
            print(f"  {marker} {table}")
        
        if 'device_heartbeats' in tables:
            print("\n📊 device_heartbeats table columns:")
            hb_columns = inspector.get_columns('device_heartbeats')
            for col in hb_columns:
                print(f"  - {col['name']} ({col['type']})")
        else:
            print("\n❌ device_heartbeats table does NOT exist")
        
        print("\n" + "=" * 80)

if __name__ == '__main__':
    check_columns()
