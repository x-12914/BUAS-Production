import React from 'react';

const StatusBar = ({ data, connectionStatus, lastUpdated, error }) => {
  const getStatusDotClass = (status) => {
    switch (status) {
      case 'connected': return 'bg-success';
      case 'connecting': return 'bg-warning';
      case 'error': return 'bg-danger';
      default: return 'bg-content-muted';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      default: return 'Unknown';
    }
  };

  return (
    <div className="bg-surface-raised border-b border-surface-border px-6 py-2">
      <div className="max-w-[1600px] mx-auto flex items-center gap-6 text-xs">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusDotClass(connectionStatus)}`}></span>
          <span className="text-content-secondary">{getStatusText(connectionStatus)}</span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 text-danger">
            <span className="w-2 h-2 rounded-full bg-danger"></span>
            <span>Error: {error}</span>
          </div>
        )}

        {/* Stats */}
        {data && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-content-muted">Connected Users:</span>
              <span className="text-content-secondary font-medium">{data.total_users || 0}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-content-muted">Total Recordings:</span>
              <span className="text-content-secondary font-medium">{data.stats?.total_recordings || 0}</span>
            </div>
          </>
        )}

        {/* Last Updated */}
        {lastUpdated && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-content-muted">Last Updated:</span>
            <span className="text-content-secondary font-medium">{lastUpdated.toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
