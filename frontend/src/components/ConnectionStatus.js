import React from 'react';
import { Activity, CircleDashed, AlertCircle, HelpCircle, RefreshCw } from 'lucide-react';
import './ConnectionStatus.css';

const ConnectionStatus = ({ status, lastUpdated, isPolling }) => {
  const getStatusDetails = (status) => {
    switch (status) {
      case 'connected':
        return {
          icon: <Activity size={24} />,
          title: 'Connected',
          description: 'Real-time updates active',
          className: 'connected'
        };
      case 'connecting':
        return {
          icon: <CircleDashed size={24} />,
          title: 'Connecting',
          description: 'Establishing connection...',
          className: 'connecting'
        };
      case 'error':
        return {
          icon: <AlertCircle size={24} />,
          title: 'Connection Error',
          description: 'Unable to reach server',
          className: 'error'
        };
      default:
        return {
          icon: <HelpCircle size={24} />,
          title: 'Unknown',
          description: 'Status unknown',
          className: 'unknown'
        };
    }
  };

  const statusDetails = getStatusDetails(status);

  return (
    <div className={`connection-status ${statusDetails.className}`}>
      <div className="connection-header">
        <div className="connection-indicator">
          <span className="connection-icon">{statusDetails.icon}</span>
          <div className="connection-info">
            <h3 className="connection-title">{statusDetails.title}</h3>
            <p className="connection-description">{statusDetails.description}</p>
          </div>
        </div>
        
        <div className="connection-details">
          {lastUpdated && (
            <div className="last-updated">
              <span className="label">Last Updated:</span>
              <span className="value">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
          
          <div className="polling-status">
            <span className="label">Auto-refresh:</span>
            <span className={`value ${isPolling ? 'active' : 'inactive'}`}>
              {isPolling ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>
      
      {status === 'error' && (
        <div className="error-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} style={{marginRight: '6px', verticalAlign: 'middle'}} /> Retry Connection
          </button>
        </div>
      )}
    </div>
  );
};

export default ConnectionStatus;
