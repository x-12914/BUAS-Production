import React from 'react';
import { CircleDashed, AlertCircle, RefreshCw } from 'lucide-react';

const ConnectionStatus = ({ status, lastUpdated, isPolling }) => {
  // Only show when NOT connected
  if (status === 'connected') {
    return null;
  }

  if (status === 'connecting') {
    return (
      <div className="bg-accent/10 border border-accent/20 rounded-lg p-3 flex items-center gap-2 text-sm text-accent mb-4">
        <CircleDashed size={16} className="animate-spin" />
        <span>Connecting to server...</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-danger/10 border border-danger/20 rounded-lg p-3 flex items-center gap-2 text-sm text-danger mb-4">
        <AlertCircle size={16} />
        <span>Connection error - unable to reach server</span>
        <button
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs border border-danger/30 hover:bg-danger/20 transition-colors"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  return null;
};

export default ConnectionStatus;
