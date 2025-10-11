#!/usr/bin/env python3
"""
Create Initial Super Super Admin User
Bootstrap script to create the first admin user for BUAS RBAC system
Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 1
"""

from app import create_app
from werkzeug.security import generate_password_hash
import sqlite3
import secrets
import string
from datetime import datetime, timedelta

def generate_secure_password(length=16):
    """Generate a secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure password meets requirements
        if (any(c.islower() for c in password) and
            any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and
            any(c in "!@#$%^&*" for c in password)):
            return password

def create_initial_admin():
    """Create the initial Super Super Admin user"""
    
    print("🔐 Creating Initial Super Super Admin User")
    print("=" * 50)
    
    # Initialize Flask app context
    app = create_app()
    
    with app.app_context():
        try:
            # Connect to database
            db_path = 'uploads.db'
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Check if any users already exist
            cursor.execute("SELECT COUNT(*) FROM users")
            user_count = cursor.fetchone()[0]
            
            if user_count > 0:
                print("⚠️  Users already exist in the database!")
                cursor.execute("SELECT username, role FROM users")
                existing_users = cursor.fetchall()
                print("📋 Existing users:")
                for username, role in existing_users:
                    print(f"   - {username} ({role})")
                
                response = input("\n❓ Do you want to create another admin user? (y/N): ")
                if response.lower() not in ['y', 'yes']:
                    print("👋 Exiting without creating user")
                    return False
            
            # Get username from user
            while True:
                username = input("\n👤 Enter username for Super Super Admin: ").strip()
                if username:
                    # Check if username already exists
                    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                    if cursor.fetchone():
                        print(f"❌ Username '{username}' already exists!")
                        continue
                    break
                print("❌ Username cannot be empty!")
            
            # Ask if user wants to set custom password or use generated one
            print("\n🔒 Password Options:")
            print("1. Generate secure password (recommended)")
            print("2. Set custom password")
            
            while True:
                choice = input("Choose option (1 or 2): ").strip()
                if choice in ['1', '2']:
                    break
                print("❌ Please enter 1 or 2")
            
            if choice == '1':
                # Generate secure password
                password = generate_secure_password()
                print(f"\n🔑 Generated password: {password}")
                print("⚠️  IMPORTANT: Save this password securely!")
                must_change = True
            else:
                # Custom password
                while True:
                    password = input("\n🔑 Enter password (min 12 chars, mixed case, numbers, symbols): ")
                    if len(password) >= 12:
                        if (any(c.islower() for c in password) and
                            any(c.isupper() for c in password) and
                            any(c.isdigit() for c in password) and
                            any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)):
                            break
                        else:
                            print("❌ Password must contain uppercase, lowercase, numbers, and symbols")
                    else:
                        print("❌ Password must be at least 12 characters")
                
                # Ask if user wants to change password on first login
                change_response = input("\n❓ Require password change on first login? (Y/n): ").strip()
                must_change = change_response.lower() not in ['n', 'no']
            
            # Hash the password
            password_hash = generate_password_hash(password)
            
            # Calculate password expiry (90 days from now)
            password_expires_at = datetime.utcnow() + timedelta(days=90)
            
            # Insert the admin user
            insert_sql = """
                INSERT INTO users (
                    username, password_hash, role, agency_id,
                    must_change_password, password_changed_at, password_expires_at,
                    failed_login_attempts, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            cursor.execute(insert_sql, (
                username,
                password_hash,
                'super_super_admin',
                1,  # BUAS agency
                must_change,
                datetime.utcnow(),
                password_expires_at,
                0,  # failed_login_attempts
                True,  # is_active
                datetime.utcnow()
            ))
            
            user_id = cursor.lastrowid
            
            # Add password to history
            cursor.execute(
                "INSERT INTO password_history (user_id, password_hash, created_at) VALUES (?, ?, ?)",
                (user_id, password_hash, datetime.utcnow())
            )
            
            # Create initial audit log entry
            cursor.execute("""
                INSERT INTO audit_logs (
                    user_id, username, action, resource_type, resource_id,
                    new_value, success, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                username,
                'USER_CREATED',
                'user',
                str(user_id),
                f'username={username}, role=super_super_admin',
                True,
                datetime.utcnow()
            ))
            
            # Commit changes
            conn.commit()
            conn.close()
            
            print("\n🎉 Super Super Admin Created Successfully!")
            print("=" * 50)
            print(f"👤 Username: {username}")
            print(f"🔐 Role: super_super_admin")
            print(f"🏢 Agency: BUAS")
            print(f"🔄 Must change password: {'Yes' if must_change else 'No'}")
            print(f"⏰ Password expires: {password_expires_at.strftime('%Y-%m-%d')}")
            
            if choice == '1':
                print(f"\n🔑 Password: {password}")
                print("\n⚠️  SECURITY REMINDER:")
                print("1. Save this password in a secure location")
                print("2. Communicate it securely to the administrator")
                print("3. Delete this terminal output after saving")
            
            print("\n🔄 Next Steps:")
            print("1. Test login with these credentials")
            print("2. Proceed to Segment 2: Authentication System")
            print("3. Begin Flask-Login integration")
            
            return True
            
        except Exception as e:
            print(f"\n❌ Failed to create admin user: {e}")
            raise

def verify_database_structure():
    """Verify that all required tables exist"""
    
    print("\n🔍 Verifying Database Structure...")
    
    required_tables = [
        'agencies', 'users', 'device_assignments', 
        'user_sessions', 'audit_logs', 'password_history'
    ]
    
    try:
        conn = sqlite3.connect('uploads.db')
        cursor = conn.cursor()
        
        # Get list of existing tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        print("📋 Checking required RBAC tables:")
        all_good = True
        for table in required_tables:
            if table in existing_tables:
                print(f"✅ {table}")
            else:
                print(f"❌ {table} - MISSING!")
                all_good = False
        
        if not all_good:
            print("\n💥 Database structure incomplete!")
            print("🔄 Please run: python create_rbac_tables.py")
            return False
        
        # Check if BUAS agency exists
        cursor.execute("SELECT COUNT(*) FROM agencies WHERE name = 'BUAS'")
        buas_count = cursor.fetchone()[0]
        
        if buas_count == 0:
            print("❌ BUAS agency record missing!")
            print("🔄 Please run: python create_rbac_tables.py")
            return False
        else:
            print("✅ BUAS agency record exists")
        
        conn.close()
        print("✅ Database structure verified!")
        return True
        
    except Exception as e:
        print(f"❌ Database verification failed: {e}")
        return False

if __name__ == "__main__":
    try:
        # First verify database structure
        if not verify_database_structure():
            exit(1)
        
        # Create initial admin user
        create_initial_admin()
        
    except Exception as e:
        print(f"\n💥 Critical error: {e}")
        print("Failed to create initial admin user.")
        exit(1)
