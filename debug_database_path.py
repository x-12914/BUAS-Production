#!/usr/bin/env python3
"""
Debug script to find which database Flask is actually using
and list all .db files in the system
"""

import os
import sqlite3
import sys

print("=" * 60)
print("🔍 DATABASE PATH DEBUG UTILITY")
print("=" * 60)

# Method 1: Check what Flask would use
print("\n1️⃣  Flask Configuration:")
print("-" * 40)
base_dir = os.path.abspath(os.path.dirname(__file__))
app_dir = os.path.join(base_dir, 'app')
database_path = os.path.join(base_dir, 'uploads.db')
instance_path = os.path.join(base_dir, 'instance', 'uploads.db')

print(f"Script directory: {base_dir}")
print(f"App directory: {app_dir}")
print(f"Expected database (Flask): {database_path}")
print(f"Instance database path: {instance_path}")

# Method 2: Check which database files exist
print("\n2️⃣  Database Files Found:")
print("-" * 40)
db_locations = [
    database_path,
    instance_path,
    os.path.join(base_dir, 'uploads.db'),
    '/root/BUAS-Production/uploads.db',
    '/opt/BUAS-Production/uploads.db',
    '/var/www/BUAS-Production/uploads.db',
    '/home/opt/BUAS-Production/uploads.db',
]

existing_dbs = []
for db_path in db_locations:
    if os.path.exists(db_path):
        size = os.path.getsize(db_path)
        modified = os.path.getmtime(db_path)
        print(f"✅ FOUND: {db_path}")
        print(f"   Size: {size:,} bytes ({size/1024/1024:.2f} MB)")
        print(f"   Modified: {os.path.getctime(db_path)}")
        existing_dbs.append(db_path)
    else:
        print(f"❌ NOT FOUND: {db_path}")

# Method 3: Check device count in each database
print("\n3️⃣  Device Count in Each Database:")
print("-" * 40)
for db_path in existing_dbs:
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Try to get device count from different tables
        tables_to_check = ['device_info', 'device_location', 'recording_event', 'upload']
        
        print(f"\n📂 {db_path}:")
        for table in tables_to_check:
            try:
                cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
                if cursor.fetchone():
                    cursor.execute(f"SELECT COUNT(DISTINCT device_id) FROM {table}")
                    count = cursor.fetchone()[0]
                    print(f"   • {table}: {count} unique devices")
                else:
                    print(f"   • {table}: Table not found")
            except Exception as e:
                print(f"   • {table}: Error - {e}")
        
        # List actual device IDs
        try:
            cursor.execute("""
                SELECT DISTINCT device_id FROM (
                    SELECT device_id FROM device_info
                    UNION
                    SELECT device_id FROM device_location
                    UNION
                    SELECT device_id FROM recording_event
                    UNION
                    SELECT device_id FROM upload
                ) ORDER BY device_id
            """)
            devices = cursor.fetchall()
            if devices:
                print(f"   📱 Device IDs found: {', '.join([d[0] for d in devices])}")
            else:
                print(f"   📱 No devices found")
        except Exception as e:
            print(f"   📱 Error listing devices: {e}")
        
        conn.close()
    except Exception as e:
        print(f"❌ Error reading {db_path}: {e}")

# Method 4: Check environment and working directory
print("\n4️⃣  Environment Info:")
print("-" * 40)
print(f"Python executable: {sys.executable}")
print(f"Current working dir: {os.getcwd()}")
print(f"Script location: {os.path.abspath(__file__)}")

# Method 5: Import Flask app and check its database
print("\n5️⃣  Flask App Database Configuration:")
print("-" * 40)
try:
    # Add the base directory to sys.path
    sys.path.insert(0, base_dir)
    
    from app import create_app
    app = create_app()
    
    with app.app_context():
        flask_db_uri = app.config.get('SQLALCHEMY_DATABASE_URI')
        print(f"✅ Flask Database URI: {flask_db_uri}")
        
        # Extract actual file path from URI
        if flask_db_uri.startswith('sqlite:///'):
            flask_db_path = flask_db_uri.replace('sqlite:///', '')
            print(f"✅ Flask Database Path: {flask_db_path}")
            
            if os.path.exists(flask_db_path):
                size = os.path.getsize(flask_db_path)
                print(f"✅ File exists: {size:,} bytes ({size/1024/1024:.2f} MB)")
                
                # Check device count
                try:
                    conn = sqlite3.connect(flask_db_path)
                    cursor = conn.cursor()
                    cursor.execute("""
                        SELECT COUNT(DISTINCT device_id) FROM (
                            SELECT device_id FROM device_info
                            UNION
                            SELECT device_id FROM device_location
                            UNION
                            SELECT device_id FROM recording_event
                            UNION
                            SELECT device_id FROM upload
                        )
                    """)
                    total_devices = cursor.fetchone()[0]
                    print(f"✅ Total unique devices: {total_devices}")
                    
                    cursor.execute("""
                        SELECT DISTINCT device_id FROM (
                            SELECT device_id FROM device_info
                            UNION
                            SELECT device_id FROM device_location
                            UNION
                            SELECT device_id FROM recording_event
                            UNION
                            SELECT device_id FROM upload
                        ) ORDER BY device_id
                    """)
                    devices = cursor.fetchall()
                    if devices:
                        print(f"✅ Device IDs: {', '.join([d[0] for d in devices])}")
                    conn.close()
                except Exception as e:
                    print(f"❌ Error querying Flask database: {e}")
            else:
                print(f"❌ Flask database file does NOT exist!")
        
except Exception as e:
    print(f"❌ Error loading Flask app: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("🎯 RECOMMENDATION:")
print("=" * 60)
print("The database Flask is ACTUALLY using is shown in section 5.")
print("Update delete_device.py to use that exact path.")
print("=" * 60)
