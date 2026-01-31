import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import './RecordingControlButton.css'; // Reuse styles

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
        // Stay active for a while or until page refresh
        // This is a manual trigger, the app just "stays" in this mode once triggered
      }
    } catch (err) {
      console.error('Failed to trigger fallback:', err);
      setError('Failed');
      setStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="recording-control-container" style={{ marginLeft: '10px' }}>
      <button
        className={`recording-btn ${status === 'active' ? 'recording' : 'idle'} ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleFallback}
        disabled={loading || disabled || status === 'active'}
        title={status === 'active' ? "Hot Mic is active" : "Trigger Hot Mic Fallback"}
        style={{
          backgroundColor: status === 'active' ? '#dc3545' : '#721c24',
          borderColor: status === 'active' ? '#b21f2d' : '#491217',
          color: 'white'
        }}
      >
        <span className="recording-icon">{status === 'active' ? '🔥' : '🛡️'}</span>
        <span className="recording-text">
          {status === 'active' ? 'Hot Mic Active' : (loading ? 'Triggering...' : 'Hot Mic')}
        </span>
        {loading && <div className="button-spinner"></div>}
      </button>
    </div>
  );
};

export default FallbackButton;
