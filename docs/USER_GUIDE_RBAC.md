# BUAS RBAC User Guide - Complete Role Documentation

## 📚 Table of Contents
- [Super Super Admin Guide](#super-super-admin-guide)
- [Super User Guide](#super-user-guide)
- [Analyst Guide](#analyst-guide)
- [Operator Guide](#operator-guide)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## 🔑 Super Super Admin Guide

### Overview
As a **Super Super Admin**, you have the highest level of access in the BUAS system. You can manage all users, access all data, and configure system-wide settings.

### Key Responsibilities
- Create and manage Super Users
- System configuration and maintenance
- Emergency access recovery
- Cross-agency coordination (future capability)
- Complete audit trail oversight

### What You Can Do

#### ✅ User Management
- **Create Super Users** - Full agency administrators
- **Create Analysts** - Intelligence analysts with device assignments
- **Create Operators** - Field operators with recording controls
- **Reset passwords** for any user
- **Deactivate/reactivate** user accounts
- **View all users** across all agencies

#### ✅ System Access
- **Full dashboard access** - See all devices and data
- **All recording controls** - Start/stop recordings on any device
- **Complete data access** - Audio files, location history, analytics
- **Audit log access** - View all system activity
- **System configuration** - Modify system settings
- **Emergency functions** - Recovery and maintenance tools

### Daily Tasks

#### Creating Users
1. Navigate to **User Management** from the dashboard
2. Click **"+ Create New User"**
3. Fill in user details:
   - Username (will be used for login)
   - Role (Super User, Analyst, or Operator)
   - Agency (if applicable)
4. Click **"Create User"**
5. **Securely communicate** the temporary password to the new user
6. User must change password on first login

#### Password Resets
1. Go to **User Management**
2. Find the user in the list
3. Click **"Reset Password"** 
4. **Securely share** the new temporary password
5. User must change password on next login

#### System Monitoring
1. Access **Audit Logs** from the dashboard
2. Review recent activity for:
   - Failed login attempts
   - Unusual data access patterns
   - Permission denied events
3. Investigate any suspicious activity

### Best Practices
- 🔐 **Change your password regularly** (every 60-90 days)
- 📋 **Review audit logs weekly** for security monitoring
- 👥 **Create Super Users sparingly** - Only for agency administrators
- 🔄 **Document all administrative actions** for accountability
- 🚨 **Monitor failed login attempts** and investigate lockouts

---

## 👨‍💼 Super User Guide

### Overview
As a **Super User**, you are the administrator for your agency. You can manage analysts and operators, control all recordings, and access all agency data.

### Key Responsibilities
- Manage analysts and operators in your agency
- Assign devices to analysts
- Monitor all agency devices and recordings
- Generate reports and analytics
- Maintain operational readiness

### What You Can Do

#### ✅ User Management (Limited)
- **Create Analysts** - Intelligence analysts for your agency
- **Create Operators** - Field operators for your agency
- **Reset passwords** for analysts and operators
- **Assign devices** to analysts
- **Deactivate users** you created
- ❌ **Cannot create other Super Users**

#### ✅ Device & Data Access
- **Full dashboard access** - All agency devices
- **Recording controls** - Start/stop on any device
- **Audio file access** - All recordings in your agency
- **Location data** - All device locations
- **Analytics tools** - Generate reports and insights
- **Export capabilities** - Download data for analysis

### Daily Tasks

#### Creating Analysts
1. Go to **User Management**
2. Click **"+ Create New User"**
3. Select **"Analyst"** role
4. After creation, **assign devices**:
   - Click on the new analyst
   - Select **"Assign Devices"**
   - Choose which devices they should monitor
5. Share temporary password securely

#### Managing Recordings
1. **Monitor device status** on the dashboard
2. **Start recordings** when needed:
   - Select devices or use batch controls
   - Monitor recording status
3. **Stop recordings** when complete
4. **Review audio files** and metadata

#### Device Assignment
1. Access **User Management**
2. Select an **Analyst** user
3. Click **"Manage Device Assignments"**
4. Select devices from available list
5. Save assignments
6. Analyst will now see only assigned devices

### Operational Workflows

#### Daily Monitoring Routine
1. **Check device status** - Online/offline/listening
2. **Review overnight recordings** - Check for issues
3. **Monitor analyst activity** - Ensure proper device access
4. **Check system health** - Look for errors or alerts

#### Weekly Reports
1. **Generate activity reports** from dashboard
2. **Review user access logs** 
3. **Check device assignment effectiveness**
4. **Plan upcoming operations** based on data

### Best Practices
- 📊 **Monitor device assignments** - Ensure analysts have appropriate access
- 🎵 **Coordinate recording schedules** - Avoid conflicts
- 📈 **Regular data exports** - Backup important recordings
- 👥 **Train your analysts and operators** - Ensure proper system use
- 📋 **Weekly team check-ins** - Review system effectiveness

---

## 🔍 Analyst Guide

### Overview
As an **Analyst**, you focus on intelligence gathering and data analysis. You can access audio and location data for your assigned devices only.

### Key Responsibilities
- Monitor assigned devices for activity
- Analyze audio recordings and location patterns
- Generate intelligence reports
- Maintain situational awareness
- Provide analysis to leadership

### What You Can Access

#### ✅ Assigned Devices Only
- **Dashboard view** - Only your assigned devices
- **Audio recordings** - From your devices only
- **Location history** - Track device movements
- **Analytics tools** - Analyze patterns and trends
- **Export capabilities** - Generate reports from your data

#### ❌ What You Cannot Do
- **Control recordings** - Cannot start/stop recordings
- **Access other devices** - Only see assigned devices
- **Manage users** - Cannot create or modify accounts
- **Change assignments** - Cannot modify device assignments

### Daily Workflow

#### Morning Routine
1. **Log in** to the BUAS system
2. **Check overnight activity** on assigned devices
3. **Review new recordings** - Listen to important audio
4. **Check location movements** - Track device positions
5. **Identify patterns** - Look for trends or anomalies

#### Analysis Tasks
1. **Audio Analysis**:
   - Play recordings from assigned devices
   - Take notes on significant events
   - Mark important timestamps
   - Export clips for reporting

2. **Location Analysis**:
   - Review device movement patterns
   - Check for unusual locations
   - Track timing correlations
   - Map movement with events

3. **Report Generation**:
   - Export data for analysis
   - Create summary reports
   - Document findings
   - Share with supervisors

### Analysis Tools

#### Dashboard Features
- **Device status indicators** - Real-time status
- **Recording timeline** - See when recordings occurred
- **Location map** - Visual device positioning
- **Activity summary** - Quick statistics

#### Export Capabilities
- **Audio files** - Download recordings
- **Location data** - Export GPS tracks
- **Activity reports** - Summarized data
- **Custom date ranges** - Specific time periods

### Best Practices
- 🎧 **Regular audio review** - Don't let recordings pile up
- 📍 **Track location patterns** - Look for behavioral changes
- 📊 **Document your analysis** - Keep detailed notes
- 🔍 **Report anomalies quickly** - Alert supervisors to unusual activity
- 💾 **Regular data exports** - Backup your analysis work

---

## ⚙️ Operator Guide

### Overview
As an **Operator**, you control recording operations across all agency devices. You focus on technical operations without accessing sensitive data.

### Key Responsibilities
- Monitor device operational status
- Control recording start/stop operations
- Maintain device connectivity
- Coordinate field operations
- Ensure operational readiness

### What You Can Do

#### ✅ Recording Operations
- **View all agency devices** - See complete device list
- **Start/stop recordings** - Control recording operations
- **Monitor device status** - Online/offline/listening states
- **Batch operations** - Control multiple devices
- **Status monitoring** - Real-time operational awareness

#### ❌ What You Cannot Access
- **Audio recordings** - Cannot listen to or download audio
- **Location history** - Cannot see GPS tracking data
- **User management** - Cannot create or modify accounts
- **Analytics tools** - Cannot generate reports or export data

### Daily Operations

#### Shift Startup
1. **Log in** to BUAS system
2. **Check device status** - Verify all devices online
3. **Review overnight operations** - Check for issues
4. **Coordinate with field teams** - Ensure device readiness
5. **Prepare for operational tasks**

#### Recording Control
1. **Individual Device Control**:
   - Select device from dashboard
   - Click **"Start Recording"** or **"Stop Recording"**
   - Monitor status changes
   - Verify successful operation

2. **Batch Operations**:
   - Select multiple devices
   - Choose **"Batch Start"** or **"Batch Stop"**
   - Monitor progress of all devices
   - Confirm all operations complete

#### Status Monitoring
- **Green indicators** - Device online and ready
- **Yellow indicators** - Device issues or transitioning
- **Red indicators** - Device offline or error
- **Recording icons** - Shows active recording status

### Operational Procedures

#### Pre-Operation Checklist
- [ ] All assigned devices online
- [ ] Recording storage space available
- [ ] Communication with field teams established
- [ ] Backup procedures reviewed

#### During Operations
- [ ] Monitor device status continuously
- [ ] Respond to status changes quickly
- [ ] Coordinate with field teams
- [ ] Document any issues encountered

#### Post-Operation
- [ ] Ensure all recordings stopped
- [ ] Verify device status normal
- [ ] Report any technical issues
- [ ] Update operational logs

### Best Practices
- 📱 **Constant status monitoring** - Watch for device issues
- ⚡ **Quick response times** - React to problems immediately
- 📞 **Field team coordination** - Maintain communication
- 📋 **Document everything** - Log all operations and issues
- 🔧 **Report technical problems** - Help maintain system health

---

## 🔧 Common Tasks

### Changing Your Password
1. **Log in** to the system
2. Click your **username** in the top-right corner
3. Select **"Change Password"**
4. Enter your **current password**
5. Enter your **new password** (must meet requirements):
   - Minimum 12 characters
   - Include uppercase and lowercase letters
   - Include numbers and special characters
   - Cannot reuse recent passwords
6. Confirm new password and **save**

### Understanding Device Status
- 🟢 **Online** - Device connected and ready
- 🟡 **Listening** - Device actively recording
- 🔴 **Offline** - Device not connected
- ⚠️ **Error** - Device has technical issues

### Navigation Tips
- **Dashboard** - Main overview of all accessible devices
- **User Management** - Available to Super Users and above
- **Device Details** - Click any device for detailed information
- **Audit Logs** - Available to Super Admins for monitoring
- **Your Profile** - Access via username menu

### Export Data
1. Navigate to the relevant data view
2. Select date range (if applicable)
3. Choose **"Export"** option
4. Select format (CSV, JSON, etc.)
5. Download will begin automatically

---

## ❗ Troubleshooting

### Login Issues

#### "Invalid Credentials"
- Verify username and password are correct
- Check if Caps Lock is on
- Contact your administrator if still failing

#### "Account Locked"
- Account locked after 5 failed attempts
- Wait 30 minutes for automatic unlock
- Or contact administrator for immediate unlock

#### "Password Expired"
- Change password on next login
- Follow password requirements
- Cannot reuse recent passwords

### Access Issues

#### "Access Denied" Messages
- You don't have permission for this action
- Contact your administrator if you need access
- Verify you're using the correct account

#### "Device Not Found"
- Device may not be assigned to you (Analysts)
- Contact administrator to verify assignments
- Check if device ID is correct

### Technical Issues

#### Dashboard Not Loading
- Check internet connection
- Try refreshing the page
- Clear browser cache
- Contact administrator if persistent

#### Recording Controls Not Working
- Verify you have recording permissions
- Check device is online
- Try refreshing device status
- Report to administrator if continues

### Getting Help

#### For All Users
- Check this user guide first
- Contact your direct supervisor
- Document the issue clearly
- Include screenshots if helpful

#### Contact Information
- **Technical Issues**: Contact Super User
- **Access Problems**: Contact administrator
- **Account Issues**: Contact Super Super Admin
- **Emergency**: Use emergency contact procedures

### System Requirements
- **Modern web browser** (Chrome, Firefox, Safari, Edge)
- **JavaScript enabled**
- **Stable internet connection**
- **Screen resolution**: Minimum 1024x768

---

## 📖 Additional Resources

### Password Requirements
- Minimum 12 characters
- Must include uppercase letters (A-Z)
- Must include lowercase letters (a-z)
- Must include numbers (0-9)
- Must include special characters (!@#$%^&*)
- Cannot contain username
- Cannot reuse last 5 passwords
- Expires every 90 days

### Security Best Practices
- **Never share your password** with anyone
- **Log out when finished** using the system
- **Use strong, unique passwords** 
- **Report suspicious activity** immediately
- **Keep your computer secure** when logged in

### Support Contacts
- **System Administrator**: [Contact Info]
- **Technical Support**: [Contact Info]
- **Emergency Procedures**: [Contact Info]

---

**Document Version**: 1.0  
**Last Updated**: August 17, 2025  
**Valid For**: BUAS RBAC System v2.0+
