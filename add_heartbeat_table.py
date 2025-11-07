"""
Migration script to add device_heartbeats table
Run this script to add the heartbeat tracking feature
"""
from app import create_app, db
from app.models import DeviceHeartbeat
from sqlalchemy import inspect

def add_heartbeat_table():
    app = create_app()
    
    with app.app_context():
        inspector = inspect(db.engine)
        
        # Create device_heartbeats table if missing
        if 'device_heartbeats' not in inspector.get_table_names():
            print("📊 Creating device_heartbeats table...")
            try:
                DeviceHeartbeat.__table__.create(db.engine)
                print("✅ device_heartbeats table created successfully")
            except Exception as e:
                print(f"❌ Error creating device_heartbeats table: {e}")
                raise
        else:
            print("✅ device_heartbeats table already exists")

        # Ensure DeviceInfo has last_heartbeat and last_heartbeat_reason columns (ALTER TABLE for SQLite)
        try:
            device_info_columns = [c['name'] for c in inspector.get_columns('device_info')]
            alter_needed = False
            with db.engine.connect() as conn:
                if 'last_heartbeat' not in device_info_columns:
                    print("➕ Adding 'last_heartbeat' column to device_info table...")
                    conn.execute("ALTER TABLE device_info ADD COLUMN last_heartbeat DATETIME")
                    alter_needed = True
                if 'last_heartbeat_reason' not in device_info_columns:
                    print("➕ Adding 'last_heartbeat_reason' column to device_info table...")
                    conn.execute("ALTER TABLE device_info ADD COLUMN last_heartbeat_reason TEXT")
                    alter_needed = True
            if not alter_needed:
                print("✅ device_info already has heartbeat columns")
            else:
                print("✅ device_info heartbeat columns added")
        except Exception as e:
            print(f"⚠️ Could not alter device_info table: {e}")
            print("If running on a DB that does not support ALTER TABLE ADD COLUMN, run the appropriate migration tool.")

if __name__ == "__main__":
    print("🚀 Starting heartbeat table migration...")
    add_heartbeat_table()
    print("\n✅ Migration complete!")
    print("\n💡 Next steps:")
    print("1. Rebuild and deploy the Android app")
    print("2. Devices will now send heartbeats when GPS is unavailable")
    print("3. Dashboard will show devices as online based on heartbeat signals")
