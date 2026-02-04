import sqlite3
import os

db_path = r'c:\Users\BRAHIOM BASHIR\Downloads\BUAS-Production\uploads.db'

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if the column exists
        cursor.execute("PRAGMA table_info(device_info)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'fallback_active' not in columns:
            print("Adding 'fallback_active' column to 'device_info' table...")
            cursor.execute("ALTER TABLE device_info ADD COLUMN fallback_active BOOLEAN DEFAULT 0")
            conn.commit()
            print("Successfully added 'fallback_active' column.")
        else:
            print("'fallback_active' column already exists.")
            
        conn.close()
    except Exception as e:
        print(f"An error occurred during migration: {e}")

if __name__ == "__main__":
    migrate()
