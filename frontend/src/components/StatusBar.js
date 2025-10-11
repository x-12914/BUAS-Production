import React from 'react';
import './StatusBar.css';

const StatusBar = ({ data, connectionStatus, lastUpdated, error }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return '🟢';
      case 'connecting': return '🟡';
      case 'error': return '🔴';
      default: return '⚫';
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
    <div className="status-bar">
      <div className="status-bar-content">
        {/* Connection Status */}
        <div className="status-item">
          <span className="status-icon">{getStatusIcon(connectionStatus)}</span>
          <span className="status-text">{getStatusText(connectionStatus)}</span>
        </div>

        {/* Error Display */}
        {error && (
          <div className="status-item error">
            <span className="status-icon">⚠️</span>
            <span className="status-text">Error: {error}</span>
          </div>
        )}

        {/* Stats */}
        {data && (
          <>
            <div className="status-item">
              <span className="status-label">Users:</span>
              <span className="status-value">{data.total_users || 0}</span>
            </div>
            
            <div className="status-item">
              <span className="status-label">Active Sessions:</span>
              <span className="status-value">{data.active_sessions_count || 0}</span>
            </div>
            
            <div className="status-item">
              <span className="status-label">Total Recordings:</span>
              <span className="status-value">{data.stats?.total_recordings || 0}</span>
            </div>
          </>
        )}

        {/* Last Updated */}
        {lastUpdated && (
          <div className="status-item">
            <span className="status-label">Last Updated:</span>
            <span className="status-value">{lastUpdated.toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StatusBar;
