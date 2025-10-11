# BUAS RBAC Troubleshooting Guide - Complete Problem Resolution

## 📋 Table of Contents
- [Quick Diagnostics](#quick-diagnostics)
- [Authentication Issues](#authentication-issues)
- [Permission Problems](#permission-problems)
- [Database Issues](#database-issues)
- [Frontend Problems](#frontend-problems)
- [Device Assignment Issues](#device-assignment-issues)
- [Audit Logging Problems](#audit-logging-problems)
- [Performance Issues](#performance-issues)
- [Security Alerts](#security-alerts)
- [System Recovery](#system-recovery)

---

## 🔍 Quick Diagnostics

### System Health Check

Run this comprehensive diagnostic script:

```python
# save as: quick_diagnostics.py
import os
import sys
import sqlite3
import requests
from pathlib import Path

def check_system_health():
    """Comprehensive system health check"""
    print("🔍 BUAS RBAC System Health Check")
    print("=" * 50)
    
    # Check Python environment
    print(f"✓ Python version: {sys.version}")
    
    # Check virtual environment
    if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
        print("✓ Virtual environment: Active")
    else:
        print("⚠️  Virtual environment: Not detected")
    
    # Check required files
    required_files = [
        'server.py',
        'requirements.txt',
        '.env',
        'instance/uploads.db',
        'app/models.py',
        'app/routes.py'
    ]
    
    for file_path in required_files:
        if Path(file_path).exists():
            print(f"✓ File exists: {file_path}")
        else:
            print(f"❌ Missing file: {file_path}")
    
    # Check database
    try:
        conn = sqlite3.connect('instance/uploads.db')
        cursor = conn.cursor()
        
        # Check required tables
        tables = ['users', 'roles', 'permissions', 'user_roles', 'role_permissions', 'audit_logs']
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            if table in existing_tables:
                print(f"✓ Database table: {table}")
            else:
                print(f"❌ Missing table: {table}")
        
        # Check user count
        cursor.execute("SELECT COUNT(*) FROM users")
        user_count = cursor.fetchone()[0]
        print(f"✓ Users in database: {user_count}")
        
        # Check admin user
        cursor.execute("SELECT COUNT(*) FROM users WHERE role='super_super_admin'")
        admin_count = cursor.fetchone()[0]
        if admin_count > 0:
            print("✓ Super Super Admin exists")
        else:
            print("❌ No Super Super Admin found")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Database error: {e}")
    
    # Check backend service
    try:
        response = requests.get('http://localhost:5000/api/auth/status', timeout=5)
        if response.status_code == 200:
            print("✓ Backend service: Running")
        else:
            print(f"⚠️  Backend service: HTTP {response.status_code}")
    except requests.exceptions.ConnectionError:
        print("❌ Backend service: Not running")
    except Exception as e:
        print(f"❌ Backend service error: {e}")
    
    # Check frontend build
    frontend_build = Path('static/frontend/index.html')
    if frontend_build.exists():
        print("✓ Frontend: Built")
    else:
        print("❌ Frontend: Not built")
    
    print("\n🔧 For detailed troubleshooting, see specific sections below.")

if __name__ == "__main__":
    check_system_health()
```

Run diagnostics:
```bash
python quick_diagnostics.py
```

---

## 🔐 Authentication Issues

### Problem: Cannot Login - "Invalid Credentials"

#### Symptoms
- Valid credentials rejected
- Error message: "Invalid credentials"
- Users unable to access system

#### Diagnosis
```python
# Check user exists and password
python -c "
from app.models import User
from app import create_app
from werkzeug.security import check_password_hash

app = create_app()
with app.app_context():
    username = input('Username: ')
    password = input('Password: ')
    
    user = User.query.filter_by(username=username).first()
    if user:
        print(f'User found: {user.username}')
        print(f'Role: {user.role}')
        print(f'Active: {user.is_active}')
        print(f'Must change password: {user.must_change_password}')
        print(f'Password correct: {check_password_hash(user.password_hash, password)}')
    else:
        print('User not found')
"
```

#### Solutions

1. **Reset User Password**
   ```python
   # Reset password for user
   python -c "
   from app.models import User, db
   from app import create_app
   from werkzeug.security import generate_password_hash
   
   app = create_app()
   with app.app_context():
       username = input('Username to reset: ')
       new_password = input('New password: ')
       
       user = User.query.filter_by(username=username).first()
       if user:
           user.password_hash = generate_password_hash(new_password)
           user.must_change_password = True
           db.session.commit()
           print(f'Password reset for {username}')
       else:
           print('User not found')
   "
   ```

2. **Reactivate Locked Account**
   ```python
   # Reactivate user account
   python -c "
   from app.models import User, db
   from app import create_app
   
   app = create_app()
   with app.app_context():
       username = input('Username to reactivate: ')
       
       user = User.query.filter_by(username=username).first()
       if user:
           user.is_active = True
           user.failed_login_attempts = 0
           user.locked_until = None
           db.session.commit()
           print(f'Account reactivated for {username}')
       else:
           print('User not found')
   "
   ```

### Problem: Session Expires Too Quickly

#### Symptoms
- Users logged out after short time
- Frequent re-authentication required

#### Solutions
1. **Check Session Configuration**
   ```python
   # Check current session settings
   python -c "
   from app import create_app
   app = create_app()
   print(f'PERMANENT_SESSION_LIFETIME: {app.permanent_session_lifetime}')
   print(f'SECRET_KEY configured: {bool(app.secret_key)}')
   "
   ```

2. **Update Session Timeout**
   ```bash
   # Update .env file
   echo "PERMANENT_SESSION_LIFETIME=7200" >> .env  # 2 hours
   ```

### Problem: "Account Locked" Message

#### Symptoms
- Users see "Account locked" error
- Cannot login even with correct password

#### Diagnosis
```python
# Check locked accounts
python -c "
from app.models import User
from app import create_app
from datetime import datetime

app = create_app()
with app.app_context():
    locked_users = User.query.filter(
        (User.failed_login_attempts >= 5) | 
        (User.locked_until > datetime.utcnow())
    ).all()
    
    for user in locked_users:
        print(f'User: {user.username}')
        print(f'Failed attempts: {user.failed_login_attempts}')
        print(f'Locked until: {user.locked_until}')
        print('---')
"
```

#### Solutions
```python
# Unlock all accounts
python -c "
from app.models import User, db
from app import create_app

app = create_app()
with app.app_context():
    locked_users = User.query.filter(User.failed_login_attempts >= 5).all()
    
    for user in locked_users:
        user.failed_login_attempts = 0
        user.locked_until = None
        print(f'Unlocked: {user.username}')
    
    db.session.commit()
    print('All accounts unlocked')
"
```

---

## 🛡️ Permission Problems

### Problem: "Insufficient Permissions" Error

#### Symptoms
- Users see "You don't have permission" messages
- Features not accessible to users who should have access

#### Diagnosis
```python
# Check user permissions
python -c "
from app.models import User
from app.auth.permissions import get_user_permissions
from app import create_app

app = create_app()
with app.app_context():
    username = input('Username to check: ')
    
    user = User.query.filter_by(username=username).first()
    if user:
        permissions = get_user_permissions(user.role)
        print(f'User: {user.username}')
        print(f'Role: {user.role}')
        print('Permissions:')
        for perm in permissions:
            print(f'  - {perm}')
    else:
        print('User not found')
"
```

#### Solutions

1. **Fix Permission Matrix**
   ```python
   # Verify and fix permissions
   python -c "
   from app.auth.permissions import ROLE_PERMISSIONS
   
   # Check if permission exists
   permission = input('Permission to check: ')
   role = input('Role to check: ')
   
   if role in ROLE_PERMISSIONS:
       if permission in ROLE_PERMISSIONS[role]:
           print(f'✓ {role} has {permission}')
       else:
           print(f'❌ {role} missing {permission}')
           print(f'Available permissions for {role}:')
           for perm in ROLE_PERMISSIONS[role]:
               print(f'  - {perm}')
   else:
       print(f'Role {role} not found')
   "
   ```

2. **Update User Role**
   ```python
   # Change user role
   python -c "
   from app.models import User, db
   from app import create_app
   
   app = create_app()
   with app.app_context():
       username = input('Username: ')
       new_role = input('New role (super_super_admin/super_user/analyst/operator): ')
       
       valid_roles = ['super_super_admin', 'super_user', 'analyst', 'operator']
       if new_role not in valid_roles:
           print(f'Invalid role. Must be one of: {valid_roles}')
           exit()
       
       user = User.query.filter_by(username=username).first()
       if user:
           old_role = user.role
           user.role = new_role
           db.session.commit()
           print(f'Changed {username} from {old_role} to {new_role}')
       else:
           print('User not found')
   "
   ```

### Problem: Device Assignment Not Working

#### Symptoms
- Analysts cannot see assigned devices
- Device assignment fails silently

#### Diagnosis
```python
# Check device assignments
python -c "
from app.models import User, DeviceAssignment
from app import create_app

app = create_app()
with app.app_context():
    username = input('Username to check: ')
    
    user = User.query.filter_by(username=username).first()
    if user:
        assignments = DeviceAssignment.query.filter_by(
            user_id=user.id, 
            is_active=True
        ).all()
        
        print(f'User: {user.username} (ID: {user.id})')
        print(f'Active device assignments: {len(assignments)}')
        for assignment in assignments:
            print(f'  - Device: {assignment.device_id}')
            print(f'    Assigned: {assignment.assigned_at}')
            print(f'    By: {assignment.assigned_by}')
    else:
        print('User not found')
"
```

#### Solutions

1. **Manual Device Assignment**
   ```python
   # Assign device to user
   python -c "
   from app.models import User, DeviceAssignment, db
   from app import create_app
   from datetime import datetime
   
   app = create_app()
   with app.app_context():
       username = input('Username: ')
       device_id = input('Device ID: ')
       
       user = User.query.filter_by(username=username).first()
       if not user:
           print('User not found')
           exit()
       
       # Check if already assigned
       existing = DeviceAssignment.query.filter_by(
           user_id=user.id,
           device_id=device_id,
           is_active=True
       ).first()
       
       if existing:
           print('Device already assigned')
       else:
           assignment = DeviceAssignment(
               user_id=user.id,
               device_id=device_id,
               assigned_at=datetime.utcnow(),
               assigned_by=1,  # System assignment
               is_active=True
           )
           db.session.add(assignment)
           db.session.commit()
           print(f'Assigned {device_id} to {username}')
   "
   ```

---

## 🗄️ Database Issues

### Problem: Database File Not Found

#### Symptoms
- Error: "No such file or directory: instance/uploads.db"
- Application won't start

#### Solutions
```bash
# Create instance directory and initialize database
mkdir -p instance
python init_db.py
python create_rbac_tables.py
python create_initial_admin.py
```

### Problem: Database Corruption

#### Symptoms
- SQLite errors
- Data inconsistencies
- Application crashes

#### Diagnosis
```bash
# Check database integrity
sqlite3 instance/uploads.db "PRAGMA integrity_check;"
```

#### Solutions

1. **Restore from Backup**
   ```bash
   # List available backups
   ls -la backups/
   
   # Restore from backup
   cp backups/uploads_YYYYMMDD_HHMMSS.db.gz latest_backup.gz
   gunzip latest_backup.gz
   cp latest_backup instance/uploads.db
   ```

2. **Rebuild Database**
   ```bash
   # Backup current database
   cp instance/uploads.db instance/uploads.db.corrupt
   
   # Recreate database
   rm instance/uploads.db
   python init_db.py
   python create_rbac_tables.py
   python create_initial_admin.py
   ```

### Problem: Table Missing Errors

#### Symptoms
- SQL errors about missing tables
- "no such table" errors

#### Solutions
```python
# Check and create missing tables
python -c "
from app.models import db
from app import create_app

app = create_app()
with app.app_context():
    # Create all tables
    db.create_all()
    print('All tables created')
    
    # List tables
    result = db.session.execute('SELECT name FROM sqlite_master WHERE type=\"table\"')
    tables = [row[0] for row in result]
    print('Tables in database:')
    for table in tables:
        print(f'  - {table}')
"
```

---

## 🌐 Frontend Problems

### Problem: Blank Screen or Loading Forever

#### Symptoms
- Frontend shows blank page
- Stuck on loading screen
- Console errors

#### Diagnosis
```bash
# Check if frontend is built
ls -la static/frontend/

# Check for build errors
cd frontend
npm run build
```

#### Solutions

1. **Rebuild Frontend**
   ```bash
   cd frontend
   
   # Clear cache and reinstall
   rm -rf node_modules package-lock.json
   npm cache clean --force
   npm install
   
   # Build frontend
   npm run build
   
   # Copy to static directory
   cp -r build/* ../static/frontend/
   ```

2. **Check Browser Console**
   - Open browser developer tools (F12)
   - Check Console tab for JavaScript errors
   - Check Network tab for failed requests

### Problem: API Connection Errors

#### Symptoms
- "Network Error" messages
- API requests failing
- Authentication not working

#### Diagnosis
```javascript
// Test API connectivity from browser console
fetch('/api/auth/status')
  .then(response => response.json())
  .then(data => console.log('API Response:', data))
  .catch(error => console.error('API Error:', error));
```

#### Solutions

1. **Check Backend Service**
   ```bash
   # Check if backend is running
   curl http://localhost:5000/api/auth/status
   
   # Start backend if not running
   python server.py
   ```

2. **Check CORS Configuration**
   ```python
   # Verify CORS settings in server.py
   python -c "
   from app import create_app
   app = create_app()
   print('CORS configured:', hasattr(app, 'after_request'))
   "
   ```

### Problem: Styling Issues

#### Symptoms
- CSS not loading
- Layout broken
- Missing styles

#### Solutions
```bash
# Check static files
ls -la static/frontend/static/css/
ls -la static/frontend/static/js/

# Clear browser cache
# In browser: Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
```

---

## 📱 Device Assignment Issues

### Problem: Devices Not Showing for Analysts

#### Symptoms
- Analysts see "No devices assigned"
- Dashboard empty for analyst users

#### Diagnosis
```python
# Check device assignments for analyst
python -c "
from app.models import User, DeviceAssignment
from app import create_app

app = create_app()
with app.app_context():
    analysts = User.query.filter_by(role='analyst').all()
    
    for analyst in analysts:
        assignments = DeviceAssignment.query.filter_by(
            user_id=analyst.id,
            is_active=True
        ).all()
        
        print(f'Analyst: {analyst.username}')
        print(f'Assignments: {len(assignments)}')
        for assignment in assignments:
            print(f'  - {assignment.device_id}')
        print('---')
"
```

#### Solutions

1. **Assign Devices to Analysts**
   ```python
   # Quick device assignment
   python -c "
   from app.models import User, DeviceAssignment, db
   from app import create_app
   from datetime import datetime
   
   app = create_app()
   with app.app_context():
       # Find analysts without devices
       analysts = User.query.filter_by(role='analyst').all()
       
       for analyst in analysts:
           assignments = DeviceAssignment.query.filter_by(
               user_id=analyst.id,
               is_active=True
           ).count()
           
           if assignments == 0:
               # Assign sample device
               assignment = DeviceAssignment(
                   user_id=analyst.id,
                   device_id=f'device_{analyst.id}',
                   assigned_at=datetime.utcnow(),
                   assigned_by=1,
                   is_active=True
               )
               db.session.add(assignment)
               print(f'Assigned device_{analyst.id} to {analyst.username}')
       
       db.session.commit()
   "
   ```

### Problem: Device Assignment API Errors

#### Symptoms
- HTTP 500 errors when assigning devices
- Assignment requests fail

#### Diagnosis
```bash
# Check backend logs for errors
python -c "
import logging
logging.basicConfig(level=logging.DEBUG)

# Test assignment manually
from app.models import User, DeviceAssignment, db
from app import create_app

app = create_app()
with app.app_context():
    try:
        # Test assignment creation
        user = User.query.first()
        assignment = DeviceAssignment(
            user_id=user.id,
            device_id='test_device',
            assigned_at=datetime.utcnow(),
            assigned_by=user.id,
            is_active=True
        )
        db.session.add(assignment)
        db.session.commit()
        print('Assignment test successful')
    except Exception as e:
        print(f'Assignment test failed: {e}')
"
```

---

## 📊 Audit Logging Problems

### Problem: Audit Logs Not Recording

#### Symptoms
- Empty audit log page
- Missing log entries
- No activity tracking

#### Diagnosis
```python
# Check audit log function
python -c "
from app.models import AuditLog
from app import create_app

app = create_app()
with app.app_context():
    log_count = AuditLog.query.count()
    print(f'Total audit logs: {log_count}')
    
    # Check recent logs
    recent_logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(5).all()
    print('Recent logs:')
    for log in recent_logs:
        print(f'  {log.timestamp}: {log.action} by {log.username}')
"
```

#### Solutions

1. **Test Audit Logging**
   ```python
   # Test audit log creation
   python -c "
   from app.models import AuditLog, db
   from app import create_app
   from datetime import datetime
   
   app = create_app()
   with app.app_context():
       test_log = AuditLog(
           timestamp=datetime.utcnow(),
           user_id=1,
           username='test_user',
           action='TEST_ACTION',
           resource_type='test',
           resource_id='test_resource',
           success=True
       )
       db.session.add(test_log)
       db.session.commit()
       print('Test audit log created')
   "
   ```

2. **Check Log Function Calls**
   ```python
   # Verify log_user_activity function
   python -c "
   from app.models import log_user_activity
   from app import create_app
   
   app = create_app()
   with app.app_context():
       try:
           log_user_activity(
               user_id=1,
               action='TEST_LOGIN',
               resource_type='authentication',
               success=True
           )
           print('Audit function working')
       except Exception as e:
           print(f'Audit function error: {e}')
   "
   ```

### Problem: Audit Log Page Loading Slowly

#### Symptoms
- Audit log page takes long to load
- Timeout errors
- Browser becomes unresponsive

#### Solutions

1. **Add Database Indexes**
   ```python
   # Add indexes for performance
   python -c "
   from app.models import db
   from app import create_app
   
   app = create_app()
   with app.app_context():
       # Add indexes
       db.session.execute('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp)')
       db.session.execute('CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id)')
       db.session.execute('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action)')
       db.session.commit()
       print('Indexes added for performance')
   "
   ```

2. **Clean Old Logs**
   ```python
   # Clean logs older than retention period
   python -c "
   from app.models import AuditLog, db
   from app import create_app
   from datetime import datetime, timedelta
   
   app = create_app()
   with app.app_context():
       # Delete logs older than 7 years (default retention)
       cutoff_date = datetime.utcnow() - timedelta(days=2555)
       
       old_logs = AuditLog.query.filter(AuditLog.timestamp < cutoff_date)
       count = old_logs.count()
       old_logs.delete()
       db.session.commit()
       
       print(f'Deleted {count} old audit logs')
   "
   ```

---

## ⚡ Performance Issues

### Problem: Slow Application Response

#### Symptoms
- Pages load slowly
- API requests timeout
- Database queries take long time

#### Diagnosis
```python
# Check database performance
python -c "
import time
from app.models import User, db
from app import create_app

app = create_app()
with app.app_context():
    # Time user query
    start = time.time()
    users = User.query.all()
    end = time.time()
    print(f'User query took {end - start:.2f} seconds for {len(users)} users')
    
    # Check database size
    result = db.session.execute('SELECT COUNT(*) FROM audit_logs')
    log_count = result.fetchone()[0]
    print(f'Audit logs in database: {log_count}')
"
```

#### Solutions

1. **Database Optimization**
   ```bash
   # Vacuum database
   sqlite3 instance/uploads.db "VACUUM;"
   
   # Analyze database
   sqlite3 instance/uploads.db "ANALYZE;"
   ```

2. **Add Pagination**
   ```python
   # Check if pagination is working
   python -c "
   from app.models import AuditLog
   from app import create_app
   
   app = create_app()
   with app.app_context():
       # Test pagination
       page1 = AuditLog.query.paginate(page=1, per_page=50, error_out=False)
       print(f'Page 1: {len(page1.items)} items')
       print(f'Total pages: {page1.pages}')
       print(f'Total items: {page1.total}')
   "
   ```

### Problem: High Memory Usage

#### Symptoms
- Application using excessive RAM
- System becomes slow
- Out of memory errors

#### Solutions

1. **Check Memory Usage**
   ```bash
   # Monitor process memory
   ps aux | grep python
   
   # Check system memory
   free -h  # Linux
   # or
   Get-Process python | Select-Object WorkingSet  # Windows PowerShell
   ```

2. **Optimize Database Queries**
   ```python
   # Use pagination for large datasets
   # Add limits to queries
   # Close database connections properly
   ```

---

## 🚨 Security Alerts

### Problem: Suspicious Login Attempts

#### Symptoms
- Multiple failed login attempts
- Login attempts from unusual locations
- Account lockouts

#### Diagnosis
```python
# Check failed login attempts
python -c "
from app.models import AuditLog
from app import create_app
from datetime import datetime, timedelta

app = create_app()
with app.app_context():
    # Failed logins in last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    
    failed_logins = AuditLog.query.filter(
        AuditLog.action == 'LOGIN_FAILED',
        AuditLog.timestamp > yesterday
    ).all()
    
    print(f'Failed logins in last 24h: {len(failed_logins)}')
    
    # Group by IP address
    ip_counts = {}
    for log in failed_logins:
        ip = log.ip_address or 'Unknown'
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
    
    print('Failed attempts by IP:')
    for ip, count in sorted(ip_counts.items(), key=lambda x: x[1], reverse=True):
        print(f'  {ip}: {count} attempts')
"
```

#### Solutions

1. **Block Suspicious IPs**
   ```bash
   # Block IP address using firewall
   sudo ufw deny from <suspicious_ip>  # Linux
   
   # Or use fail2ban for automated blocking
   sudo apt install fail2ban
   ```

2. **Reset Affected Accounts**
   ```python
   # Reset passwords for compromised accounts
   python -c "
   from app.models import User, db
   from app import create_app
   from werkzeug.security import generate_password_hash
   
   app = create_app()
   with app.app_context():
       # List accounts with many failed attempts
       suspicious_users = User.query.filter(User.failed_login_attempts >= 3).all()
       
       for user in suspicious_users:
           print(f'User {user.username}: {user.failed_login_attempts} failed attempts')
           # Optionally reset password
           # user.password_hash = generate_password_hash('TempPassword123!')
           # user.must_change_password = True
       
       # db.session.commit()
   "
   ```

### Problem: Unauthorized Access Attempts

#### Symptoms
- Permission denied logs
- Unauthorized API access attempts
- Unusual activity patterns

#### Diagnosis
```python
# Check unauthorized access attempts
python -c "
from app.models import AuditLog
from app import create_app
from datetime import datetime, timedelta

app = create_app()
with app.app_context():
    # Check unauthorized attempts
    yesterday = datetime.utcnow() - timedelta(days=1)
    
    unauthorized = AuditLog.query.filter(
        AuditLog.action.in_(['PERMISSION_DENIED', 'UNAUTHORIZED_ACCESS']),
        AuditLog.timestamp > yesterday
    ).all()
    
    print(f'Unauthorized attempts: {len(unauthorized)}')
    
    for log in unauthorized:
        print(f'{log.timestamp}: {log.action} - User: {log.username} - Resource: {log.resource_type}')
"
```

---

## 🔧 System Recovery

### Complete System Reset

If all else fails, here's how to completely reset the system:

#### 1. Backup Current Data
```bash
# Backup database
cp instance/uploads.db backups/emergency_backup_$(date +%Y%m%d_%H%M%S).db

# Backup uploads
tar -czf backups/uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz uploads/
```

#### 2. Reset Database
```bash
# Remove current database
rm instance/uploads.db

# Recreate database structure
python init_db.py
python create_rbac_tables.py
python create_initial_admin.py
```

#### 3. Reset Frontend
```bash
cd frontend

# Clean build
rm -rf build/ node_modules/
npm cache clean --force
npm install
npm run build

# Copy to static
cp -r build/* ../static/frontend/
cd ..
```

#### 4. Reset Configuration
```bash
# Reset environment file
cp .env.example .env

# Generate new secret key
python -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))" >> .env
```

### Emergency Admin Access

If locked out of admin account:

```python
# Create emergency admin
python -c "
from app.models import User, db
from app import create_app
from werkzeug.security import generate_password_hash
from datetime import datetime

app = create_app()
with app.app_context():
    # Create emergency admin
    emergency_admin = User(
        username='emergency_admin',
        password_hash=generate_password_hash('EmergencyPass123!'),
        role='super_super_admin',
        agency_id=1,
        is_active=True,
        created_at=datetime.utcnow(),
        must_change_password=True
    )
    
    db.session.add(emergency_admin)
    db.session.commit()
    
    print('Emergency admin created:')
    print('Username: emergency_admin')
    print('Password: EmergencyPass123!')
    print('CHANGE PASSWORD IMMEDIATELY!')
"
```

---

## 📞 Getting Help

### Collecting Debug Information

Before requesting help, collect this information:

```bash
# System information
python --version
node --version
uname -a  # Linux/macOS
systeminfo  # Windows

# Application status
python quick_diagnostics.py

# Recent logs
tail -n 100 logs/buas.log

# Database status
python -c "
from app.models import User, AuditLog
from app import create_app

app = create_app()
with app.app_context():
    print(f'Users: {User.query.count()}')
    print(f'Audit logs: {AuditLog.query.count()}')
"
```

### Log Files Locations
- Application logs: `logs/buas.log`
- System logs: `/var/log/syslog` (Linux) or Event Viewer (Windows)
- Web server logs: `/var/log/nginx/` (if using Nginx)

### Common Solutions Summary

| Problem | Quick Fix |
|---------|-----------|
| Cannot login | Reset password with script above |
| Database errors | Run `python init_db.py; python create_rbac_tables.py` |
| Frontend blank | `cd frontend; npm run build; cp -r build/* ../static/frontend/` |
| Permissions error | Check user role and permission matrix |
| Slow performance | Run `sqlite3 instance/uploads.db "VACUUM;"` |
| Account locked | Reset failed attempts with script above |

---

**Document Version**: 1.0  
**Last Updated**: August 17, 2025  
**Support Level**: Community-Supported
