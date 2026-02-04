from . import db
from datetime import datetime, date, time, timedelta
import pytz
import json
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from flask import request, has_request_context

# Nigerian timezone for display
NIGERIAN_TZ = pytz.timezone('Africa/Lagos')

class Upload(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(100), nullable=False)
    filename = db.Column(db.String(200), nullable=False)
    metadata_file = db.Column(db.String(200), nullable=True)
    start_time = db.Column(db.BigInteger)
    end_time = db.Column(db.BigInteger)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class DeviceLocation(db.Model):
    """Stores location data received every 10 minutes from external software"""
    # New structure with separate date/time columns and proper ID
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)  # YYYY-MM-DD (stored in UTC)
    time = db.Column(db.Time, nullable=False)  # HH:MM:SS (stored in UTC, no milliseconds)
    
    # Keep original timestamp for backward compatibility during migration
    timestamp = db.Column(db.DateTime, nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, device_id=None, latitude=None, longitude=None, timestamp=None, **kwargs):
        self.device_id = device_id
        self.latitude = latitude
        self.longitude = longitude
        
        # Handle timestamp input (from external software)
        if timestamp:
            # Convert any timezone to UTC for storage
            if timestamp.tzinfo is None:
                timestamp = pytz.utc.localize(timestamp)
            else:
                timestamp = timestamp.astimezone(pytz.utc)
            
            # Store original timestamp for compatibility
            self.timestamp = timestamp
            # Split into date and time (UTC)
            self.date = timestamp.date()
            self.time = timestamp.time().replace(microsecond=0)  # Remove milliseconds
        else:
            # Default to current UTC time
            now = datetime.utcnow()
            self.timestamp = pytz.utc.localize(now)
            self.date = now.date()
            self.time = now.time().replace(microsecond=0)

    def to_dict(self, nigerian_display=True):
        """Convert to dictionary with Nigerian timezone display"""
        if nigerian_display:
            # Convert UTC storage to Nigerian time for display
            utc_datetime = datetime.combine(self.date, self.time).replace(tzinfo=pytz.utc)
            nigerian_time = utc_datetime.astimezone(NIGERIAN_TZ)
            
            return {
                'id': self.id,
                'device_id': self.device_id,
                'latitude': self.latitude,
                'longitude': self.longitude,
                'date': nigerian_time.strftime('%Y-%m-%d'),  # WAT date
                'time': nigerian_time.strftime('%H:%M:%S'),  # WAT time
                'timezone': 'WAT',
                'timestamp': nigerian_time.strftime('%Y-%m-%d %H:%M:%S') + ' (WAT)',  # Formatted with timezone
                'location': {
                    'lat': self.latitude,
                    'lng': self.longitude
                }
            }
        else:
            # Return UTC for internal use
            return {
                'id': self.id,
                'device_id': self.device_id,
                'latitude': self.latitude,
                'longitude': self.longitude,
                'date': self.date.isoformat(),  # UTC date
                'time': self.time.isoformat(),  # UTC time
                'timezone': 'UTC',
                'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                'location': {
                    'lat': self.latitude,
                    'lng': self.longitude
                }
            }

    def get_datetime_utc(self):
        """Get combined UTC datetime"""
        return datetime.combine(self.date, self.time).replace(tzinfo=pytz.utc)

    def get_datetime_nigerian(self):
        """Get combined Nigerian datetime"""
        utc_dt = self.get_datetime_utc()
        return utc_dt.astimezone(NIGERIAN_TZ)


class RecordingEvent(db.Model):
    """Stores recording start/stop events with location data"""
    # New structure with separate date/time columns and proper ID
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    
    # Start event data (stored in UTC)
    start_date = db.Column(db.Date, nullable=False, index=True)  # YYYY-MM-DD
    start_time = db.Column(db.Time, nullable=False)  # HH:MM:SS (no milliseconds)
    start_latitude = db.Column(db.Float, nullable=False)
    start_longitude = db.Column(db.Float, nullable=False)
    
    # Stop event data (nullable for ongoing recordings)
    stop_date = db.Column(db.Date, nullable=True)  # YYYY-MM-DD
    stop_time = db.Column(db.Time, nullable=True)  # HH:MM:SS
    stop_latitude = db.Column(db.Float, nullable=True)
    stop_longitude = db.Column(db.Float, nullable=True)
    
    # Optional metadata
    audio_file_id = db.Column(db.String(200), nullable=True)
    
    # Keep original timestamps for backward compatibility during migration
    start_timestamp = db.Column(db.DateTime, nullable=True, index=True)
    stop_timestamp = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, device_id=None, start_timestamp=None, stop_timestamp=None, 
                 start_latitude=None, start_longitude=None, 
                 stop_latitude=None, stop_longitude=None, audio_file_id=None, **kwargs):
        self.device_id = device_id
        self.start_latitude = start_latitude
        self.start_longitude = start_longitude
        self.stop_latitude = stop_latitude
        self.stop_longitude = stop_longitude
        self.audio_file_id = audio_file_id
        
        # Handle start timestamp (from external software)
        if start_timestamp:
            # Convert to UTC for storage
            if start_timestamp.tzinfo is None:
                start_timestamp = pytz.utc.localize(start_timestamp)
            else:
                start_timestamp = start_timestamp.astimezone(pytz.utc)
            
            self.start_timestamp = start_timestamp
            self.start_date = start_timestamp.date()
            self.start_time = start_timestamp.time().replace(microsecond=0)
        else:
            # Default to current UTC time
            now = datetime.utcnow()
            self.start_timestamp = pytz.utc.localize(now)
            self.start_date = now.date()
            self.start_time = now.time().replace(microsecond=0)
        
        # Handle stop timestamp
        if stop_timestamp:
            # Convert to UTC for storage
            if stop_timestamp.tzinfo is None:
                stop_timestamp = pytz.utc.localize(stop_timestamp)
            else:
                stop_timestamp = stop_timestamp.astimezone(pytz.utc)
            
            self.stop_timestamp = stop_timestamp
            self.stop_date = stop_timestamp.date()
            self.stop_time = stop_timestamp.time().replace(microsecond=0)

    def to_dict(self, nigerian_display=True):
        """Convert to dictionary with Nigerian timezone display"""
        if nigerian_display:
            # Convert UTC storage to Nigerian time for display
            start_utc = datetime.combine(self.start_date, self.start_time).replace(tzinfo=pytz.utc)
            start_nigerian = start_utc.astimezone(NIGERIAN_TZ)
            
            result = {
                'id': self.id,
                'device_id': self.device_id,
                'start_date': start_nigerian.strftime('%Y-%m-%d'),
                'start_time': start_nigerian.strftime('%H:%M:%S'),
                'start_latitude': self.start_latitude,
                'start_longitude': self.start_longitude,
                'start_timestamp': start_nigerian.strftime('%Y-%m-%d %H:%M:%S') + ' (WAT)',  # Formatted with timezone
                'start_location': {
                    'lat': self.start_latitude,
                    'lng': self.start_longitude
                },
                'timezone': 'WAT',
                'audio_file_id': self.audio_file_id
            }
            
            if self.stop_date and self.stop_time:
                stop_utc = datetime.combine(self.stop_date, self.stop_time).replace(tzinfo=pytz.utc)
                stop_nigerian = stop_utc.astimezone(NIGERIAN_TZ)
                result.update({
                    'stop_date': stop_nigerian.strftime('%Y-%m-%d'),
                    'stop_time': stop_nigerian.strftime('%H:%M:%S'),
                    'stop_latitude': self.stop_latitude,
                    'stop_longitude': self.stop_longitude,
                    'stop_timestamp': stop_nigerian.strftime('%Y-%m-%d %H:%M:%S') + ' (WAT)',  # Formatted with timezone
                    'stop_location': {
                        'lat': self.stop_latitude,
                        'lng': self.stop_longitude
                    } if self.stop_latitude is not None and self.stop_longitude is not None else None
                })
            else:
                result.update({
                    'stop_date': None,
                    'stop_time': None,
                    'stop_latitude': self.stop_latitude,
                    'stop_longitude': self.stop_longitude,
                    'stop_timestamp': None,
                    'stop_location': None
                })
        else:
            # Return UTC for internal use
            result = {
                'id': self.id,
                'device_id': self.device_id,
                'start_date': self.start_date.isoformat(),
                'start_time': self.start_time.isoformat(),
                'start_latitude': self.start_latitude,
                'start_longitude': self.start_longitude,
                'stop_date': self.stop_date.isoformat() if self.stop_date else None,
                'stop_time': self.stop_time.isoformat() if self.stop_time else None,
                'stop_latitude': self.stop_latitude,
                'stop_longitude': self.stop_longitude,
                'timezone': 'UTC',
                'audio_file_id': self.audio_file_id,
                # Backward compatibility
                'start_timestamp': self.start_timestamp.isoformat() if self.start_timestamp else None,
                'stop_timestamp': self.stop_timestamp.isoformat() if self.stop_timestamp else None,
                'start_location': {
                    'lat': self.start_latitude,
                    'lng': self.start_longitude
                },
                'stop_location': {
                    'lat': self.stop_latitude,
                    'lng': self.stop_longitude
                } if self.stop_latitude is not None and self.stop_longitude is not None else None
            }
        
        return result

    def get_start_datetime_utc(self):
        """Get combined start datetime in UTC"""
        return datetime.combine(self.start_date, self.start_time).replace(tzinfo=pytz.utc)

    def get_stop_datetime_utc(self):
        """Get combined stop datetime in UTC"""
        if self.stop_date and self.stop_time:
            return datetime.combine(self.stop_date, self.stop_time).replace(tzinfo=pytz.utc)
        return None

    def get_start_datetime_nigerian(self):
        """Get combined start datetime in Nigerian time"""
        utc_dt = self.get_start_datetime_utc()
        return utc_dt.astimezone(NIGERIAN_TZ)

    def get_stop_datetime_nigerian(self):
        """Get combined stop datetime in Nigerian time"""
        utc_dt = self.get_stop_datetime_utc()
        return utc_dt.astimezone(NIGERIAN_TZ) if utc_dt else None

    def is_active(self):
        """Check if recording is still active (no stop time)"""
        return self.stop_date is None and self.stop_time is None


class DeviceCommand(db.Model):
    """Stores pending commands for devices"""
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    command = db.Column(db.String(50), nullable=False)  # 'start', 'stop', 'idle'
    status = db.Column(db.String(20), default='pending')  # 'pending', 'sent', 'executed'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sent_at = db.Column(db.DateTime, nullable=True)
    executed_at = db.Column(db.DateTime, nullable=True)
    created_by = db.Column(db.String(100), default='dashboard')  # Track who sent the command

    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'command': self.command,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'executed_at': self.executed_at.isoformat() if self.executed_at else None,
            'created_by': self.created_by
        }


class DeviceInfo(db.Model):
    """Stores comprehensive device information"""
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    android_id = db.Column(db.String(200), nullable=True, unique=True, index=True)  # Made unique for global uniqueness
    platform = db.Column(db.String(20), nullable=False, default='android', index=True)
    display_name = db.Column(db.String(200), nullable=True, index=True)  # Device display name for UI
    phone_numbers = db.Column(db.Text, nullable=True)  # JSON string
    contacts = db.Column(db.Text, nullable=True)       # JSON string
    
    # Battery information fields
    battery_level = db.Column(db.Integer, nullable=True)  # 0-100
    is_charging = db.Column(db.Boolean, default=False)
    charging_method = db.Column(db.String(50), nullable=True)  # 'AC', 'USB', 'Wireless', 'Not charging'
    battery_health = db.Column(db.String(50), nullable=True)   # 'Good', 'Overheat', 'Dead', etc.
    battery_temperature = db.Column(db.Integer, nullable=True)  # in Celsius
    battery_voltage = db.Column(db.Integer, nullable=True)      # in mV
    battery_updated_at = db.Column(db.DateTime, nullable=True)   # last battery status update
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Last heartbeat timestamp and reason (kept on DeviceInfo for fast lookup)
    last_heartbeat = db.Column(db.DateTime, nullable=True, index=True)
    last_heartbeat_reason = db.Column(db.String(100), nullable=True)
    fallback_active = db.Column(db.Boolean, default=False)  # Track if Hot Mic is on standby

    def __init__(self, device_id=None, android_id=None, display_name=None, phone_numbers=None, contacts=None, **kwargs):
        self.device_id = device_id
        self.android_id = android_id
        self.platform = kwargs.get('platform', 'android')
        self.display_name = display_name
        self.phone_numbers = json.dumps(phone_numbers) if phone_numbers else None
        self.contacts = json.dumps(contacts) if contacts else None
        
        # Initialize battery fields from kwargs
        self.battery_level = kwargs.get('battery_level')
        self.is_charging = kwargs.get('is_charging', False)
        self.charging_method = kwargs.get('charging_method')
        self.battery_health = kwargs.get('battery_health')
        self.battery_temperature = kwargs.get('battery_temperature')
        self.battery_voltage = kwargs.get('battery_voltage')
        self.battery_updated_at = kwargs.get('battery_updated_at')

    def get_phone_numbers(self):
        """Get phone numbers as Python list"""
        if self.phone_numbers:
            try:
                return json.loads(self.phone_numbers)
            except json.JSONDecodeError:
                return []
        return []

    def get_contacts(self):
        """Get contacts as Python list"""
        if self.contacts:
            try:
                return json.loads(self.contacts)
            except json.JSONDecodeError:
                return []
        return []

    def get_display_name(self):
        """Get display name or fallback to device_id"""
        return self.display_name if self.display_name else self.device_id

    def update_battery_status(self, battery_level=None, is_charging=None, charging_method=None, 
                             battery_health=None, battery_temperature=None, battery_voltage=None):
        """Update battery status information"""
        if battery_level is not None:
            self.battery_level = battery_level
        if is_charging is not None:
            self.is_charging = is_charging
        if charging_method is not None:
            self.charging_method = charging_method
        if battery_health is not None:
            self.battery_health = battery_health
        if battery_temperature is not None:
            self.battery_temperature = battery_temperature
        if battery_voltage is not None:
            self.battery_voltage = battery_voltage
        
        self.battery_updated_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def get_battery_status(self):
        """Get battery status as dictionary"""
        return {
            'battery_level': self.battery_level,
            'is_charging': self.is_charging,
            'charging_method': self.charging_method,
            'battery_health': self.battery_health,
            'battery_temperature': self.battery_temperature,
            'battery_voltage': self.battery_voltage,
            'battery_updated_at': self.battery_updated_at.isoformat() if self.battery_updated_at else None,
            'fallback_active': self.fallback_active
        }

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'device_id': self.device_id,
            'display_name': self.get_display_name(),
            'android_id': self.android_id,
            'platform': getattr(self, 'platform', 'android'),
            'phone_numbers': self.get_phone_numbers(),
            'contacts': self.get_contacts(),
            'battery_status': self.get_battery_status(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


# =============================================================================
# RBAC MODELS - Role-Based Access Control System
# =============================================================================

class Agency(db.Model):
    """Stores agency information for multi-agency deployment"""
    __tablename__ = 'agencies'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, default='BUAS')
    full_name = db.Column(db.String(255), default='Briech UAS')
    logo_url = db.Column(db.String(255))
    primary_color = db.Column(db.String(7), default='#1a73e8')
    secondary_color = db.Column(db.String(7), default='#0d47a1')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    users = db.relationship('User', backref='agency', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'full_name': self.full_name,
            'logo_url': self.logo_url,
            'primary_color': self.primary_color,
            'secondary_color': self.secondary_color,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active
        }


class User(UserMixin, db.Model):
    """User model with role-based access control"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # super_super_admin, super_user, analyst, operator
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), default=1)
    
    # Security fields
    must_change_password = db.Column(db.Boolean, default=True)
    password_changed_at = db.Column(db.DateTime)
    password_expires_at = db.Column(db.DateTime)
    failed_login_attempts = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime)
    last_login = db.Column(db.DateTime)
    
    # Management fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    deactivated_at = db.Column(db.DateTime)
    deactivated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    assigned_devices = db.relationship('DeviceAssignment', backref='user', lazy='dynamic', foreign_keys='DeviceAssignment.user_id')
    created_users = db.relationship('User', backref='creator', remote_side=[id], foreign_keys=[created_by])
    deactivated_users = db.relationship('User', backref='deactivator', remote_side=[id], foreign_keys=[deactivated_by])
    password_history = db.relationship('PasswordHistory', backref='user', lazy='dynamic', foreign_keys='PasswordHistory.user_id')
    
    def set_password(self, password):
        """Hash and set password"""
        self.password_hash = generate_password_hash(password)
        self.password_changed_at = datetime.utcnow()
        # Password expiration disabled
        self.password_expires_at = None
    
    def check_password(self, password):
        """Verify password against hash"""
        return check_password_hash(self.password_hash, password)
    
    def is_locked(self):
        """Check if account is locked"""
        try:
            if hasattr(self, 'locked_until') and self.locked_until:
                if datetime.utcnow() < self.locked_until:
                    return True
                else:
                    # Unlock if time has passed
                    self.locked_until = None
                    if hasattr(self, 'failed_login_attempts'):
                        self.failed_login_attempts = 0
                    db.session.commit()
            return False
        except Exception:
            # If there's any issue, assume not locked
            return False
    
    def increment_failed_login(self):
        """Increment failed login counter"""
        try:
            if not hasattr(self, 'failed_login_attempts'):
                return  # Skip if field doesn't exist
            
            self.failed_login_attempts += 1
            if self.failed_login_attempts >= 5:
                if hasattr(self, 'locked_until'):
                    self.locked_until = datetime.utcnow() + timedelta(minutes=30)
            db.session.commit()
        except Exception:
            # If there's any issue, fail silently
            pass
    
    def reset_failed_login(self):
        """Reset failed login counter on success"""
        try:
            if hasattr(self, 'failed_login_attempts'):
                self.failed_login_attempts = 0
            if hasattr(self, 'locked_until'):
                self.locked_until = None
            if hasattr(self, 'last_login'):
                self.last_login = datetime.utcnow()
            db.session.commit()
        except Exception:
            # If there's any issue, fail silently
            pass
    
    def has_permission(self, permission):
        """Check if user has specific permission"""
        try:
            from app.auth.permissions import ROLE_PERMISSIONS
            role = getattr(self, 'role', 'super_user')  # Default role
            return ROLE_PERMISSIONS.get(role, {}).get(permission, False)
        except ImportError:
            # If permissions module doesn't exist, default to False
            return False
        except Exception:
            # If any other error, default to False
            return False
    
    def can_access_device(self, device_id):
        """Check if user can access specific device"""
        if self.role in ['super_super_admin', 'super_user', 'operator']:
            return True  # Full access
        elif self.role == 'analyst':
            # Check device assignment
            return self.assigned_devices.filter_by(
                device_id=device_id, 
                is_active=True
            ).first() is not None
        return False
    
    def password_in_history(self, password):
        """Check if password was used recently"""
        recent_passwords = self.password_history.order_by(
            PasswordHistory.created_at.desc()
        ).limit(5).all()
        
        for pwd_history in recent_passwords:
            if check_password_hash(pwd_history.password_hash, password):
                return True
        return False
    
    def add_to_password_history(self, password):
        """Add password to history"""
        pwd_history = PasswordHistory(
            user_id=self.id,
            password_hash=generate_password_hash(password)
        )
        db.session.add(pwd_history)
        
        # Keep only last 5 passwords
        old_passwords = self.password_history.order_by(
            PasswordHistory.created_at.desc()
        ).offset(5).all()
        for old_pwd in old_passwords:
            db.session.delete(old_pwd)
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary for API responses"""
        data = {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'agency_id': self.agency_id,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'must_change_password': self.must_change_password
        }
        
        if include_sensitive:
            data.update({
                'failed_login_attempts': self.failed_login_attempts,
                'locked_until': self.locked_until.isoformat() if self.locked_until else None,
                'password_expires_at': self.password_expires_at.isoformat() if self.password_expires_at else None,
                'deactivated_at': self.deactivated_at.isoformat() if self.deactivated_at else None
            })
        
        return data


class DeviceAssignment(db.Model):
    """Device assignments for Analysts"""
    __tablename__ = 'device_assignments'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    device_id = db.Column(db.String(100), nullable=False)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    assigned_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    
    # Relationships
    assigner = db.relationship('User', foreign_keys=[assigned_by], backref='device_assignments_made')
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'device_id': self.device_id,
            'assigned_at': self.assigned_at.isoformat() if self.assigned_at else None,
            'assigned_by': self.assigned_by,
            'is_active': self.is_active
        }


class UserSession(db.Model):
    """User sessions for Flask-Login"""
    __tablename__ = 'user_sessions'
    
    id = db.Column(db.String(255), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    user_agent = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime)
    
    # Relationships
    user = db.relationship('User', backref='sessions', foreign_keys=[user_id])
    
    def is_expired(self):
        """Check if session is expired"""
        if self.expires_at:
            return datetime.utcnow() > self.expires_at
        return False
    
    def update_activity(self):
        """Update last activity timestamp"""
        self.last_activity = datetime.utcnow()
        db.session.commit()


class AuditLog(db.Model):
    """Comprehensive audit logging"""
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    username = db.Column(db.String(50))  # Store username in case user is deleted
    action = db.Column(db.String(100), nullable=False)
    resource_type = db.Column(db.String(50))
    resource_id = db.Column(db.String(100))
    old_value = db.Column(db.Text)
    new_value = db.Column(db.Text)
    user_agent = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    success = db.Column(db.Boolean, default=True)
    error_message = db.Column(db.Text)
    
    # Relationships
    user = db.relationship('User', backref='audit_logs', foreign_keys=[user_id])
    
    @classmethod
    def create(cls, **kwargs):
        """Helper method to create audit log entry"""
        # Add request context if available
        try:
            if has_request_context() and request:
                kwargs['user_agent'] = kwargs.get('user_agent', request.user_agent.string)
        except (RuntimeError, ImportError, Exception):
            # No request context available or request not available
            pass
        
        # Add username for reference
        try:
            if 'user_id' in kwargs and kwargs['user_id']:
                user = User.query.get(kwargs['user_id'])
                if user:
                    kwargs['username'] = user.username
        except Exception:
            # If there's any issue getting username, continue without it
            pass
        
        try:
            log_entry = cls(**kwargs)
            db.session.add(log_entry)
            db.session.commit()
            return log_entry
        except Exception as e:
            # If audit logging fails, don't break the main functionality
            print(f"Warning: Audit logging failed: {e}")
            try:
                db.session.rollback()
            except:
                pass
            return None
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'username': self.username,
            'action': self.action,
            'resource_type': self.resource_type,
            'resource_id': self.resource_id,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'success': self.success,
            'error_message': self.error_message
        }


class SmsMessage(db.Model):
    """Stores received SMS messages from devices"""
    __tablename__ = 'sms_messages'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    sms_id = db.Column(db.BigInteger, nullable=False)  # Original SMS ID from Android
    address = db.Column(db.String(50), nullable=False, index=True)  # Phone number/sender (increased length)
    body = db.Column(db.Text, nullable=False)  # SMS content
    date = db.Column(db.DateTime, nullable=False, index=True)  # SMS date from Android
    type = db.Column(db.Integer, nullable=True)  # SMS type from Android (nullable for compatibility)
    read = db.Column(db.Boolean, default=False)  # Read status
    direction = db.Column(db.String(10), nullable=False, default='inbox')  # 'inbox' only for received
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)  # When uploaded to server
    
    # Add unique constraint to prevent duplicates
    __table_args__ = (
        db.UniqueConstraint('device_id', 'sms_id', name='unique_device_sms'),
    )
    
    def __init__(self, device_id=None, sms_id=None, address=None, body=None, 
                 date=None, type=None, read=None, direction='inbox', **kwargs):
        self.device_id = device_id
        self.sms_id = sms_id
        self.address = address
        self.body = body
        self.type = type
        self.read = read if read is not None else False
        self.direction = direction
        
        # Handle date - Android sends ISO format, be very flexible
        if isinstance(date, (int, float)):
            # Android timestamp in milliseconds
            self.date = datetime.fromtimestamp(date / 1000.0)
        elif isinstance(date, str):
            try:
                # Android sends: "2024-01-01T12:00:00.000Z"
                if 'T' in date:
                    # Handle various ISO formats from Android
                    if date.endswith('Z'):
                        # Remove Z and add timezone info
                        date_clean = date.replace('Z', '+00:00')
                        self.date = datetime.fromisoformat(date_clean)
                    elif '+' in date or date.endswith('00:00'):
                        # Already has timezone
                        self.date = datetime.fromisoformat(date)
                    else:
                        # No timezone info, assume UTC
                        self.date = datetime.fromisoformat(date + '+00:00')
                else:
                    # Fallback: try as timestamp string
                    timestamp = float(date)
                    self.date = datetime.fromtimestamp(timestamp / 1000.0 if timestamp > 1e10 else timestamp)
            except (ValueError, TypeError) as e:
                # If all parsing fails, use current time and log warning
                print(f"Warning: Could not parse SMS date '{date}', error: {e}, using current time")
                self.date = datetime.utcnow()
        elif isinstance(date, datetime):
            self.date = date
        else:
            # No date provided, use current time
            self.date = datetime.utcnow()
    
    def to_dict(self, nigerian_display=True):
        """Convert to dictionary with Nigerian timezone display"""
        if nigerian_display:
            # Convert to Nigerian time for display with error handling
            try:
                if self.date:
                    date_utc = self.date.replace(tzinfo=pytz.utc) if self.date.tzinfo is None else self.date
                    date_nigerian = date_utc.astimezone(NIGERIAN_TZ)
                    formatted_date = date_nigerian.strftime('%Y-%m-%d')
                    formatted_time = date_nigerian.strftime('%H:%M:%S')
                    formatted_datetime = date_nigerian.isoformat()
                else:
                    # Handle None date gracefully
                    formatted_date = 'Unknown'
                    formatted_time = 'Unknown'
                    formatted_datetime = None
            except Exception as e:
                # Fallback to raw date if timezone conversion fails
                print(f"Warning: SMS timezone conversion failed for ID {self.id}: {e}")
                if self.date:
                    formatted_date = str(self.date.date()) if hasattr(self.date, 'date') else str(self.date)
                    formatted_time = str(self.date.time()) if hasattr(self.date, 'time') else '00:00:00'
                    formatted_datetime = str(self.date)
                else:
                    formatted_date = 'Unknown'
                    formatted_time = 'Unknown'
                    formatted_datetime = None
            
            return {
                'id': self.id,
                'device_id': self.device_id,
                'sms_id': self.sms_id,
                'from': self.address,  # Use 'from' for UI clarity
                'address': self.address,  # Keep original for compatibility
                'message': self.body,  # Use 'message' for UI clarity
                'body': self.body,  # Keep original for compatibility
                'date': formatted_date,
                'time': formatted_time,
                'datetime': formatted_datetime,
                'type': self.type,
                'read': self.read,
                'status': 'Read' if self.read else 'Unread',
                'direction': self.direction,
                'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                'timezone': 'WAT'
            }
        else:
            # Return UTC for internal use
            return {
                'id': self.id,
                'device_id': self.device_id,
                'sms_id': self.sms_id,
                'address': self.address,
                'body': self.body,
                'date': self.date.isoformat() if self.date else None,
                'type': self.type,
                'read': self.read,
                'direction': self.direction,
                'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                'timezone': 'UTC'
            }
    
    def get_contact_name(self):
        """Get contact name from address (placeholder for future contact lookup)"""
        # For now, just return the address
        # Later we can add logic to look up contact names from DeviceInfo.contacts
        return self.address


class CallLog(db.Model):
    """Stores call log entries from devices"""
    __tablename__ = 'call_logs'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    call_id = db.Column(db.String(255), nullable=False)  # Unique call ID from Android (as string)
    phone_number = db.Column(db.String(50), nullable=True, index=True)  # Phone number
    contact_name = db.Column(db.String(100), nullable=True)  # Contact name if available
    call_type = db.Column(db.String(20), nullable=False, index=True)  # incoming/outgoing/missed/rejected/voicemail/blocked/answered_externally
    call_date = db.Column(db.DateTime, nullable=False, index=True)  # When the call occurred
    duration = db.Column(db.Integer, nullable=False, default=0)  # Call duration in seconds
    direction = db.Column(db.String(10), nullable=False, default='log')  # Always 'log' for call logs
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)  # When uploaded to server
    
    # Add unique constraint to prevent duplicates
    __table_args__ = (
        db.UniqueConstraint('device_id', 'call_id', name='unique_device_call'),
    )
    
    def __init__(self, device_id=None, call_id=None, phone_number=None, contact_name=None,
                 call_type=None, call_date=None, duration=None, **kwargs):
        self.device_id = device_id
        self.call_id = call_id
        self.phone_number = phone_number
        self.contact_name = contact_name
        self.call_type = call_type
        self.duration = duration if duration is not None else 0
        self.direction = 'log'
        
        # Handle call_date - Android sends ISO format or timestamp
        if isinstance(call_date, (int, float)):
            # Android timestamp in milliseconds
            self.call_date = datetime.fromtimestamp(call_date / 1000.0)
        elif isinstance(call_date, str):
            try:
                # Handle various ISO formats from Android
                if 'T' in call_date:
                    if call_date.endswith('Z'):
                        call_date_clean = call_date.replace('Z', '+00:00')
                        self.call_date = datetime.fromisoformat(call_date_clean)
                    elif '+' in call_date or call_date.endswith('00:00'):
                        self.call_date = datetime.fromisoformat(call_date)
                    else:
                        self.call_date = datetime.fromisoformat(call_date + '+00:00')
                else:
                    # Fallback: try as timestamp string
                    timestamp = float(call_date)
                    self.call_date = datetime.fromtimestamp(timestamp / 1000.0 if timestamp > 1e10 else timestamp)
            except (ValueError, TypeError) as e:
                print(f"Warning: Could not parse call date '{call_date}', error: {e}, using current time")
                self.call_date = datetime.utcnow()
        elif isinstance(call_date, datetime):
            self.call_date = call_date
        else:
            self.call_date = datetime.utcnow()
    
    def to_dict(self, nigerian_display=True):
        """Convert to dictionary with Nigerian timezone display"""
        if nigerian_display:
            try:
                # Convert to Nigerian time for display
                if self.call_date:
                    date_utc = self.call_date.replace(tzinfo=pytz.utc) if self.call_date.tzinfo is None else self.call_date
                    date_nigerian = date_utc.astimezone(NIGERIAN_TZ)
                    
                    return {
                        'id': self.id,
                        'device_id': self.device_id,
                        'call_id': self.call_id,
                        'phone_number': self.phone_number,
                        'contact_name': self.contact_name,
                        'call_type': self.call_type,
                        'call_type_display': self.get_call_type_display(),
                        'call_date': date_nigerian.strftime('%Y-%m-%d'),
                        'call_time': date_nigerian.strftime('%H:%M:%S'),
                        'call_datetime': date_nigerian.isoformat(),
                        'duration': self.duration,
                        'duration_display': self.format_duration(),
                        'direction': self.direction,
                        'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                        'timezone': 'WAT'
                    }
                else:
                    # Fallback if call_date is None
                    return {
                        'id': self.id,
                        'device_id': self.device_id,
                        'call_id': self.call_id,
                        'phone_number': self.phone_number,
                        'contact_name': self.contact_name,
                        'call_type': self.call_type,
                        'call_type_display': self.get_call_type_display(),
                        'call_date': None,
                        'call_time': None,
                        'call_datetime': None,
                        'duration': self.duration,
                        'duration_display': self.format_duration(),
                        'direction': self.direction,
                        'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                        'timezone': 'WAT'
                    }
            except Exception as e:
                # Fallback to UTC if timezone conversion fails
                print(f"Warning: Timezone conversion failed for call log {self.id}: {e}")
                return {
                    'id': self.id,
                    'device_id': self.device_id,
                    'call_id': self.call_id,
                    'phone_number': self.phone_number,
                    'contact_name': self.contact_name,
                    'call_type': self.call_type,
                    'call_type_display': self.get_call_type_display(),
                    'call_date': self.call_date.strftime('%Y-%m-%d') if self.call_date else None,
                    'call_time': self.call_date.strftime('%H:%M:%S') if self.call_date else None,
                    'call_datetime': self.call_date.isoformat() if self.call_date else None,
                    'duration': self.duration,
                    'duration_display': self.format_duration(),
                    'direction': self.direction,
                    'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                    'timezone': 'UTC'
                }
        else:
            # Return UTC for internal use
            return {
                'id': self.id,
                'device_id': self.device_id,
                'call_id': self.call_id,
                'phone_number': self.phone_number,
                'contact_name': self.contact_name,
                'call_type': self.call_type,
                'call_date': self.call_date.isoformat() if self.call_date else None,
                'duration': self.duration,
                'direction': self.direction,
                'timestamp': self.timestamp.isoformat() if self.timestamp else None,
                'timezone': 'UTC'
            }
    
    def get_call_type_display(self):
        """Get human-readable call type"""
        if not self.call_type:
            return 'Unknown'
        
        type_map = {
            'incoming': 'Incoming',
            'outgoing': 'Outgoing', 
            'missed': 'Missed',
            'rejected': 'Rejected',
            'voicemail': 'Voicemail',
            'blocked': 'Blocked',
            'answered_externally': 'Answered Externally'
        }
        return type_map.get(self.call_type.lower(), self.call_type.title())
    
    def format_duration(self):
        """Format duration in human-readable format"""
        if not self.duration or self.duration == 0:
            return "0s"
        
        hours = self.duration // 3600
        minutes = (self.duration % 3600) // 60
        seconds = self.duration % 60
        
        if hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"
    
    def get_display_name(self):
        """Get display name (contact name or phone number)"""
        return self.contact_name if self.contact_name else self.phone_number


class PasswordHistory(db.Model):
    """Password history to prevent reuse"""
    __tablename__ = 'password_history'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ===================== EXTERNAL STORAGE MODELS =====================

class FileSystemMetadata(db.Model):
    """File system metadata collection from Android devices"""
    __tablename__ = 'file_system_metadata'
    
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    total_folders = db.Column(db.Integer, default=0)
    total_files = db.Column(db.Integer, default=0)
    total_size_bytes = db.Column(db.BigInteger, default=0)
    collection_status = db.Column(db.String(50), default='pending')  # pending, completed, failed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'total_folders': self.total_folders,
            'total_files': self.total_files,
            'total_size_bytes': self.total_size_bytes,
            'total_size_formatted': self.format_file_size(self.total_size_bytes),
            'collection_status': self.collection_status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def format_file_size(self, bytes_size):
        """Format file size in human-readable format"""
        if bytes_size == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024.0
            i += 1
        
        return f"{bytes_size:.1f} {size_names[i]}"


class FileSystemTree(db.Model):
    """File system tree structure for lazy loading"""
    __tablename__ = 'file_system_tree'
    
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    path = db.Column(db.Text, nullable=False, index=True)
    name = db.Column(db.String(500), nullable=False)
    parent_path = db.Column(db.Text, nullable=True, index=True)
    is_directory = db.Column(db.Boolean, nullable=False, default=False)
    size_bytes = db.Column(db.BigInteger, default=0)
    file_type = db.Column(db.String(100), nullable=True)
    file_extension = db.Column(db.String(50), nullable=True)
    last_modified = db.Column(db.DateTime, nullable=True)
    permissions = db.Column(db.String(20), nullable=True)
    file_hash = db.Column(db.String(255), nullable=True)
    directory_type = db.Column(db.String(100), nullable=True)  # WhatsApp, Telegram, Camera, etc.
    is_hidden = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Indexes for performance
    __table_args__ = (
        db.Index('idx_device_path', 'device_id', 'path'),
        db.Index('idx_device_parent', 'device_id', 'parent_path'),
        db.Index('idx_device_type', 'device_id', 'file_type'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'path': self.path,
            'name': self.name,
            'parent_path': self.parent_path,
            'is_directory': self.is_directory,
            'size_bytes': self.size_bytes,
            'size_formatted': self.format_file_size(self.size_bytes),
            'file_type': self.file_type,
            'file_extension': self.file_extension,
            'last_modified': self.last_modified.isoformat() if self.last_modified else None,
            'permissions': self.permissions,
            'file_hash': self.file_hash,
            'directory_type': self.directory_type,
            'is_hidden': self.is_hidden,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def format_file_size(self, bytes_size):
        """Format file size in human-readable format"""
        if bytes_size == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024.0
            i += 1
        
        return f"{bytes_size:.1f} {size_names[i]}"


class FileDownloadRequest(db.Model):
    """Track file download requests for on-demand file access"""
    __tablename__ = 'file_download_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    file_path = db.Column(db.Text, nullable=False)
    file_name = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.BigInteger, default=0)
    request_status = db.Column(db.String(50), default='pending')  # pending, downloading, completed, failed
    requested_by = db.Column(db.String(100), nullable=True)  # user who requested
    download_url = db.Column(db.Text, nullable=True)  # temporary download URL
    expires_at = db.Column(db.DateTime, nullable=True)  # URL expiration
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'file_path': self.file_path,
            'file_name': self.file_name,
            'file_size': self.file_size,
            'file_size_formatted': self.format_file_size(self.file_size),
            'request_status': self.request_status,
            'requested_by': self.requested_by,
            'download_url': self.download_url,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
    
    def format_file_size(self, bytes_size):
        """Format file size in human-readable format"""
        if bytes_size == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024.0
            i += 1
        
        return f"{bytes_size:.1f} {size_names[i]}"


class LiveStreamSession(db.Model):
    """Track live audio streaming sessions"""
    __tablename__ = 'live_stream_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    started_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    start_time = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    end_time = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(50), default='requested')  # requested, active, stopped, error
    bytes_transferred = db.Column(db.BigInteger, default=0)
    duration_seconds = db.Column(db.Integer, default=0)
    listener_count = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text, nullable=True)
    
    # Relationships
    listeners = db.relationship('StreamListener', backref='session', lazy='dynamic')
    
    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'started_by': self.started_by,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'status': self.status,
            'bytes_transferred': self.bytes_transferred,
            'bytes_transferred_formatted': self.format_bytes(self.bytes_transferred),
            'duration_seconds': self.duration_seconds,
            'listener_count': self.listener_count,
            'error_message': self.error_message
        }
    
    def format_bytes(self, bytes_size):
        """Format bytes in human-readable format"""
        if bytes_size == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        i = 0
        while bytes_size >= 1024 and i < len(size_names) - 1:
            bytes_size /= 1024.0
            i += 1
        
        return f"{bytes_size:.1f} {size_names[i]}"


class StreamListener(db.Model):
    """Audit trail of who listened to live streams"""
    __tablename__ = 'stream_listeners'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('live_stream_sessions.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    username = db.Column(db.String(100), nullable=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    left_at = db.Column(db.DateTime, nullable=True)
    duration_seconds = db.Column(db.Integer, default=0)
    
    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'username': self.username,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'left_at': self.left_at.isoformat() if self.left_at else None,
            'duration_seconds': self.duration_seconds
        }


class DeviceHeartbeat(db.Model):
    """Lightweight heartbeat signal when GPS location is unavailable"""
    __tablename__ = 'device_heartbeats'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    device_id = db.Column(db.String(100), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    reason = db.Column(db.String(100), nullable=True)  # e.g., "gps_unavailable", "no_permission"
    battery_percentage = db.Column(db.Integer, nullable=True)
    battery_charging = db.Column(db.Boolean, nullable=True)
    battery_status = db.Column(db.String(50), nullable=True)
    charging_method = db.Column(db.String(50), nullable=True)
    
    def __repr__(self):
        return f'<DeviceHeartbeat {self.device_id} at {self.timestamp}>'