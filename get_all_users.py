#!/usr/bin/env python3
"""
Script to retrieve all registered users from the BUAS database
Supports both Flask app context (SQLAlchemy) and direct SQLite queries
"""

import os
import sys
import sqlite3
from datetime import datetime

def print_table(data, headers):
    """Print a simple table without external dependencies"""
    if not data:
        return
    
    # Calculate column widths
    col_widths = []
    for i, header in enumerate(headers):
        max_width = len(header)
        for row in data:
            if i < len(row):
                max_width = max(max_width, len(str(row[i])))
        col_widths.append(max_width + 2)  # Add padding
    
    # Print header
    header_row = "|"
    separator_row = "|"
    for i, header in enumerate(headers):
        header_row += f" {header:<{col_widths[i]-1}}|"
        separator_row += "-" * col_widths[i] + "|"
    
    print(header_row)
    print(separator_row)
    
    # Print data rows
    for row in data:
        data_row = "|"
        for i, cell in enumerate(row):
            data_row += f" {str(cell):<{col_widths[i]-1}}|"
        print(data_row)

def get_users_direct_sql():
    """Get users using direct SQLite queries (fallback method)"""
    print("🔍 Using direct SQLite queries...")
    
    # Try different possible database locations
    possible_db_paths = [
        'uploads.db',
        'instance/uploads.db',
        os.path.join(os.path.dirname(__file__), 'uploads.db'),
        os.path.join(os.path.dirname(__file__), 'instance', 'uploads.db')
    ]
    
    db_path = None
    for path in possible_db_paths:
        if os.path.exists(path):
            db_path = path
            break
    
    if not db_path:
        print("❌ Database not found in any expected location!")
        print("Searched paths:")
        for path in possible_db_paths:
            print(f"   - {path}")
        return None
    
    print(f"📁 Using database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if users table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            print("❌ Users table not found in database!")
            return None
        
        # Get all users with their details
        query = """
        SELECT 
            u.id,
            u.username,
            u.role,
            u.agency_id,
            u.is_active,
            u.must_change_password,
            u.failed_login_attempts,
            u.locked_until,
            u.last_login,
            u.created_at,
            u.created_by,
            u.deactivated_at,
            u.deactivated_by,
            a.name as agency_name
        FROM users u
        LEFT JOIN agencies a ON u.agency_id = a.id
        ORDER BY u.created_at DESC
        """
        
        cursor.execute(query)
        users = cursor.fetchall()
        
        if not users:
            print("📋 No users found in database")
            return []
        
        # Convert to list of dictionaries for easier handling
        user_data = []
        for user in users:
            user_dict = {
                'id': user[0],
                'username': user[1],
                'role': user[2],
                'agency_id': user[3],
                'is_active': bool(user[4]),
                'must_change_password': bool(user[5]),
                'failed_login_attempts': user[6],
                'locked_until': user[7],
                'last_login': user[8],
                'created_at': user[9],
                'created_by': user[10],
                'deactivated_at': user[11],
                'deactivated_by': user[12],
                'agency_name': user[13] or 'Unknown'
            }
            user_data.append(user_dict)
        
        conn.close()
        return user_data
        
    except Exception as e:
        print(f"❌ Error querying database: {e}")
        return None

def get_users_flask_context():
    """Get users using Flask app context and SQLAlchemy models"""
    print("🔍 Using Flask app context and SQLAlchemy...")
    
    try:
        # Import Flask app and models
        from app import create_app, db
        from app.models import User, Agency
        
        # Create app and get context
        app = create_app()
        
        with app.app_context():
            # Query all users with their agency information
            users = db.session.query(User, Agency).outerjoin(Agency, User.agency_id == Agency.id).all()
            
            if not users:
                print("📋 No users found in database")
                return []
            
            # Convert to list of dictionaries
            user_data = []
            for user, agency in users:
                user_dict = {
                    'id': user.id,
                    'username': user.username,
                    'role': user.role,
                    'agency_id': user.agency_id,
                    'is_active': user.is_active,
                    'must_change_password': user.must_change_password,
                    'failed_login_attempts': user.failed_login_attempts,
                    'locked_until': user.locked_until.isoformat() if user.locked_until else None,
                    'last_login': user.last_login.isoformat() if user.last_login else None,
                    'created_at': user.created_at.isoformat() if user.created_at else None,
                    'created_by': user.created_by,
                    'deactivated_at': user.deactivated_at.isoformat() if user.deactivated_at else None,
                    'deactivated_by': user.deactivated_by,
                    'agency_name': agency.name if agency else 'Unknown'
                }
                user_data.append(user_dict)
            
            return user_data
            
    except ImportError as e:
        print(f"⚠️ Flask app import failed: {e}")
        return None
    except Exception as e:
        print(f"❌ Error with Flask context: {e}")
        return None

def format_user_data(users):
    """Format user data for display"""
    if not users:
        return "No users found"
    
    # Create summary table
    summary_data = []
    for user in users:
        # Format dates
        created_at = user['created_at'][:19] if user['created_at'] else 'Unknown'
        last_login = user['last_login'][:19] if user['last_login'] else 'Never'
        
        # Status indicators
        status = []
        if not user['is_active']:
            status.append('INACTIVE')
        if user['must_change_password']:
            status.append('MUST_CHANGE_PWD')
        if user['failed_login_attempts'] > 0:
            status.append(f'FAILED_LOGINS({user["failed_login_attempts"]})')
        if user['locked_until']:
            status.append('LOCKED')
        
        status_str = ', '.join(status) if status else 'OK'
        
        summary_data.append([
            user['id'],
            user['username'],
            user['role'],
            user['agency_name'],
            'Yes' if user['is_active'] else 'No',
            created_at,
            last_login,
            status_str
        ])
    
    return summary_data

def display_users(users):
    """Display users in a formatted table"""
    if not users:
        print("📋 No users found in database")
        return
    
    print(f"\n👥 Found {len(users)} registered users:")
    print("=" * 120)
    
    # Summary table
    headers = ['ID', 'Username', 'Role', 'Agency', 'Active', 'Created', 'Last Login', 'Status']
    summary_data = format_user_data(users)
    
    print("\n📊 USER SUMMARY:")
    print_table(summary_data, headers)
    
    # Detailed information
    print(f"\n📋 DETAILED USER INFORMATION:")
    print("=" * 120)
    
    for i, user in enumerate(users, 1):
        print(f"\n{i}. User ID: {user['id']}")
        print(f"   Username: {user['username']}")
        print(f"   Role: {user['role']}")
        print(f"   Agency: {user['agency_name']} (ID: {user['agency_id']})")
        print(f"   Active: {'Yes' if user['is_active'] else 'No'}")
        print(f"   Must Change Password: {'Yes' if user['must_change_password'] else 'No'}")
        print(f"   Failed Login Attempts: {user['failed_login_attempts']}")
        
        if user['locked_until']:
            print(f"   Account Locked Until: {user['locked_until']}")
        
        if user['last_login']:
            print(f"   Last Login: {user['last_login']}")
        else:
            print(f"   Last Login: Never")
        
        if user['created_at']:
            print(f"   Created At: {user['created_at']}")
        
        if user['created_by']:
            print(f"   Created By User ID: {user['created_by']}")
        
        if user['deactivated_at']:
            print(f"   Deactivated At: {user['deactivated_at']}")
            if user['deactivated_by']:
                print(f"   Deactivated By User ID: {user['deactivated_by']}")
        
        print("-" * 80)

def get_user_statistics(users):
    """Generate user statistics"""
    if not users:
        return
    
    print(f"\n📈 USER STATISTICS:")
    print("=" * 50)
    
    # Count by role
    role_counts = {}
    active_count = 0
    locked_count = 0
    must_change_pwd_count = 0
    
    for user in users:
        role = user['role']
        role_counts[role] = role_counts.get(role, 0) + 1
        
        if user['is_active']:
            active_count += 1
        
        if user['locked_until']:
            locked_count += 1
        
        if user['must_change_password']:
            must_change_pwd_count += 1
    
    print(f"Total Users: {len(users)}")
    print(f"Active Users: {active_count}")
    print(f"Inactive Users: {len(users) - active_count}")
    print(f"Locked Users: {locked_count}")
    print(f"Users Must Change Password: {must_change_pwd_count}")
    
    print(f"\nUsers by Role:")
    for role, count in sorted(role_counts.items()):
        print(f"  {role}: {count}")

def main():
    """Main function to retrieve and display all users"""
    print("🔐 BUAS User Management - Get All Registered Users")
    print("=" * 60)
    
    # Try Flask context first, fallback to direct SQL
    users = get_users_flask_context()
    
    if users is None:
        print("\n⚠️ Flask context failed, trying direct SQLite queries...")
        users = get_users_direct_sql()
    
    if users is None:
        print("❌ Failed to retrieve users from database")
        sys.exit(1)
    
    # Display results
    display_users(users)
    get_user_statistics(users)
    
    print(f"\n✅ Successfully retrieved {len(users)} users from database")

if __name__ == "__main__":
    main()
