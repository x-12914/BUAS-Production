import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RecordingControlButton from './RecordingControlButton';
import FallbackButton from './FallbackButton';
import DeviceCardListenControl from './DeviceCardListenControl';
import { Headphones, Activity, AlertCircle, CircleDashed, Search, Smartphone, MapPin, Battery, Zap, ShieldCheck } from 'lucide-react';

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
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success"><Headphones size={12} /> Listening</span>;
      case 'offline':
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-raised text-content-muted"><CircleDashed size={12} /> Offline</span>;
      case 'lost_while_listening':
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-warning-muted text-warning"><AlertCircle size={12} /> Lost Connection</span>;
      case 'online':
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success"><Activity size={12} /> Online</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-raised text-content-muted">Unknown</span>;
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
      return <span className="text-xs text-content-secondary">Never</span>;
    }

    const timezoneLabel = hasNewFormat ? ' (WAT)' : '';

    return (
      <span className="text-xs text-content-secondary">
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

  const shouldShowLiveListen = (user) => {
    const platform = (user.platform || 'android').toLowerCase();
    return platform !== 'ios';
  };

  const getBatteryColor = (batteryLevel) => {
    if (batteryLevel >= 60) return 'text-success';
    if (batteryLevel >= 30) return 'text-warning';
    return 'text-danger';
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

  const getDeviceCardClasses = (user) => {
    const isSelected = selectedUser && selectedUser.user_id === user.user_id;
    const isClickable = !roleRestrictions.hideDeviceDetails;

    return `bg-surface-overlay border rounded-xl p-4 transition-all ${
      isClickable ? 'cursor-pointer hover:border-accent/30 hover:shadow-lg' : ''
    } ${
      isSelected ? 'border-accent/50 ring-1 ring-accent/20' : 'border-surface-border'
    }`;
  };

  const renderPlatformBadge = (user) => {
    const platform = (user.platform || 'android').toLowerCase();
    if (platform === 'ios') {
      return (
        <div className="mt-1">
          <span className="text-xs px-1.5 py-0.5 rounded bg-surface-raised text-content-secondary">iPhone</span>
        </div>
      );
    }
    return null;
  };

  const getIdentifierLabel = (user) => (user.platform === 'ios' ? 'UUID' : 'Android ID');

  if (loading && users.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-display font-semibold text-content">Connected Devices</h2>
        <div className="text-center py-12 text-content-muted">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-display font-semibold text-content">Connected Devices ({filteredUsers.length})</h2>

        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
          </div>

          {/* Status Filter - Only Primary Statuses */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content-secondary focus:outline-none focus:border-accent/50"
          >
            <option value="all">All Status</option>
            <option value="listening">Listening</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full text-center py-12 text-content-muted">
            <p className="text-sm">
              {searchTerm || statusFilter !== 'all'
                ? 'No devices match your search criteria'
                : 'No devices connected yet'
              }
            </p>
            {searchTerm && (
              <button
                className="mt-3 px-4 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content-secondary hover:border-accent/30 transition-colors"
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
              className={getDeviceCardClasses(user)}
              onClick={() => handleDeviceClick(user)}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-content truncate flex items-center gap-1.5">
                    <Smartphone size={14} className="shrink-0 text-content-secondary" /> {user.display_name || user.user_id}
                  </h3>
                  {user.android_id && (
                    <p className="text-xs text-content-secondary mt-0.5 truncate">{getIdentifierLabel(user)}: {user.android_id}</p>
                  )}
                  {renderPlatformBadge(user)}
                  <p className="text-xs text-content-secondary mt-1 flex items-center gap-1">
                    <MapPin size={11} className="shrink-0" /> {(user.location?.lat || 0).toFixed(4)}, {(user.location?.lng || 0).toFixed(4)}
                  </p>
                  {user.battery?.level !== null && user.battery?.level !== undefined && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${getBatteryColor(user.battery.level)}`}>
                      <Battery size={11} className="shrink-0" /> {user.battery.level}%
                      {user.battery.is_charging && <Zap size={10} className="text-warning" />}
                    </p>
                  )}
                </div>
                {getStatusBadge(user)}
              </div>

              <div className="border-t border-surface-border pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="text-content-secondary">
                      Recordings: <span className="text-content font-medium">{user.uploads?.length || 0}</span>
                    </span>
                    <span className="text-content-secondary">
                      Last Seen: {getLastSeenWithColor(user)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Recording Control Button - Role-based visibility */}
                  {shouldShowRecordingControl(user) && (
                    <RecordingControlButton
                      deviceId={user.android_id || user.user_id}
                      initialStatus={getRecordingState(user)}
                      onStatusChange={handleRecordingStatusChange}
                      disabled={loading}
                    />
                  )}

                  {shouldShowRecordingControl(user) && (
                    <FallbackButton
                      deviceId={user.android_id || user.user_id}
                      disabled={loading}
                    />
                  )}

                  {shouldShowLiveListen(user) && (
                    <DeviceCardListenControl
                      deviceId={user.android_id || user.user_id}
                      deviceName={user.display_name || user.user_id}
                      disabled={loading}
                    />
                  )}

                  {roleRestrictions.restrictedAccess && (
                    <div className="inline-flex items-center gap-1 text-xs text-accent">
                      <ShieldCheck size={14} /> Assigned Device
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
