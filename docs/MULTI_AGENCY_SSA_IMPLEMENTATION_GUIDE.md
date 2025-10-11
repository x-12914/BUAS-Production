# Multi-Agency Super Super Admin Implementation Guide

## 📋 Overview

This guide outlines how to implement the multi-agency architecture with Super Super Admin (SSA) capabilities for BUAS. The SSA will be able to manage and monitor multiple agency instances while maintaining complete data isolation between agencies.

## 🎯 Architecture Goals

- **Complete Agency Isolation**: Each agency has its own server and database
- **Hidden SSA Access**: Agencies are unaware of SSA existence
- **Centralized Management**: SSA can view/manage all agencies from one portal
- **Scalable Deployment**: Easy setup for new agencies
- **Secure Communication**: Encrypted connections between instances

## 🏗️ Current State vs Target State

### Current State ✅
- ✅ Complete RBAC system with 4 user roles
- ✅ Super Super Admin role implemented
- ✅ User management and permissions
- ✅ Audit logging system
- ✅ Single agency (BUAS) fully functional

### Target State 🎯
- 🎯 Central SSA Hub managing multiple agencies
- 🎯 Automated agency instance deployment
- 🎯 Cross-agency monitoring and analytics
- 🎯 Secure inter-instance communication
- 🎯 Agency discovery and registration system

## 📐 Technical Architecture

```
Central SSA Hub (Briech UAS - Master)
│
├── Agency Registry Service
├── Instance Management API  
├── Cross-Agency Monitor
├── Deployment Automation
└── SSA Authentication Portal
│
├─── Agency A Instance (Independent)
│    ├── Own Database
│    ├── Own Server
│    ├── Own Users/Data
│    └── API Connector to Hub
│
├─── Agency B Instance (Independent)  
│    ├── Own Database
│    ├── Own Server
│    ├── Own Users/Data
│    └── API Connector to Hub
│
└─── Agency C Instance (Independent)
     ├── Own Database
     ├── Own Server  
     ├── Own Users/Data
     └── API Connector to Hub
```

## 🚀 Implementation Phases

## Phase 1: Central Hub Development (2-3 weeks)

### 1.1 Create Central Hub Infrastructure

**New Directory Structure:**
```
BUAS/
├── central_hub/
│   ├── __init__.py
│   ├── app.py                 # Central hub Flask app
│   ├── models.py              # Agency registry models
│   ├── routes.py              # SSA portal routes
│   ├── services/
│   │   ├── agency_registry.py # Agency discovery service
│   │   ├── instance_manager.py # Instance management
│   │   ├── connector.py       # Inter-instance communication
│   │   └── deployment.py      # Agency deployment automation
│   ├── templates/
│   │   ├── ssa_dashboard.html # SSA main dashboard
│   │   ├── agency_list.html   # List of all agencies
│   │   └── agency_switch.html # Agency context switching
│   └── static/
│       ├── css/
│       └── js/
```

### 1.2 Agency Registry Database

**Central Hub Database Schema:**
```sql
-- Central hub database (separate from agency databases)
CREATE TABLE agency_instances (
    id INTEGER PRIMARY KEY,
    agency_name VARCHAR(100) NOT NULL,
    agency_code VARCHAR(20) UNIQUE NOT NULL,
    server_url VARCHAR(255) NOT NULL,
    database_url VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_health_check DATETIME,
    version VARCHAR(20),
    branding_config TEXT  -- JSON config for agency branding
);

CREATE TABLE ssa_sessions (
    id VARCHAR(255) PRIMARY KEY,
    ssa_user_id INTEGER NOT NULL,
    current_agency_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_agency_id) REFERENCES agency_instances(id)
);

CREATE TABLE cross_agency_audit (
    id INTEGER PRIMARY KEY,
    ssa_user_id INTEGER NOT NULL,
    agency_id INTEGER NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    FOREIGN KEY (agency_id) REFERENCES agency_instances(id)
);
```

### 1.3 SSA Portal Backend

**File: `central_hub/models.py`**
```python
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()

class AgencyInstance(db.Model):
    """Registry of all agency instances"""
    __tablename__ = 'agency_instances'
    
    id = db.Column(db.Integer, primary_key=True)
    agency_name = db.Column(db.String(100), nullable=False)
    agency_code = db.Column(db.String(20), unique=True, nullable=False)
    server_url = db.Column(db.String(255), nullable=False)
    database_url = db.Column(db.String(255), nullable=False)
    api_key = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_health_check = db.Column(db.DateTime)
    version = db.Column(db.String(20))
    branding_config = db.Column(db.Text)  # JSON
    
    def get_branding(self):
        """Get branding configuration as dict"""
        if self.branding_config:
            return json.loads(self.branding_config)
        return {}
    
    def set_branding(self, config):
        """Set branding configuration from dict"""
        self.branding_config = json.dumps(config)
    
    def to_dict(self):
        return {
            'id': self.id,
            'agency_name': self.agency_name,
            'agency_code': self.agency_code,
            'server_url': self.server_url,
            'status': self.status,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'version': self.version,
            'branding': self.get_branding()
        }

class SSASession(db.Model):
    """Track SSA sessions across agencies"""
    __tablename__ = 'ssa_sessions'
    
    id = db.Column(db.String(255), primary_key=True)
    ssa_user_id = db.Column(db.Integer, nullable=False)
    current_agency_id = db.Column(db.Integer, db.ForeignKey('agency_instances.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    current_agency = db.relationship('AgencyInstance', backref='ssa_sessions')
```

### 1.4 Inter-Instance Communication Service

**File: `central_hub/services/connector.py`**
```python
import requests
import hashlib
import hmac
import time
from datetime import datetime

class AgencyConnector:
    """Secure communication with agency instances"""
    
    def __init__(self, agency_instance):
        self.agency = agency_instance
        self.base_url = agency_instance.server_url
        self.api_key = agency_instance.api_key
    
    def _generate_signature(self, method, endpoint, timestamp, data=None):
        """Generate HMAC signature for request authentication"""
        message = f"{method}:{endpoint}:{timestamp}"
        if data:
            message += f":{data}"
        return hmac.new(
            self.api_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
    
    def _make_request(self, method, endpoint, data=None):
        """Make authenticated request to agency instance"""
        timestamp = str(int(time.time()))
        signature = self._generate_signature(method, endpoint, timestamp, data)
        
        headers = {
            'X-SSA-Timestamp': timestamp,
            'X-SSA-Signature': signature,
            'X-SSA-Agency': self.agency.agency_code,
            'Content-Type': 'application/json'
        }
        
        url = f"{self.base_url}/api/ssa{endpoint}"
        
        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            
            return {
                'success': response.status_code < 400,
                'status_code': response.status_code,
                'data': response.json() if response.content else None
            }
        except requests.RequestException as e:
            return {
                'success': False,
                'error': str(e),
                'status_code': 0
            }
    
    def health_check(self):
        """Check if agency instance is healthy"""
        return self._make_request('GET', '/health')
    
    def get_dashboard_data(self):
        """Get agency dashboard data for SSA view"""
        return self._make_request('GET', '/dashboard')
    
    def get_users(self):
        """Get all users in the agency"""
        return self._make_request('GET', '/users')
    
    def get_devices(self):
        """Get all devices in the agency"""
        return self._make_request('GET', '/devices')
    
    def get_recordings(self, filters=None):
        """Get recordings with optional filters"""
        endpoint = '/recordings'
        if filters:
            endpoint += '?' + '&'.join([f"{k}={v}" for k, v in filters.items()])
        return self._make_request('GET', endpoint)
    
    def control_recording(self, device_id, action):
        """Control recording on agency device"""
        return self._make_request('POST', '/control-recording', {
            'device_id': device_id,
            'action': action
        })
```

## Phase 2: Agency Instance Automation (1-2 weeks)

### 2.1 Agency Deployment Scripts

**File: `deployment/deploy_agency.py`**
```python
#!/usr/bin/env python3
"""
Automated agency instance deployment script
Usage: python deploy_agency.py --agency-name "FBI" --agency-code "FBI" --domain "fbi.buas.internal"
"""

import argparse
import os
import shutil
import subprocess
import secrets
import json
from pathlib import Path

class AgencyDeployer:
    def __init__(self, agency_name, agency_code, domain, server_type='local'):
        self.agency_name = agency_name
        self.agency_code = agency_code.upper()
        self.domain = domain
        self.server_type = server_type
        self.base_path = Path(__file__).parent.parent
        self.deployment_path = Path(f"/opt/buas-{agency_code.lower()}")
        
    def deploy(self):
        """Main deployment process"""
        print(f"🚀 Deploying BUAS instance for {self.agency_name}")
        
        # Step 1: Create deployment directory
        self._create_deployment_directory()
        
        # Step 2: Copy codebase
        self._copy_codebase()
        
        # Step 3: Generate configuration
        self._generate_configuration()
        
        # Step 4: Setup database
        self._setup_database()
        
        # Step 5: Apply branding
        self._apply_branding()
        
        # Step 6: Install dependencies
        self._install_dependencies()
        
        # Step 7: Create initial admin
        self._create_initial_admin()
        
        # Step 8: Register with central hub
        self._register_with_hub()
        
        # Step 9: Start services
        self._start_services()
        
        print(f"✅ {self.agency_name} instance deployed successfully!")
        self._print_deployment_info()
    
    def _create_deployment_directory(self):
        """Create deployment directory structure"""
        print("📁 Creating deployment directory...")
        self.deployment_path.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (self.deployment_path / "uploads").mkdir(exist_ok=True)
        (self.deployment_path / "logs").mkdir(exist_ok=True)
        (self.deployment_path / "backups").mkdir(exist_ok=True)
    
    def _copy_codebase(self):
        """Copy BUAS codebase to deployment directory"""
        print("📋 Copying codebase...")
        
        # Copy main application files
        shutil.copytree(self.base_path / "app", self.deployment_path / "app")
        shutil.copytree(self.base_path / "frontend", self.deployment_path / "frontend")
        shutil.copytree(self.base_path / "static", self.deployment_path / "static")
        shutil.copytree(self.base_path / "templates", self.deployment_path / "templates")
        
        # Copy configuration files
        shutil.copy2(self.base_path / "requirements.txt", self.deployment_path)
        shutil.copy2(self.base_path / "server.py", self.deployment_path)
        
        # Copy deployment scripts
        for script in ["create_initial_admin.py", "create_rbac_tables.py", "init_db.py"]:
            shutil.copy2(self.base_path / script, self.deployment_path)
    
    def _generate_configuration(self):
        """Generate agency-specific configuration"""
        print("⚙️ Generating configuration...")
        
        # Generate secure keys
        secret_key = secrets.token_hex(32)
        api_key = secrets.token_hex(32)
        database_password = secrets.token_urlsafe(16)
        
        # Configuration file
        config = {
            "AGENCY_NAME": self.agency_name,
            "AGENCY_CODE": self.agency_code,
            "SECRET_KEY": secret_key,
            "API_KEY": api_key,
            "DATABASE_URL": f"sqlite:///instance/{self.agency_code.lower()}_uploads.db",
            "DOMAIN": self.domain,
            "PORT": 5000,  # Will be auto-assigned
            "DEBUG": False,
            "CENTRAL_HUB_URL": "https://hub.buas.internal",
            "BRANDING": {
                "primary_color": "#1a73e8",
                "secondary_color": "#0d47a1",
                "logo_url": f"/static/logos/{self.agency_code.lower()}_logo.png",
                "agency_name": self.agency_name,
                "agency_full_name": self.agency_name
            }
        }
        
        # Save configuration
        with open(self.deployment_path / "config.json", "w") as f:
            json.dump(config, f, indent=2)
        
        # Store sensitive keys securely
        self.api_key = api_key
        self.secret_key = secret_key
    
    def _setup_database(self):
        """Setup agency database"""
        print("🗄️ Setting up database...")
        
        # Create instance directory
        (self.deployment_path / "instance").mkdir(exist_ok=True)
        
        # Run database initialization scripts
        os.chdir(self.deployment_path)
        subprocess.run(["python", "init_db.py"], check=True)
        subprocess.run(["python", "create_rbac_tables.py"], check=True)
    
    def _apply_branding(self):
        """Apply agency-specific branding"""
        print("🎨 Applying branding...")
        
        # Create logo directory
        logo_dir = self.deployment_path / "static" / "logos"
        logo_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy default logo (can be replaced later)
        default_logo = self.base_path / "static" / "buas_logo.png"
        if default_logo.exists():
            shutil.copy2(default_logo, logo_dir / f"{self.agency_code.lower()}_logo.png")
        
        # Update HTML templates with agency name
        self._update_template_branding()
    
    def _update_template_branding(self):
        """Update HTML templates with agency branding"""
        template_files = [
            "templates/dashboard.html",
            "frontend/public/index.html",
            "frontend/src/components/Dashboard.js"
        ]
        
        for template_file in template_files:
            file_path = self.deployment_path / template_file
            if file_path.exists():
                content = file_path.read_text()
                content = content.replace("BUAS", self.agency_name)
                content = content.replace("Briech UAS", self.agency_name)
                file_path.write_text(content)
    
    def _install_dependencies(self):
        """Install Python and Node.js dependencies"""
        print("📦 Installing dependencies...")
        
        os.chdir(self.deployment_path)
        
        # Python dependencies
        subprocess.run(["pip", "install", "-r", "requirements.txt"], check=True)
        
        # Node.js dependencies (if frontend needs building)
        if (self.deployment_path / "frontend" / "package.json").exists():
            os.chdir(self.deployment_path / "frontend")
            subprocess.run(["npm", "install"], check=True)
            subprocess.run(["npm", "run", "build"], check=True)
    
    def _create_initial_admin(self):
        """Create initial Super User for the agency"""
        print("👤 Creating initial admin user...")
        
        os.chdir(self.deployment_path)
        
        # Run admin creation script
        admin_username = f"{self.agency_code.lower()}_admin"
        subprocess.run([
            "python", "create_initial_admin.py",
            "--username", admin_username,
            "--role", "super_user"
        ], check=True)
        
        self.admin_username = admin_username
    
    def _register_with_hub(self):
        """Register new agency instance with central hub"""
        print("🔗 Registering with central hub...")
        
        # This would make an API call to central hub
        # For now, print the registration data
        registration_data = {
            "agency_name": self.agency_name,
            "agency_code": self.agency_code,
            "server_url": f"https://{self.domain}",
            "api_key": self.api_key
        }
        
        print(f"Registration data: {registration_data}")
        # TODO: Make actual API call to central hub
    
    def _start_services(self):
        """Start agency instance services"""
        print("🚀 Starting services...")
        
        # Create systemd service file
        self._create_systemd_service()
        
        # Start the service
        subprocess.run(["sudo", "systemctl", "enable", f"buas-{self.agency_code.lower()}"], check=True)
        subprocess.run(["sudo", "systemctl", "start", f"buas-{self.agency_code.lower()}"], check=True)
    
    def _create_systemd_service(self):
        """Create systemd service file"""
        service_content = f"""[Unit]
Description=BUAS Instance for {self.agency_name}
After=network.target

[Service]
Type=simple
User=buas
WorkingDirectory={self.deployment_path}
Environment=FLASK_APP=server.py
Environment=FLASK_ENV=production
ExecStart=/usr/bin/python server.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""
        
        service_file = f"/etc/systemd/system/buas-{self.agency_code.lower()}.service"
        with open(service_file, "w") as f:
            f.write(service_content)
        
        subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
    
    def _print_deployment_info(self):
        """Print deployment summary"""
        print("\n" + "="*50)
        print(f"🎉 {self.agency_name} Deployment Complete!")
        print("="*50)
        print(f"Agency Name: {self.agency_name}")
        print(f"Agency Code: {self.agency_code}")
        print(f"Domain: {self.domain}")
        print(f"Deployment Path: {self.deployment_path}")
        print(f"Admin Username: {self.admin_username}")
        print(f"API Key: {self.api_key}")
        print("\n📋 Next Steps:")
        print("1. Access the instance at: https://" + self.domain)
        print("2. Login with the created admin credentials")
        print("3. Upload agency logo and customize branding")
        print("4. Create additional users as needed")
        print("5. Register agency with SSA central hub")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy BUAS agency instance")
    parser.add_argument("--agency-name", required=True, help="Agency full name")
    parser.add_argument("--agency-code", required=True, help="Agency code (e.g., FBI)")
    parser.add_argument("--domain", required=True, help="Agency domain")
    parser.add_argument("--server-type", default="local", help="Server type (local, aws, gcp)")
    
    args = parser.parse_args()
    
    deployer = AgencyDeployer(
        agency_name=args.agency_name,
        agency_code=args.agency_code,
        domain=args.domain,
        server_type=args.server_type
    )
    
    deployer.deploy()
```

## Phase 3: SSA Integration (1-2 weeks)

### 3.1 SSA Portal Frontend

**File: `central_hub/templates/ssa_dashboard.html`**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Super Super Admin Portal - BUAS Central Hub</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/ssa_dashboard.css') }}">
</head>
<body>
    <nav class="ssa-navbar">
        <div class="nav-brand">
            <img src="/static/images/buas_logo.png" alt="BUAS Logo">
            <span>BUAS Central Hub</span>
        </div>
        <div class="nav-user">
            <span>Super Super Admin: {{ current_user.username }}</span>
            <a href="/logout" class="logout-btn">Logout</a>
        </div>
    </nav>

    <div class="ssa-container">
        <!-- Sidebar -->
        <aside class="ssa-sidebar">
            <ul class="ssa-menu">
                <li class="active">
                    <a href="#dashboard" onclick="showSection('dashboard')">
                        <i class="icon-dashboard"></i> Dashboard
                    </a>
                </li>
                <li>
                    <a href="#agencies" onclick="showSection('agencies')">
                        <i class="icon-building"></i> Agencies
                    </a>
                </li>
                <li>
                    <a href="#monitoring" onclick="showSection('monitoring')">
                        <i class="icon-monitor"></i> Monitoring
                    </a>
                </li>
                <li>
                    <a href="#deployment" onclick="showSection('deployment')">
                        <i class="icon-deploy"></i> Deployment
                    </a>
                </li>
                <li>
                    <a href="#audit" onclick="showSection('audit')">
                        <i class="icon-audit"></i> Audit Logs
                    </a>
                </li>
            </ul>
        </aside>

        <!-- Main Content -->
        <main class="ssa-main">
            <!-- Dashboard Section -->
            <section id="dashboard" class="ssa-section active">
                <div class="section-header">
                    <h1>Central Dashboard</h1>
                    <div class="quick-stats">
                        <div class="stat-card">
                            <h3>{{ total_agencies }}</h3>
                            <p>Active Agencies</p>
                        </div>
                        <div class="stat-card">
                            <h3>{{ total_users }}</h3>
                            <p>Total Users</p>
                        </div>
                        <div class="stat-card">
                            <h3>{{ total_devices }}</h3>
                            <p>Total Devices</p>
                        </div>
                        <div class="stat-card">
                            <h3>{{ active_recordings }}</h3>
                            <p>Active Recordings</p>
                        </div>
                    </div>
                </div>

                <!-- Agency Grid -->
                <div class="agencies-grid">
                    {% for agency in agencies %}
                    <div class="agency-card" onclick="switchToAgency('{{ agency.id }}')">
                        <div class="agency-header">
                            <img src="{{ agency.branding.logo_url or '/static/images/default_agency.png' }}" 
                                 alt="{{ agency.agency_name }} Logo">
                            <h3>{{ agency.agency_name }}</h3>
                        </div>
                        <div class="agency-stats">
                            <div class="stat">
                                <span class="value">{{ agency.user_count }}</span>
                                <span class="label">Users</span>
                            </div>
                            <div class="stat">
                                <span class="value">{{ agency.device_count }}</span>
                                <span class="label">Devices</span>
                            </div>
                            <div class="stat">
                                <span class="value">{{ agency.recording_count }}</span>
                                <span class="label">Recordings</span>
                            </div>
                        </div>
                        <div class="agency-status {{ agency.status }}">
                            <i class="status-indicator"></i>
                            {{ agency.status.title() }}
                        </div>
                        <div class="agency-actions">
                            <button onclick="viewAgency('{{ agency.id }}'); event.stopPropagation()">
                                View Dashboard
                            </button>
                            <button onclick="manageAgency('{{ agency.id }}'); event.stopPropagation()">
                                Manage
                            </button>
                        </div>
                    </div>
                    {% endfor %}
                </div>
            </section>

            <!-- Agencies Section -->
            <section id="agencies" class="ssa-section">
                <div class="section-header">
                    <h1>Agency Management</h1>
                    <button class="btn-primary" onclick="showDeploymentWizard()">
                        + Deploy New Agency
                    </button>
                </div>

                <div class="agencies-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Agency</th>
                                <th>Code</th>
                                <th>URL</th>
                                <th>Status</th>
                                <th>Version</th>
                                <th>Last Check</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for agency in agencies %}
                            <tr>
                                <td>
                                    <div class="agency-cell">
                                        <img src="{{ agency.branding.logo_url or '/static/images/default_agency.png' }}" 
                                             alt="{{ agency.agency_name }}">
                                        {{ agency.agency_name }}
                                    </div>
                                </td>
                                <td>{{ agency.agency_code }}</td>
                                <td>
                                    <a href="{{ agency.server_url }}" target="_blank">
                                        {{ agency.server_url }}
                                    </a>
                                </td>
                                <td>
                                    <span class="status-badge {{ agency.status }}">
                                        {{ agency.status.title() }}
                                    </span>
                                </td>
                                <td>{{ agency.version or 'Unknown' }}</td>
                                <td>{{ agency.last_health_check.strftime('%Y-%m-%d %H:%M') if agency.last_health_check else 'Never' }}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button onclick="viewAgency('{{ agency.id }}')" title="View Dashboard">
                                            <i class="icon-view"></i>
                                        </button>
                                        <button onclick="editAgency('{{ agency.id }}')" title="Edit Agency">
                                            <i class="icon-edit"></i>
                                        </button>
                                        <button onclick="healthCheck('{{ agency.id }}')" title="Health Check">
                                            <i class="icon-health"></i>
                                        </button>
                                        <button onclick="deployUpdate('{{ agency.id }}')" title="Deploy Update">
                                            <i class="icon-update"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Other sections... -->
        </main>
    </div>

    <!-- Agency View Modal -->
    <div id="agencyModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalAgencyName">Agency Dashboard</h2>
                <button class="modal-close" onclick="closeAgencyModal()">&times;</button>
            </div>
            <div class="modal-body">
                <iframe id="agencyFrame" src="" width="100%" height="600px"></iframe>
            </div>
        </div>
    </div>

    <script src="{{ url_for('static', filename='js/ssa_dashboard.js') }}"></script>
</body>
</html>
```

### 3.2 Agency Instance API Integration

**Update existing `app/routes.py` to add SSA endpoints:**
```python
# Add to existing app/routes.py

from app.auth.permissions import require_role
import hmac
import hashlib
import time

# SSA API endpoints (hidden from normal users)
@app.route('/api/ssa/health', methods=['GET'])
@verify_ssa_request
def ssa_health_check():
    """Health check endpoint for SSA monitoring"""
    return jsonify({
        'status': 'healthy',
        'agency': current_app.config.get('AGENCY_NAME', 'BUAS'),
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat(),
        'stats': {
            'users': User.query.count(),
            'devices': DeviceInfo.query.count(),
            'active_recordings': RecordingEvent.query.filter_by(stop_date=None).count()
        }
    })

@app.route('/api/ssa/dashboard', methods=['GET'])
@verify_ssa_request
def ssa_get_dashboard():
    """Get dashboard data for SSA view"""
    # Get aggregated dashboard data
    users = User.query.all()
    devices = DeviceInfo.query.all()
    recent_recordings = RecordingEvent.query.order_by(
        RecordingEvent.start_date.desc()
    ).limit(10).all()
    
    return jsonify({
        'agency': {
            'name': current_app.config.get('AGENCY_NAME', 'BUAS'),
            'code': current_app.config.get('AGENCY_CODE', 'BUAS')
        },
        'stats': {
            'total_users': len(users),
            'total_devices': len(devices),
            'active_recordings': RecordingEvent.query.filter_by(stop_date=None).count(),
            'recent_activity': len(recent_recordings)
        },
        'users': [user.to_dict() for user in users],
        'devices': [device.to_dict() for device in devices],
        'recent_recordings': [recording.to_dict() for recording in recent_recordings]
    })

@app.route('/api/ssa/users', methods=['GET'])
@verify_ssa_request
def ssa_get_users():
    """Get all users for SSA"""
    users = User.query.all()
    return jsonify({
        'users': [user.to_dict(include_sensitive=True) for user in users]
    })

@app.route('/api/ssa/control-recording', methods=['POST'])
@verify_ssa_request
def ssa_control_recording():
    """Allow SSA to control recordings"""
    data = request.get_json()
    device_id = data.get('device_id')
    action = data.get('action')
    
    if not device_id or action not in ['start', 'stop']:
        return jsonify({'error': 'Invalid parameters'}), 400
    
    # Create device command
    command = DeviceCommand(
        device_id=device_id,
        command=action,
        created_by='ssa_portal'
    )
    db.session.add(command)
    db.session.commit()
    
    # Log SSA action
    AuditLog.create(
        user_id=None,
        username='ssa_portal',
        action=f'ssa_recording_{action}',
        resource_type='device',
        resource_id=device_id,
        new_value=action
    )
    
    return jsonify({
        'success': True,
        'command_id': command.id,
        'message': f'Recording {action} command sent to {device_id}'
    })

def verify_ssa_request(f):
    """Decorator to verify SSA requests"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get headers
        timestamp = request.headers.get('X-SSA-Timestamp')
        signature = request.headers.get('X-SSA-Signature')
        agency_code = request.headers.get('X-SSA-Agency')
        
        if not all([timestamp, signature, agency_code]):
            return jsonify({'error': 'Missing SSA authentication headers'}), 401
        
        # Check timestamp (prevent replay attacks)
        try:
            request_time = int(timestamp)
            current_time = int(time.time())
            if abs(current_time - request_time) > 300:  # 5 minutes
                return jsonify({'error': 'Request timestamp too old'}), 401
        except ValueError:
            return jsonify({'error': 'Invalid timestamp'}), 401
        
        # Verify signature
        api_key = current_app.config.get('API_KEY')
        if not api_key:
            return jsonify({'error': 'API key not configured'}), 500
        
        method = request.method
        endpoint = request.path.replace('/api/ssa', '')
        data = request.get_data(as_text=True) if request.data else None
        
        message = f"{method}:{endpoint}:{timestamp}"
        if data:
            message += f":{data}"
        
        expected_signature = hmac.new(
            api_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            return jsonify({'error': 'Invalid signature'}), 401
        
        return f(*args, **kwargs)
    
    return decorated_function
```

## 🛠️ Implementation Steps

### Step 1: Setup Central Hub (Week 1)
1. Create `central_hub/` directory structure
2. Implement agency registry database
3. Build SSA authentication portal
4. Create inter-instance communication service
5. Test with single agency instance

### Step 2: Agency Deployment Automation (Week 2)
1. Create deployment scripts
2. Build configuration management
3. Implement branding system
4. Test automated agency creation
5. Document deployment process

### Step 3: SSA Integration (Week 3)
1. Build SSA dashboard frontend
2. Implement agency switching
3. Add monitoring and alerts
4. Create update deployment system
5. Test cross-agency functionality

### Step 4: Security & Testing (Week 4)
1. Implement secure API communication
2. Add request signing and verification
3. Test security between instances
4. Perform penetration testing
5. Document security procedures

## 🔒 Security Considerations

### 1. **API Security**
- HMAC signature verification for all SSA requests
- Time-based request validation (prevent replay attacks)
- Encrypted communication between instances
- Separate API keys per agency

### 2. **Agency Isolation**
- Completely separate databases
- No shared infrastructure
- Network-level isolation where possible
- Independent authentication systems

### 3. **SSA Access Controls**
- SSA access logged and auditable
- Limited SSA accounts (ideally just one)
- Strong authentication for SSA portal
- Emergency access procedures documented

### 4. **Data Protection**
- Agencies unaware of SSA existence
- No data flows between agencies
- SSA sees aggregated data only
- Complete audit trails maintained

## 📊 Monitoring & Maintenance

### Health Monitoring
- Automated health checks every 5 minutes
- Alert system for agency downtime
- Performance monitoring
- Version tracking across agencies

### Update Management
- Centralized update deployment
- Rollback capabilities
- Staged deployment process
- Update verification testing

### Backup & Recovery
- Automated daily backups
- Cross-geographic backup storage
- Disaster recovery procedures
- Data integrity verification

## 🎯 Success Criteria

### Technical Success
- ✅ SSA can view all agency dashboards
- ✅ Agencies remain completely isolated
- ✅ New agencies deploy in < 30 minutes
- ✅ Zero downtime for existing agencies
- ✅ Complete audit trail maintained

### Operational Success
- ✅ SSA portal intuitive and responsive
- ✅ Agency switching seamless
- ✅ Monitoring alerts working
- ✅ Update deployment automated
- ✅ Security verified through testing

## 📋 Implementation Checklist

### Phase 1: Central Hub
- [ ] Create central hub directory structure
- [ ] Implement agency registry database
- [ ] Build SSA authentication system
- [ ] Create inter-instance communication service
- [ ] Test with single agency

### Phase 2: Agency Automation
- [ ] Create deployment scripts
- [ ] Build configuration management
- [ ] Implement branding system
- [ ] Test automated agency creation
- [ ] Document deployment process

### Phase 3: SSA Integration
- [ ] Build SSA dashboard frontend
- [ ] Implement agency switching
- [ ] Add monitoring and alerts
- [ ] Create update deployment
- [ ] Test cross-agency functionality

### Phase 4: Security & Testing
- [ ] Implement API security
- [ ] Add request verification
- [ ] Test instance isolation
- [ ] Perform security testing
- [ ] Document procedures

## 🔧 Development Environment Setup

### Prerequisites
- Python 3.8+ with Flask
- Node.js 16+ for frontend builds
- PostgreSQL or SQLite for databases
- Docker (optional, for containerized deployment)
- SSL certificates for secure communication

### Development Commands
```bash
# Setup central hub
cd central_hub
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python app.py

# Deploy test agency
python deployment/deploy_agency.py \
  --agency-name "Test Agency" \
  --agency-code "TEST" \
  --domain "test.buas.local"

# Test SSA functionality
python test_ssa_integration.py
```

This implementation guide provides a complete roadmap for building the multi-agency SSA architecture while maintaining the security and isolation requirements you specified.
