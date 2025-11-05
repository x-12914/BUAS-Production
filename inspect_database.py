#!/usr/bin/env python3
"""
Quick database inspection to see what tables exist
"""

import sqlite3
import os

DB_PATH = "/home/opt/BUAS/instance/uploads.db"

def inspect_database():
    print(f"Inspecting database: {DB_PATH}")
    print("="*50)
    
    if not os.path.exists(DB_PATH):
        print("❌ Database file does not exist!")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # List all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        if tables:
            print("📋 Existing tables:")
            for table in tables:
                table_name = table[0]
                print(f"  - {table_name}")
                
                # Show schema for each table
                cursor.execute(f"PRAGMA table_info({table_name});")
                columns = cursor.fetchall()
                for col in columns:
                    print(f"    {col[1]} ({col[2]})")
                print()
        else:
            print("📋 No tables found in database")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error inspecting database: {e}")

if __name__ == "__main__":
    inspect_database()