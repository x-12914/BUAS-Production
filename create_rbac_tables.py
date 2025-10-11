#!/usr/bin/env python3
"""
BUAS RBAC Database Migration Script
Creates all necessary tables for Role-Based Access Control system
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 1
"""

from app import create_app
from app.models import db
from datetime import datetime
import sqlite3
import os
import shutil

def backup_database():
    """Create backup of current database before migration"""
    db_path = 'uploads.db'
    backup_path = f'uploads.db.backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    
    if os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)
        print(f"✅ Database backed up to: {backup_path}")
        return backup_path
    else:
        print("⚠️  No existing database found - fresh installation")
        return None

def create_rbac_tables():
    """Create all RBAC tables according to the implementation guide"""
    
    # SQL for creating RBAC tables
    rbac_tables_sql = [
        """
        -- Agencies table (single BUAS entry for now)
        CREATE TABLE IF NOT EXISTS agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL DEFAULT 'BUAS',
            full_name VARCHAR(255) DEFAULT 'Briech UAS',
            logo_url VARCHAR(255),
            primary_color VARCHAR(7) DEFAULT '#1a73e8',
            secondary_color VARCHAR(7) DEFAULT '#0d47a1',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE
        );
        """,
        
        """
        -- Users table for authentication
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL CHECK(role IN ('super_super_admin', 'super_user', 'analyst', 'operator')),
            agency_id INTEGER DEFAULT 1,
            
            -- Security fields
            must_change_password BOOLEAN DEFAULT TRUE,
            password_changed_at TIMESTAMP,
            password_expires_at TIMESTAMP,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP,
            last_login TIMESTAMP,
            last_login_ip VARCHAR(45),
            
            -- Management fields
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            updated_at TIMESTAMP,
            deactivated_at TIMESTAMP,
            deactivated_by INTEGER,
            is_active BOOLEAN DEFAULT TRUE,
            
            FOREIGN KEY (agency_id) REFERENCES agencies(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (deactivated_by) REFERENCES users(id)
        );
        """,
        
        """
        -- Device assignments for Analysts
        CREATE TABLE IF NOT EXISTS device_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            device_id VARCHAR(100) NOT NULL,
            assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            assigned_by INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (assigned_by) REFERENCES users(id),
            UNIQUE(user_id, device_id)
        );
        """,
        
        """
        -- User sessions for Flask-Login
        CREATE TABLE IF NOT EXISTS user_sessions (
            id VARCHAR(255) PRIMARY KEY,
            user_id INTEGER NOT NULL,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """,
        
        """
        -- Comprehensive audit logging
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username VARCHAR(50),
            action VARCHAR(100) NOT NULL,
            resource_type VARCHAR(50),
            resource_id VARCHAR(100),
            old_value TEXT,
            new_value TEXT,
            ip_address VARCHAR(45),
            user_agent TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT TRUE,
            error_message TEXT,
            
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """,
        
        """
        -- Password history to prevent reuse
        CREATE TABLE IF NOT EXISTS password_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
        """
    ]
    
    return rbac_tables_sql

def add_agency_columns():
    """Add agency_id columns to existing tables"""
    
    agency_columns_sql = [
        "ALTER TABLE device_info ADD COLUMN agency_id INTEGER DEFAULT 1;",
        "ALTER TABLE device_location ADD COLUMN agency_id INTEGER DEFAULT 1;", 
        "ALTER TABLE upload ADD COLUMN agency_id INTEGER DEFAULT 1;",
        "ALTER TABLE recording_event ADD COLUMN agency_id INTEGER DEFAULT 1;",
        "ALTER TABLE device_command ADD COLUMN agency_id INTEGER DEFAULT 1;"
    ]
    
    return agency_columns_sql

def create_indexes():
    """Create indexes for performance"""
    
    indexes_sql = [
        "CREATE INDEX IF NOT EXISTS idx_users_agency ON users(agency_id);",
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);",
        "CREATE INDEX IF NOT EXISTS idx_device_assignments_user ON device_assignments(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_device_assignments_device ON device_assignments(device_id);",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);",
        "CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);",
        "CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);"
    ]
    
    return indexes_sql

def insert_initial_data():
    """Insert BUAS agency and prepare for initial admin"""
    
    initial_data_sql = [
        """
        INSERT OR IGNORE INTO agencies (id, name, full_name, logo_url, primary_color, secondary_color, created_at, is_active)
        VALUES (1, 'BUAS', 'Briech UAS', NULL, '#1a73e8', '#0d47a1', CURRENT_TIMESTAMP, TRUE);
        """
    ]
    
    return initial_data_sql

def execute_migration():
    """Execute the complete database migration"""
    
    print("🚀 Starting BUAS RBAC Database Migration")
    print("=" * 50)
    
    # Step 1: Backup existing database
    backup_path = backup_database()
    
    # Step 2: Initialize Flask app context
    app = create_app()
    
    with app.app_context():
        try:
            # Step 3: Create existing tables first (in case of fresh install)
            print("\n📋 Creating existing table structure...")
            db.create_all()
            print("✅ Existing tables created/verified")
            
            # Step 4: Get direct database connection for schema changes
            db_path = 'uploads.db'
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Step 5: Create RBAC tables
            print("\n🔐 Creating RBAC tables...")
            rbac_tables = create_rbac_tables()
            for i, sql in enumerate(rbac_tables, 1):
                try:
                    cursor.execute(sql)
                    table_name = sql.split('CREATE TABLE IF NOT EXISTS ')[1].split(' ')[0]
                    print(f"✅ {i}. Created table: {table_name}")
                except Exception as e:
                    print(f"❌ Error creating table {i}: {e}")
                    raise
            
            # Step 6: Add agency_id columns to existing tables
            print("\n🏢 Adding agency_id columns to existing tables...")
            agency_columns = add_agency_columns()
            for i, sql in enumerate(agency_columns, 1):
                try:
                    cursor.execute(sql)
                    table_name = sql.split('ALTER TABLE ')[1].split(' ')[0]
                    print(f"✅ {i}. Added agency_id to: {table_name}")
                except Exception as e:
                    # Column might already exist, check if it's that error
                    if "duplicate column name" in str(e).lower():
                        table_name = sql.split('ALTER TABLE ')[1].split(' ')[0]
                        print(f"⚠️  {i}. Column already exists in: {table_name}")
                    else:
                        print(f"❌ Error adding column {i}: {e}")
                        raise
            
            # Step 7: Create indexes
            print("\n📊 Creating performance indexes...")
            indexes = create_indexes()
            for i, sql in enumerate(indexes, 1):
                try:
                    cursor.execute(sql)
                    index_name = sql.split('CREATE INDEX IF NOT EXISTS ')[1].split(' ')[0]
                    print(f"✅ {i}. Created index: {index_name}")
                except Exception as e:
                    print(f"❌ Error creating index {i}: {e}")
                    raise
            
            # Step 8: Insert initial data
            print("\n🏢 Inserting initial agency data...")
            initial_data = insert_initial_data()
            for i, sql in enumerate(initial_data, 1):
                try:
                    cursor.execute(sql)
                    print(f"✅ {i}. Inserted BUAS agency record")
                except Exception as e:
                    print(f"❌ Error inserting initial data {i}: {e}")
                    raise
            
            # Step 9: Commit all changes
            conn.commit()
            conn.close()
            
            print("\n🎉 RBAC Database Migration Complete!")
            print("=" * 50)
            print("📋 Summary:")
            print("✅ Created 6 new RBAC tables:")
            print("   - agencies")
            print("   - users")
            print("   - device_assignments")
            print("   - user_sessions")
            print("   - audit_logs")
            print("   - password_history")
            print("✅ Added agency_id columns to existing tables")
            print("✅ Created performance indexes")
            print("✅ Inserted BUAS agency record")
            print(f"✅ Database backup: {backup_path}" if backup_path else "✅ Fresh installation completed")
            
            print("\n🔄 Next Steps:")
            print("1. Run: python create_initial_admin.py")
            print("2. Test database structure")
            print("3. Proceed to Segment 2: Authentication System")
            
            return True
            
        except Exception as e:
            print(f"\n❌ Migration failed: {e}")
            if backup_path:
                print(f"💾 Restore from backup: {backup_path}")
            raise

if __name__ == "__main__":
    try:
        execute_migration()
    except Exception as e:
        print(f"\n💥 Critical error: {e}")
        print("Migration aborted. Check error details above.")
        exit(1)
