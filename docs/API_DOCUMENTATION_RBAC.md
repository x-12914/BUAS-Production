# BUAS RBAC API Documentation - Complete Endpoint Reference

## 📚 Table of Contents
- [Authentication Endpoints](#authentication-endpoints)
- [User Management Endpoints](#user-management-endpoints)
- [RBAC-Protected Routes](#rbac-protected-routes)
- [Audit Logging Endpoints](#audit-logging-endpoints)
- [Permission Reference](#permission-reference)
- [Error Codes](#error-codes)
- [Migration Guide](#migration-guide)

---

## 🔐 Authentication Endpoints

### POST /api/auth/login
Authenticate user and create session.

**Request:**
```json
{
  "username": "string",
  "password": "string",
  "remember": boolean (optional, default: false)
}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": 123,
    "username": "analyst_user",
    "role": "analyst",
    "agency_id": 1
  },
  "must_change_password": false
}
```

**Error Responses:**
- **400** - Missing username/password
- **401** - Invalid credentials or password expired
- **403** - Account locked

### POST /api/auth/logout
Logout user and destroy session.

**Request:** No body required

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### GET /api/auth/status
Check current authentication status.

**Success Response (200):**
```json
{
  "authenticated": true,
  "user": {
    "id": 123,
    "username": "analyst_user",
    "role": "analyst",
    "agency_id": 1,
    "must_change_password": false
  }
}
```

### POST /api/auth/change-password
Change current user's password.

**Request:**
```json
{
  "current_password": "string",
  "new_password": "string"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Error Responses:**
- **400** - Current password incorrect or new password doesn't meet requirements
- **401** - Not authenticated

### GET /api/auth/password-requirements
Get password policy requirements.

**Success Response (200):**
```json
{
  "min_length": 12,
  "require_uppercase": true,
  "require_lowercase": true,
  "require_numbers": true,
  "require_special": true,
  "special_characters": "!@#$%^&*()_+-=[]{}|;:,.<>?",
  "password_history_count": 5,
  "max_age_days": 90
}
```

---

## 👥 User Management Endpoints

### GET /api/users
List users based on role permissions.

**Authentication:** Required  
**Permissions:** `view_all_users` or `view_agency_users`

**Query Parameters:**
- `role` (optional) - Filter by role
- `status` (optional) - Filter by active/inactive
- `search` (optional) - Search by username

**Success Response (200):**
```json
{
  "users": [
    {
      "id": 123,
      "username": "analyst_user",
      "role": "analyst",
      "is_active": true,
      "last_login": "2025-08-17T10:30:00Z",
      "created_at": "2025-08-01T09:00:00Z",
      "must_change_password": false,
      "assigned_devices": ["device123", "device456"]
    }
  ]
}
```

### POST /api/users
Create new user.

**Authentication:** Required  
**Permissions:** Role-based creation permissions

**Request:**
```json
{
  "username": "string",
  "role": "analyst|operator|super_user",
  "agency_id": 1 (optional, defaults to creator's agency)
}
```

**Success Response (201):**
```json
{
  "success": true,
  "user_id": 124,
  "username": "new_analyst",
  "temporary_password": "TempPass123!@#",
  "message": "User created successfully. Communicate credentials securely."
}
```

**Error Responses:**
- **400** - Username already exists or invalid role
- **403** - Insufficient permissions to create this role

### GET /api/users/{user_id}
Get user details.

**Authentication:** Required  
**Permissions:** Must be able to manage the target user

**Success Response (200):**
```json
{
  "id": 123,
  "username": "analyst_user",
  "role": "analyst",
  "agency_id": 1,
  "is_active": true,
  "last_login": "2025-08-17T10:30:00Z",
  "created_at": "2025-08-01T09:00:00Z",
  "created_by": 101,
  "assigned_devices": ["device123", "device456"],
  "device_assignments": [
    {
      "device_id": "device123",
      "assigned_at": "2025-08-01T09:15:00Z",
      "assigned_by": 101,
      "is_active": true
    }
  ]
}
```

### POST /api/users/{user_id}/reset-password
Admin reset user password.

**Authentication:** Required  
**Permissions:** Must be able to manage the target user

**Success Response (200):**
```json
{
  "success": true,
  "temporary_password": "NewTempPass456!@#",
  "message": "Password reset successfully. Communicate new password securely."
}
```

### POST /api/users/{user_id}/deactivate
Deactivate user account.

**Authentication:** Required  
**Permissions:** Must be able to manage the target user

**Success Response (200):**
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

### POST /api/users/{user_id}/reactivate
Reactivate user account.

**Authentication:** Required  
**Permissions:** Must be able to manage the target user

**Success Response (200):**
```json
{
  "success": true,
  "message": "User reactivated successfully"
}
```

### POST /api/users/{user_id}/assign-devices
Assign devices to analyst.

**Authentication:** Required  
**Permissions:** `assign_devices` permission

**Request:**
```json
{
  "device_ids": ["device123", "device456", "device789"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "assigned_devices": ["device123", "device456", "device789"]
}
```

---

## 🔒 RBAC-Protected Routes

### Recording Control Endpoints

#### POST /api/device/{device_id}/recording/command
Control recording for specific device.

**Authentication:** Required  
**Permissions:** `control_recordings`  
**Device Access:** Must have access to the device

**Request:**
```json
{
  "command": "start|stop"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "device_id": "device123",
  "command": "start",
  "status": "Recording started successfully"
}
```

#### POST /api/recording/batch-command
Control recording for multiple devices.

**Authentication:** Required  
**Permissions:** `control_recordings`

**Request:**
```json
{
  "command": "start|stop",
  "device_ids": ["device123", "device456"]
}
```

### Data Access Endpoints

#### GET /api/device/{device_id}/audio-files
Get audio files for device.

**Authentication:** Required  
**Permissions:** `access_audio_data`  
**Device Access:** Must have access to the device

#### GET /api/device/{device_id}/location-history
Get location history for device.

**Authentication:** Required  
**Permissions:** `access_location_data`  
**Device Access:** Must have access to the device

#### GET /api/dashboard-data
Get dashboard data filtered by role.

**Authentication:** Required  
**Permissions:** Automatic filtering based on role

**Success Response (200):**
```json
{
  "users": [
    {
      "user_id": "device123",
      "device_id": "device123",
      "contact_name": "Device 123",
      "status": "online",
      "last_seen": "2025-08-17T10:30:00Z"
    }
  ],
  "total_users": 1,
  "recording_active": 0,
  "last_updated": "2025-08-17T10:30:00Z"
}
```

### Export Endpoints

#### GET /api/export/audio/{device_id}
Export audio data for device.

**Authentication:** Required  
**Permissions:** `export_data` and `access_audio_data`  
**Device Access:** Must have access to the device

#### GET /api/export/location/{device_id}
Export location data for device.

**Authentication:** Required  
**Permissions:** `export_data` and `access_location_data`  
**Device Access:** Must have access to the device

---

## 📋 Audit Logging Endpoints

### GET /api/audit-logs
Get audit logs with filtering.

**Authentication:** Required  
**Permissions:** `access_audit_logs`

**Query Parameters:**
- `limit` (optional, default: 50) - Number of results
- `offset` (optional, default: 0) - Pagination offset
- `action` (optional) - Filter by action type
- `user_id` (optional) - Filter by user
- `start_date` (optional) - Filter by date range
- `end_date` (optional) - Filter by date range

**Success Response (200):**
```json
{
  "logs": [
    {
      "id": 1001,
      "timestamp": "2025-08-17T10:30:00Z",
      "user_id": 123,
      "username": "analyst_user",
      "action": "LOGIN_SUCCESS",
      "resource_type": "authentication",
      "resource_id": "analyst_user",
      "old_value": null,
      "new_value": null,
      "success": true,
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0..."
    }
  ],
  "total": 1500,
  "limit": 50,
  "offset": 0
}
```

### Audit Actions
Standard audit actions tracked by the system:

#### Authentication Actions
- `LOGIN_SUCCESS` - Successful user login
- `LOGIN_FAILED` - Failed login attempt
- `LOGIN_LOCKED` - Login attempt on locked account
- `LOGOUT` - User logout
- `PASSWORD_CHANGED` - User changed password
- `PASSWORD_RESET` - Admin reset user password
- `SESSION_EXPIRED` - Session timeout

#### User Management Actions
- `USER_CREATED` - New user created
- `USER_UPDATED` - User information modified
- `USER_DEACTIVATED` - User account deactivated
- `USER_REACTIVATED` - User account reactivated
- `USER_PASSWORD_RESET` - Admin reset user password
- `USER_ROLE_CHANGED` - User role modified

#### Device Management Actions
- `DEVICE_ASSIGNED` - Device assigned to user
- `DEVICE_UNASSIGNED` - Device removed from user
- `DEVICE_ACCESSED` - User accessed device details
- `DEVICE_ACCESS_DENIED` - Access denied to device
- `DEVICE_REGISTERED` - New device registered

#### Recording Actions
- `RECORDING_START` - Recording started
- `RECORDING_STOP` - Recording stopped
- `RECORDING_STARTED` - Recording started event received
- `RECORDING_STOPPED` - Recording stopped event received
- `BATCH_RECORDING_START` - Batch recording started
- `BATCH_RECORDING_STOP` - Batch recording stopped

#### Data Access Actions
- `AUDIO_DATA_ACCESSED` - User accessed audio files
- `LOCATION_DATA_ACCESSED` - User accessed location data
- `LOCATION_DATA_RECEIVED` - Location data received from device
- `RECORDING_EVENT_RECEIVED` - Recording event received
- `DATA_EXPORT` - Data exported by user
- `AUDIT_LOG_ACCESSED` - Audit logs accessed

#### System Actions
- `PERMISSION_DENIED` - Permission denied for action
- `UNAUTHORIZED_ACCESS` - Unauthorized access attempt
- `SYSTEM_ERROR` - System error occurred

---

## 🔑 Permission Reference

### Permission Matrix by Role

| Permission | Super Super Admin | Super User | Analyst | Operator |
|------------|:-----------------:|:----------:|:-------:|:--------:|
| `create_super_user` | ✅ | ❌ | ❌ | ❌ |
| `create_analyst` | ✅ | ✅ | ❌ | ❌ |
| `create_operator` | ✅ | ✅ | ❌ | ❌ |
| `manage_all_users` | ✅ | ❌ | ❌ | ❌ |
| `view_all_users` | ✅ | ❌ | ❌ | ❌ |
| `view_agency_users` | ✅ | ✅ | ❌ | ❌ |
| `view_all_devices` | ✅ | ✅ | ❌ | ✅ |
| `view_assigned_devices` | ✅ | ✅ | ✅ | ❌ |
| `control_recordings` | ✅ | ✅ | ❌ | ✅ |
| `access_audio_data` | ✅ | ✅ | ✅* | ❌ |
| `access_location_data` | ✅ | ✅ | ✅* | ❌ |
| `export_data` | ✅ | ✅ | ✅* | ❌ |
| `assign_devices` | ✅ | ✅ | ❌ | ❌ |
| `access_audit_logs` | ✅ | ✅ | ❌ | ❌ |
| `system_configuration` | ✅ | ❌ | ❌ | ❌ |
| `emergency_access` | ✅ | ❌ | ❌ | ❌ |

\* Only for assigned devices

### Permission Decorators

Use these decorators to protect routes:

```python
from app.auth.permissions import require_permission, require_role

# Require specific permission
@require_permission('control_recordings')
def recording_endpoint():
    pass

# Require one of multiple roles
@require_role(['super_super_admin', 'super_user'])
def admin_endpoint():
    pass

# Check permission in code
if current_user.has_permission('access_audio_data'):
    # Allow access
    pass
```

---

## ❗ Error Codes

### Authentication Errors
- **401 Unauthorized** - Authentication required
- **403 Forbidden** - Insufficient permissions
- **423 Locked** - Account locked due to failed attempts

### Validation Errors
- **400 Bad Request** - Invalid input data
- **422 Unprocessable Entity** - Validation failed

### Resource Errors
- **404 Not Found** - Resource not found
- **409 Conflict** - Resource conflict (e.g., username exists)

### Server Errors
- **500 Internal Server Error** - Server error occurred

### Standard Error Response Format
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional details"
  }
}
```

### Permission Error Response
```json
{
  "error": "Insufficient permissions",
  "required": "control_recordings",
  "your_role": "analyst"
}
```

---

## 🔄 Migration Guide

### From Basic Auth to RBAC

#### Breaking Changes
1. **Authentication Required** - All endpoints now require login
2. **Role-Based Access** - Data filtering by user role
3. **Device Assignment** - Analysts see only assigned devices
4. **Permission Checks** - Some actions restricted by role

#### Migration Steps

#### 1. Update Client Authentication
**Before:**
```javascript
// Basic auth with hardcoded credentials
fetch('/api/dashboard-data', {
  headers: {
    'Authorization': 'Basic ' + btoa('admin:password')
  }
});
```

**After:**
```javascript
// Session-based authentication
// 1. Login first
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  credentials: 'include',
  body: JSON.stringify({username: 'user', password: 'pass'})
});

// 2. Subsequent requests use session
fetch('/api/dashboard-data', {
  credentials: 'include'  // Include session cookie
});
```

#### 2. Handle Role-Based Data
**Before:**
```javascript
// All users saw all devices
const devices = response.data.users;
```

**After:**
```javascript
// Data is automatically filtered by role
const devices = response.data.users;  // Already filtered
// Analysts see only assigned devices
// Operators see all devices but no audio/location access
```

#### 3. Handle Permission Errors
```javascript
try {
  const response = await fetch('/api/device/123/recording/command', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({command: 'start'})
  });
  
  if (response.status === 403) {
    // Handle permission denied
    showError('You don\'t have permission to control recordings');
  }
} catch (error) {
  // Handle other errors
}
```

#### 4. User Management Integration
```javascript
// Check if user can manage users
if (user.role === 'super_super_admin' || user.role === 'super_user') {
  // Show user management interface
  showUserManagement();
}

// Device assignment for analysts
if (user.role === 'analyst') {
  // Show only assigned devices
  const assignedDevices = getAssignedDevices(user.id);
}
```

### Backward Compatibility

#### Supported Legacy Endpoints
- Basic dashboard endpoints still work but return filtered data
- Device detail endpoints work with permission checks
- Recording control requires proper permissions

#### Removed Features
- Anonymous access to any endpoints
- Hardcoded authentication
- Full device access for all users

### Testing Migration

#### 1. Create Test Users
```bash
# Create initial admin
python create_initial_admin.py

# Create test users for each role
# Use user management interface or API
```

#### 2. Test Role Access
```bash
# Test comprehensive RBAC functionality
python test_segment9_comprehensive_rbac.py

# Test specific features
python test_auth_system.py
```

#### 3. Verify Data Filtering
- Login as Analyst - should see only assigned devices
- Login as Operator - should see all devices but no audio access
- Login as Super User - should see all agency data
- Login as Super Super Admin - should see everything

---

## 📚 Additional Resources

### Related Documentation
- [User Guide](USER_GUIDE_RBAC.md) - Complete user guide for all roles
- [Setup Guide](SETUP_INSTRUCTIONS.md) - Installation and configuration
- [Troubleshooting Guide](TROUBLESHOOTING.md) - Common issues and solutions

### Code Examples
- [Authentication Service](../frontend/src/services/authService.js)
- [Permission Decorators](../app/auth/permissions.py)
- [User Management](../app/user_routes/user_management.py)

### Security References
- OWASP Authentication Guidelines
- Flask-Login Security Best Practices
- Session Management Security

---

**Document Version**: 1.0  
**Last Updated**: August 17, 2025  
**API Version**: BUAS RBAC v2.0+
