# BUAS RBAC Setup Instructions - Complete Installation Guide

## 📋 Table of Contents
- [System Requirements](#system-requirements)
- [Installation Process](#installation-process)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [RBAC Initialization](#rbac-initialization)
- [Frontend Configuration](#frontend-configuration)
- [Production Deployment](#production-deployment)
- [Security Configuration](#security-configuration)
- [Verification & Testing](#verification--testing)
- [Maintenance](#maintenance)

---

## 🔧 System Requirements

### Hardware Requirements
- **CPU**: 2+ cores (4+ cores recommended for production)
- **RAM**: 4GB minimum (8GB+ recommended for production)
- **Storage**: 20GB minimum (100GB+ recommended with growth planning)
- **Network**: Stable internet connection for device communication

### Software Requirements
- **Operating System**: 
  - Windows 10/11
  - Linux (Ubuntu 20.04+ recommended)
  - macOS 10.15+
- **Python**: 3.8 or higher (3.9+ recommended)
- **Node.js**: 16.x or higher (18.x+ recommended)
- **npm**: 8.x or higher
- **Database**: SQLite (included) or PostgreSQL for production

### Network Requirements
- **Ports**: 
  - 5000 (Backend API)
  - 3000 (Frontend development)
  - 443 (HTTPS production)
- **Firewall**: Allow inbound connections on required ports
- **SSL Certificate**: Required for production deployment

---

## 🚀 Installation Process

### Step 1: System Preparation

#### Windows Setup
```powershell
# Check Python version
python --version

# Check Node.js version
node --version

# Install Git if not present
# Download from https://git-scm.com/download/win
```

#### Linux Setup
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python 3.9+
sudo apt install python3.9 python3.9-pip python3.9-venv

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
sudo apt install git
```

#### macOS Setup
```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python
brew install python@3.9

# Install Node.js
brew install node

# Install Git
brew install git
```

### Step 2: Project Download

```bash
# Clone or download the BUAS project
# If downloading from repository:
git clone <repository-url> BUAS
cd BUAS

# If using existing directory:
cd path/to/BUAS
```

### Step 3: Python Environment Setup

#### Windows
```powershell
# Create virtual environment
python -m venv buas_env

# Activate virtual environment
.\buas_env\Scripts\Activate

# Upgrade pip
python -m pip install --upgrade pip

# Install Python dependencies
pip install -r requirements.txt
```

#### Linux/macOS
```bash
# Create virtual environment
python3 -m venv buas_env

# Activate virtual environment
source buas_env/bin/activate

# Upgrade pip
python -m pip install --upgrade pip

# Install Python dependencies
pip install -r requirements.txt
```

### Step 4: Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Build frontend for production
npm run build

# Return to project root
cd ..
```

---

## ⚙️ Environment Configuration

### Step 1: Create Environment File

Create `.env` file in project root:

```bash
# Copy template
cp .env.example .env  # Linux/macOS
copy .env.example .env  # Windows
```

### Step 2: Configure Environment Variables

Edit `.env` file:

```bash
# Application Configuration
FLASK_APP=server.py
FLASK_ENV=production
SECRET_KEY=your-super-secret-key-here-change-this-in-production

# Database Configuration
DATABASE_URL=sqlite:///instance/uploads.db
# For PostgreSQL: DATABASE_URL=postgresql://username:password@localhost/buas_db

# Security Configuration
SESSION_COOKIE_SECURE=True
SESSION_COOKIE_HTTPONLY=True
SESSION_COOKIE_SAMESITE=Lax
PERMANENT_SESSION_LIFETIME=3600

# Password Policy
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=True
PASSWORD_REQUIRE_LOWERCASE=True
PASSWORD_REQUIRE_NUMBERS=True
PASSWORD_REQUIRE_SPECIAL=True
PASSWORD_HISTORY_COUNT=5
PASSWORD_MAX_AGE_DAYS=90

# Audit Logging
AUDIT_LOG_RETENTION_DAYS=2555  # 7 years
AUDIT_LOG_LEVEL=INFO

# File Upload Configuration
UPLOAD_FOLDER=uploads
MAX_CONTENT_LENGTH=104857600  # 100MB

# Rate Limiting
RATELIMIT_STORAGE_URL=memory://
RATELIMIT_ENABLED=True
RATELIMIT_DEFAULT=100 per hour

# Email Configuration (optional)
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME=your-email@example.com
MAIL_PASSWORD=your-app-password

# Backup Configuration
BACKUP_ENABLED=True
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
BACKUP_LOCATION=backups/

# Monitoring
MONITORING_ENABLED=True
LOG_LEVEL=INFO
```

### Step 3: Generate Secure Secret Key

#### Using Python
```python
# Generate secure secret key
python -c "import secrets; print(secrets.token_hex(32))"
```

#### Using OpenSSL
```bash
# Generate secure secret key
openssl rand -hex 32
```

Update `SECRET_KEY` in `.env` with generated value.

---

## 🗄️ Database Setup

### Step 1: Initialize Database Structure

```bash
# Activate Python environment
source buas_env/bin/activate  # Linux/macOS
.\buas_env\Scripts\Activate   # Windows

# Initialize database tables
python init_db.py

# Create RBAC tables and permissions
python create_rbac_tables.py

# Verify database structure
python check_database_structure.py
```

### Step 2: Create Initial Administrator

```bash
# Create super super admin account
python create_initial_admin.py

# Follow prompts to set:
# - Username (e.g., 'admin')
# - Initial password (will be prompted to change on first login)
# - Agency name (e.g., 'Primary Agency')
```

### Step 3: Database Migration (if upgrading)

```bash
# Run migrations if upgrading from older version
python migrate_datetime_split.py
python migrate_device_command.py
python migrate_device_info.py
python migrate_recording_controls.py
```

### PostgreSQL Setup (Production)

#### Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql postgresql-server

# macOS
brew install postgresql
```

#### Configure PostgreSQL
```bash
# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
```

```sql
-- Create database
CREATE DATABASE buas_db;

-- Create user
CREATE USER buas_user WITH PASSWORD 'secure_password_here';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE buas_db TO buas_user;

-- Exit PostgreSQL
\q
```

Update `.env` with PostgreSQL connection:
```bash
DATABASE_URL=postgresql://buas_user:secure_password_here@localhost/buas_db
```

---

## 👥 RBAC Initialization

### Step 1: Verify RBAC Tables

```bash
# Check RBAC table structure
python -c "
from app.models import db, User, Role, Permission, UserRole, RolePermission
from app import create_app
app = create_app()
with app.app_context():
    print('Users table exists:', db.engine.has_table('users'))
    print('Roles table exists:', db.engine.has_table('roles'))
    print('Permissions table exists:', db.engine.has_table('permissions'))
    print('User roles table exists:', db.engine.has_table('user_roles'))
    print('Role permissions table exists:', db.engine.has_table('role_permissions'))
"
```

### Step 2: Verify Initial Admin

```bash
# Verify admin account creation
python -c "
from app.models import User
from app import create_app
app = create_app()
with app.app_context():
    admin = User.query.filter_by(role='super_super_admin').first()
    if admin:
        print(f'Super Super Admin created: {admin.username}')
        print(f'Agency ID: {admin.agency_id}')
    else:
        print('No Super Super Admin found. Run create_initial_admin.py')
"
```

### Step 3: Configure Default Settings

Create `config/rbac_settings.py`:

```python
# RBAC Configuration Settings
RBAC_SETTINGS = {
    'session_timeout': 3600,  # 1 hour
    'password_expiry_days': 90,
    'max_login_attempts': 5,
    'lockout_duration': 1800,  # 30 minutes
    'audit_retention_days': 2555,  # 7 years
    'device_assignment_limit': {
        'analyst': 50,  # Max devices per analyst
        'operator': None  # No limit for operators
    },
    'role_hierarchy': [
        'super_super_admin',
        'super_user', 
        'analyst',
        'operator'
    ]
}
```

---

## 🌐 Frontend Configuration

### Step 1: Configure Frontend Environment

Create `frontend/.env`:

```bash
# API Configuration
REACT_APP_API_BASE_URL=http://localhost:5000/api
REACT_APP_API_TIMEOUT=10000

# Security Configuration
REACT_APP_SESSION_TIMEOUT=3600000
REACT_APP_PASSWORD_MIN_LENGTH=12

# Feature Flags
REACT_APP_ENABLE_AUDIT_LOGS=true
REACT_APP_ENABLE_USER_MANAGEMENT=true
REACT_APP_ENABLE_DEVICE_ASSIGNMENT=true

# UI Configuration
REACT_APP_THEME=light
REACT_APP_LANGUAGE=en
REACT_APP_ITEMS_PER_PAGE=50

# Development
REACT_APP_DEBUG=false
```

### Step 2: Build and Configure Static Assets

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Copy build to Flask static directory
# Windows
xcopy /E /I build ..\static\frontend
# Linux/macOS
cp -r build/* ../static/frontend/

cd ..
```

### Step 3: Configure Web Server (Production)

#### Nginx Configuration

Create `/etc/nginx/sites-available/buas`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    
    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Frontend static files
    location / {
        root /path/to/BUAS/static/frontend;
        try_files $uri $uri/ /index.html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # Upload endpoint with larger body size
    location /api/upload {
        client_max_body_size 100M;
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/buas /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 Security Configuration

### Step 1: SSL/TLS Setup

#### Generate Self-Signed Certificate (Development)
```bash
# Create SSL directory
mkdir -p ssl

# Generate private key
openssl genrsa -out ssl/private.key 2048

# Generate certificate
openssl req -new -x509 -key ssl/private.key -out ssl/certificate.crt -days 365
```

#### Production SSL Certificate
- Use Let's Encrypt for free certificates
- Or purchase from trusted Certificate Authority
- Configure automatic renewal

### Step 2: Firewall Configuration

#### Ubuntu/Debian (UFW)
```bash
# Enable UFW
sudo ufw enable

# Allow SSH
sudo ufw allow ssh

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow backend port (if direct access needed)
sudo ufw allow from 127.0.0.1 to any port 5000

# Check status
sudo ufw status
```

#### CentOS/RHEL (firewalld)
```bash
# Enable firewalld
sudo systemctl enable firewalld
sudo systemctl start firewalld

# Allow services
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh

# Reload
sudo firewall-cmd --reload
```

### Step 3: Application Security

#### File Permissions
```bash
# Set secure permissions
chmod 755 server.py
chmod 644 .env
chmod 644 requirements.txt
chmod -R 755 app/
chmod -R 755 frontend/build/
chmod 700 instance/
chmod 600 instance/uploads.db
```

#### Backup Security
```bash
# Create backup directory with secure permissions
mkdir -p backups
chmod 700 backups

# Set up automated backup script
cat > backup_script.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
DB_BACKUP="$BACKUP_DIR/uploads_${DATE}.db"

# Create backup
cp instance/uploads.db "$DB_BACKUP"

# Compress backup
gzip "$DB_BACKUP"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "uploads_*.db.gz" -mtime +30 -delete

echo "Backup completed: ${DB_BACKUP}.gz"
EOF

chmod +x backup_script.sh
```

---

## 🔍 Verification & Testing

### Step 1: Backend Testing

```bash
# Activate environment
source buas_env/bin/activate  # Linux/macOS
.\buas_env\Scripts\Activate   # Windows

# Test database connectivity
python -c "
from app import create_app
from app.models import db
app = create_app()
with app.app_context():
    try:
        db.session.execute('SELECT 1')
        print('✅ Database connection successful')
    except Exception as e:
        print(f'❌ Database connection failed: {e}')
"

# Test RBAC system
python test_auth_system.py

# Test comprehensive functionality
python test_segment9_comprehensive_rbac.py
```

### Step 2: Frontend Testing

```bash
cd frontend

# Run frontend tests
npm test

# Build verification
npm run build

# Check build output
ls -la build/
```

### Step 3: End-to-End Testing

```bash
# Start backend
python server.py &

# Wait for startup
sleep 5

# Test authentication endpoint
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}' \
  -c cookies.txt

# Test protected endpoint
curl -X GET http://localhost:5000/api/dashboard-data \
  -b cookies.txt

# Stop backend
pkill -f "python server.py"
```

### Step 4: Production Checklist

- [ ] Database initialized and admin created
- [ ] All environment variables configured
- [ ] SSL certificate installed and configured
- [ ] Firewall rules configured
- [ ] Backup system configured
- [ ] Monitoring configured
- [ ] Log rotation configured
- [ ] Frontend built and deployed
- [ ] Web server configured
- [ ] DNS configured (if applicable)
- [ ] Health checks passing

---

## 🔧 Production Deployment

### Step 1: Process Management

#### Using systemd (Linux)

Create `/etc/systemd/system/buas.service`:

```ini
[Unit]
Description=BUAS RBAC Backend
After=network.target

[Service]
Type=simple
User=buas
Group=buas
WorkingDirectory=/path/to/BUAS
Environment="PATH=/path/to/BUAS/buas_env/bin"
ExecStart=/path/to/BUAS/buas_env/bin/python server.py
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/path/to/BUAS/instance /path/to/BUAS/uploads /path/to/BUAS/logs

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable buas
sudo systemctl start buas
sudo systemctl status buas
```

### Step 2: Monitoring Setup

#### Log Configuration

Create `logging.conf`:

```ini
[loggers]
keys=root,buas

[handlers]
keys=consoleHandler,fileHandler

[formatters]
keys=standardFormatter

[logger_root]
level=INFO
handlers=consoleHandler,fileHandler

[logger_buas]
level=INFO
handlers=fileHandler
qualname=buas
propagate=0

[handler_consoleHandler]
class=StreamHandler
level=INFO
formatter=standardFormatter
args=(sys.stdout,)

[handler_fileHandler]
class=logging.handlers.RotatingFileHandler
level=INFO
formatter=standardFormatter
args=('logs/buas.log', 'a', 10485760, 5)

[formatter_standardFormatter]
format=%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

#### Health Check Script

Create `health_check.py`:

```python
#!/usr/bin/env python3
import requests
import sys
import time

def health_check():
    try:
        # Check backend health
        response = requests.get('http://localhost:5000/api/auth/status', timeout=10)
        if response.status_code == 200:
            print("✅ Backend health check passed")
            return True
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backend health check failed: {e}")
        return False

if __name__ == "__main__":
    if health_check():
        sys.exit(0)
    else:
        sys.exit(1)
```

### Step 3: Backup Automation

#### Automated Backup Script

Create `automated_backup.py`:

```python
#!/usr/bin/env python3
import os
import shutil
import gzip
import datetime
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def backup_database():
    """Create compressed backup of database"""
    try:
        # Create backup directory
        backup_dir = Path('backups')
        backup_dir.mkdir(exist_ok=True)
        
        # Generate backup filename
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = backup_dir / f'uploads_{timestamp}.db'
        
        # Copy database
        shutil.copy2('instance/uploads.db', backup_file)
        
        # Compress backup
        with open(backup_file, 'rb') as f_in:
            with gzip.open(f'{backup_file}.gz', 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        # Remove uncompressed backup
        backup_file.unlink()
        
        logger.info(f'Backup created: {backup_file}.gz')
        
        # Cleanup old backups (keep 30 days)
        cutoff_date = datetime.datetime.now() - datetime.timedelta(days=30)
        for backup in backup_dir.glob('uploads_*.db.gz'):
            # Extract date from filename
            date_str = backup.stem.split('_')[1] + '_' + backup.stem.split('_')[2]
            try:
                backup_date = datetime.datetime.strptime(date_str, '%Y%m%d_%H%M%S')
                if backup_date < cutoff_date:
                    backup.unlink()
                    logger.info(f'Removed old backup: {backup}')
            except ValueError:
                continue
                
    except Exception as e:
        logger.error(f'Backup failed: {e}')
        raise

if __name__ == "__main__":
    backup_database()
```

#### Cron Configuration

```bash
# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /path/to/BUAS/buas_env/bin/python /path/to/BUAS/automated_backup.py

# Weekly health check log
0 3 * * 0 /path/to/BUAS/buas_env/bin/python /path/to/BUAS/health_check.py >> /path/to/BUAS/logs/health_check.log 2>&1
```

---

## 🛠️ Maintenance

### Daily Tasks
- [ ] Check system logs for errors
- [ ] Monitor disk space usage
- [ ] Verify backup completion
- [ ] Check service status

### Weekly Tasks
- [ ] Review audit logs for anomalies
- [ ] Check database size growth
- [ ] Test backup restoration
- [ ] Update security patches

### Monthly Tasks
- [ ] Review user accounts and permissions
- [ ] Analyze performance metrics
- [ ] Update documentation
- [ ] Test disaster recovery procedures

### Maintenance Commands

```bash
# Check service status
sudo systemctl status buas nginx

# View recent logs
sudo journalctl -u buas -n 100

# Check disk usage
df -h
du -sh /path/to/BUAS/*

# Database maintenance
python -c "
from app import create_app
from app.models import db
app = create_app()
with app.app_context():
    # Vacuum database (SQLite)
    db.session.execute('VACUUM')
    db.session.commit()
    print('Database optimized')
"

# Check backup integrity
python -c "
import gzip
import sqlite3
latest_backup = 'backups/uploads_latest.db.gz'
with gzip.open(latest_backup, 'rb') as f:
    with open('temp_restore_test.db', 'wb') as temp:
        temp.write(f.read())
        
conn = sqlite3.connect('temp_restore_test.db')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM users')
count = cursor.fetchone()[0]
conn.close()
os.remove('temp_restore_test.db')
print(f'Backup verification: {count} users found')
"
```

### Troubleshooting

#### Common Issues

1. **Service Won't Start**
   ```bash
   # Check logs
   sudo journalctl -u buas -f
   
   # Check environment
   source buas_env/bin/activate
   python -c "import app; print('App imports OK')"
   ```

2. **Database Connection Issues**
   ```bash
   # Check database file permissions
   ls -la instance/uploads.db
   
   # Test connection
   python -c "
   from app import create_app
   from app.models import db
   app = create_app()
   with app.app_context():
       db.session.execute('SELECT 1')
       print('Database OK')
   "
   ```

3. **Frontend Not Loading**
   ```bash
   # Check build exists
   ls -la static/frontend/
   
   # Check nginx logs
   sudo tail -f /var/log/nginx/error.log
   ```

4. **Permission Errors**
   ```bash
   # Reset file permissions
   sudo chown -R buas:buas /path/to/BUAS
   chmod -R 755 /path/to/BUAS
   chmod 600 /path/to/BUAS/.env
   chmod 600 /path/to/BUAS/instance/uploads.db
   ```

---

## 📞 Support

### Getting Help
- Check logs in `logs/` directory
- Review troubleshooting guide
- Check GitHub issues (if applicable)
- Contact system administrator

### Documentation
- [User Guide](USER_GUIDE_RBAC.md)
- [API Documentation](API_DOCUMENTATION_RBAC.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

---

**Document Version**: 1.0  
**Last Updated**: August 17, 2025  
**System Version**: BUAS RBAC v2.0+
