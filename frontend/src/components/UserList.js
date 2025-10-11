import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RecordingControlButton from './RecordingControlButton';
import './UserList.css';

const UserList = ({ 
  users = [], 
  loading = false, 
  selectedUser, 
  onUserSelect,
  roleRestrictions = {} // New prop for role-based restrictions
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Filter and search users
  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.android_id && user.android_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (user.device_name && user.device_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Apply status filter - only primary statuses
    if (statusFilter !== 'all') {
      filtered = filtered.filter(user => {
        const status = user.status || 'unknown';
        return status === statusFilter;
      });
    }

    return filtered;
  }, [users, searchTerm, statusFilter]);

  const getStatusBadge = (user) => {
    // New 5-status system with backend status mapping
    const status = user.status || 'unknown';
    switch (status) {
      case 'listening':
        return <span className="status-badge status-listening">🎧 Listening</span>;
      case 'offline':
        return <span className="status-badge status-offline">🔴 Offline</span>;
      case 'lost_while_listening':
        return <span className="status-badge status-warning">⚠️ Lost Connection</span>;
      case 'online':
        return <span className="status-badge status-online">🟢 Online</span>;
      default:
        return <span className="status-badge status-unknown">❓ Unknown</span>;
    }
  };

  const formatLastSeen = (timestamp, date, time, timezone) => {
    // Handle new date/time format from backend
    if (date && time) {
      // New format: separate date and time (already in Nigerian timezone from backend)
      const dateTimeString = `${date}T${time}`;
      const lastSeen = new Date(dateTimeString);
      
      if (isNaN(lastSeen.getTime())) return 'Invalid date';
      
      const now = new Date();
      const diffMs = now - lastSeen;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    }
    
    // Fallback to old timestamp format
    if (!timestamp) return 'Never';
    
    const now = new Date();
    const lastSeen = new Date(timestamp);
    
    if (isNaN(lastSeen.getTime())) return 'Invalid date';
    
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Format last seen timestamp
  const getLastSeenWithColor = (user) => {
    // Check if we have new format data
    const hasNewFormat = user.latest_location?.date && user.latest_location?.time;
    
    let lastSeenText;
    
    if (hasNewFormat) {
      // Use new date/time format
      lastSeenText = formatLastSeen(null, user.latest_location.date, user.latest_location.time, user.latest_location.timezone);
    } else {
      // Fallback to old timestamp format
      lastSeenText = formatLastSeen(user.last_seen);
    }
    
    if (lastSeenText === 'Never' || lastSeenText === 'Invalid date') {
      return <span className="last-seen-text">Never</span>;
    }
    
    const timezoneLabel = hasNewFormat ? ' (WAT)' : '';
    
    return (
      <span className="last-seen-text">
        {lastSeenText}{timezoneLabel}
      </span>
    );
  };

  const handleDeviceClick = (user) => {
    // Check role restrictions before navigation
    if (roleRestrictions.hideDeviceDetails) {
      // For operators, prevent device detail access
      return;
    }
    
    if (roleRestrictions.restrictedAccess) {
      // For analysts, only navigate to assigned devices
      navigate(`/device/${user.android_id || user.user_id}`);
    } else {
      // Full access
      navigate(`/device/${user.android_id || user.user_id}`);
    }
  };

  const shouldShowRecordingControl = (user) => {
    if (roleRestrictions.hideRecordingControls) return false;
    if (roleRestrictions.showRecordingControls) return true;
    return true; // Default behavior
  };

  const getBatteryColorClass = (batteryLevel) => {
    if (batteryLevel >= 75) return 'battery-high';
    if (batteryLevel >= 25) return 'battery-medium';
    return 'battery-low';
  };

  const handleRecordingStatusChange = (deviceId, recordingStatus) => {
    // This function is called when a recording control button updates
    // We could update local state here if needed, but the polling will handle it
  };

  const getRecordingState = (user) => {
    const recordingStatus = user.recording_status;
    if (!recordingStatus) return 'idle';
    
    // Map backend status to button state
    const state = recordingStatus.recording_state;
    
    // Handle offline devices
    if (!recordingStatus.can_control && recordingStatus.last_seen_minutes > 7) {
      return 'offline';
    }
    
    return state;
  };

  const getDeviceCardClass = (user) => {
    let baseClass = 'user-card';
    
    // Add clickable class if device can be clicked
    if (!roleRestrictions.hideDeviceDetails) {
      baseClass += ' clickable-card';
    }
    
    // Add selected class if this user is selected
    if (selectedUser && selectedUser.user_id === user.user_id) {
      baseClass += ' selected';
    }
    
    return baseClass;
  };

  if (loading && users.length === 0) {
    return (
      <div className="user-list-container">
        <div className="user-list-header">
          <h2>🦇 Connected Devices</h2>
        </div>
        <div className="loading-users">
          <div className="spinner"></div>
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-list-container">
      <div className="user-list-header">
        <h2>🦇 Connected Devices ({filteredUsers.length})</h2>
        
        <div className="user-list-controls">
          {/* Search Input */}
          <div className="search-container">
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>

          {/* Status Filter - Only Primary Statuses */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter"
          >
            <option value="all">All Status</option>
            <option value="listening">🎧 Listening</option>
            <option value="online">🟢 Online</option>
            <option value="offline">🔴 Offline</option>
          </select>
        </div>
      </div>

      {/* User Cards */}
      <div className="user-list">
        {filteredUsers.length === 0 ? (
          <div className="no-users">
            <p>
              {searchTerm || statusFilter !== 'all' 
                ? '🔍 No devices match your search criteria'
                : '📱 No devices connected yet'
              }
            </p>
            {searchTerm && (
              <button 
                className="btn btn-secondary"
                onClick={() => setSearchTerm('')}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          filteredUsers.map(user => (
            <div 
              key={user.user_id}
              className={getDeviceCardClass(user)}
              onClick={() => handleDeviceClick(user)}
            >
              <div className="user-header">
                <div className="user-info">
                  <h3 className="user-id">
                    📱 {user.display_name || user.user_id}
                  </h3>
                  {user.android_id && (
                    <p className="android-id">Android ID: {user.android_id}</p>
                  )}
                  <p className="user-location">
                    📍 {(user.location?.lat || 0).toFixed(4)}, {(user.location?.lng || 0).toFixed(4)}
                  </p>
                  {user.battery?.level !== null && user.battery?.level !== undefined && (
                    <p className="user-battery">
                      🔋 {user.battery.level}%
                      {user.battery.is_charging && <span className="charging-indicator">⚡</span>}
                    </p>
                  )}
                </div>
                {getStatusBadge(user)}
              </div>

              <div className="user-details">
                <div className="user-stats">
                  <div className="stat-item">
                    <span className="stat-label">Recordings:</span>
                    <span className="stat-value">{user.uploads?.length || 0}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Last Seen:</span>
                    {getLastSeenWithColor(user)}
                  </div>
                </div>

                <div className="user-actions">
                  {/* Recording Control Button - Role-based visibility */}
                  {shouldShowRecordingControl(user) && (
                    <RecordingControlButton
                      deviceId={user.android_id || user.user_id}
                      initialStatus={getRecordingState(user)}
                      onStatusChange={handleRecordingStatusChange}
                      disabled={loading}
                    />
                  )}
                  
                  {/* Role-based restrictions notice - removed redundant text */}
                  
                  {roleRestrictions.restrictedAccess && (
                    <div className="role-notice">
                      <span>🔍 Assigned Device</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UserList;
