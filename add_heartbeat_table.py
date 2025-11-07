"""
Migration script to add device_heartbeats table
Run this script to add the heartbeat tracking feature
"""
from app import create_app, db
from app.models import DeviceHeartbeat
from sqlalchemy import inspect, text

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
            if 'last_heartbeat' not in device_info_columns:
                print("➕ Adding 'last_heartbeat' column to device_info table...")
                with db.engine.connect() as conn:
                    conn.execute(text("ALTER TABLE device_info ADD COLUMN last_heartbeat DATETIME"))
                    conn.commit()
                alter_needed = True
            if 'last_heartbeat_reason' not in device_info_columns:
                print("➕ Adding 'last_heartbeat_reason' column to device_info table...")
                with db.engine.connect() as conn:
                    conn.execute(text("ALTER TABLE device_info ADD COLUMN last_heartbeat_reason TEXT"))
                    conn.commit()
                alter_needed = True
            
            if not alter_needed:
                print("✅ device_info already has heartbeat columns")
            else:
                print("✅ device_info heartbeat columns added successfully")
                
                # Add index for fast lookups
                try:
                    print("➕ Adding index on last_heartbeat column...")
                    with db.engine.connect() as conn:
                        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_device_info_last_heartbeat ON device_info(last_heartbeat)"))
                        conn.commit()
                    print("✅ Index created successfully")
                except Exception as idx_error:
                    print(f"⚠️ Could not create index (may already exist): {idx_error}")
        except Exception as e:
            print(f"❌ Error altering device_info table: {e}")
            print("Please run the migration manually or check database permissions.")
            raise

if __name__ == "__main__":
    print("🚀 Starting heartbeat table migration...")
    add_heartbeat_table()
    print("\n✅ Migration complete!")
    print("\n💡 Next steps:")
    print("1. Rebuild and deploy the Android app")
    print("2. Devices will now send heartbeats when GPS is unavailable")
    print("3. Dashboard will show devices as online based on heartbeat signals")
