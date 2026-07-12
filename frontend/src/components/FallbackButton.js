import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import { Flame, ShieldAlert } from 'lucide-react';

const FallbackButton = ({ deviceId, disabled = false }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, active, transitioning
  const [error, setError] = useState(null);

  // Sync with server status periodically
  useEffect(() => {
    let pollInterval = null;

    const fetchStatus = async () => {
      try {
        const response = await ApiService.getRecordingStatus(deviceId);
        const recordingStatus = response.recording_status;

        // Update status based on server reported fallback state
        if (recordingStatus.is_fallback_active) {
          setStatus('active');
        } else if (status !== 'transitioning') {
          setStatus('idle');
        }
      } catch (err) {
        console.error('Failed to sync fallback status:', err);
      }
    };

    // Initial fetch
    fetchStatus();

    // Poll every 5 seconds to keep synced across dashboard instances
    pollInterval = setInterval(fetchStatus, 5000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [deviceId, status]);

  const handleFallback = async (e) => {
    e?.stopPropagation();
    if (loading || disabled) return;

    setLoading(true);
    setError(null);
    setStatus('transitioning');

    try {
      const response = await ApiService.sendRecordingCommand(deviceId, 'fallback');
      if (response.status === 'success') {
        setStatus('active');
      }
    } catch (err) {
      console.error('Failed to trigger fallback:', err);
      setError('Failed');
      setStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const isActive = status === 'active';
  const isDisabled = loading || disabled || isActive;

  return (
    <div className="ml-2.5">
      <button
        className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          isActive
            ? 'bg-danger/10 text-danger border border-danger/20'
            : 'bg-danger/20 hover:bg-danger/30 text-danger border border-danger/30'
        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleFallback}
        disabled={isDisabled}
        title={isActive ? "Hot Mic is active" : "Trigger Hot Mic Fallback"}
      >
        {isActive ? <Flame size={14} className="mr-1.5" /> : <ShieldAlert size={14} className="mr-1.5" />}
        <span>
          {isActive ? 'Hot Mic Active' : (loading ? 'Triggering...' : 'Hot Mic')}
        </span>
        {loading && <span className="ml-1.5 w-3 h-3 border-2 border-danger/30 border-t-danger rounded-full animate-spin"></span>}
      </button>
    </div>
  );
};

export default FallbackButton;
