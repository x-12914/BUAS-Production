import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import { Hourglass, Square, CircleDashed, AlertCircle, Mic, AlertTriangle } from 'lucide-react';

const RecordingControlButton = ({ deviceId, initialStatus, onStatusChange, disabled = false }) => {
  const [status, setStatus] = useState(initialStatus || 'idle');
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  // Duration timer for recording state
  useEffect(() => {
    let interval = null;

    if (status === 'recording') {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status]);

  // Update status when prop changes
  useEffect(() => {
    // Don't override status while a command is being processed
    // This prevents Dashboard polling from resetting the button during transitions
    if (loading) return;

    if (initialStatus && initialStatus !== status) {
      setStatus(initialStatus);

      // If transitioning to recording, fetch actual duration
      if (initialStatus === 'recording') {
        fetchRecordingStatus();
      }
    }
  }, [initialStatus, loading]);

  // Fetch recording status on mount if already recording
  useEffect(() => {
    if (initialStatus === 'recording') {
      fetchRecordingStatus();
    }
  }, []); // Run once on mount

  const fetchRecordingStatus = async () => {
    try {
      const response = await ApiService.getRecordingStatus(deviceId);
      const recordingStatus = response.recording_status;

      setStatus(recordingStatus.recording_state);

      if (recordingStatus.recording_state === 'recording' && response.duration_seconds) {
        setDuration(response.duration_seconds);
      }

      if (onStatusChange) {
        onStatusChange(deviceId, recordingStatus);
      }

    } catch (err) {
      console.error('Failed to fetch recording status:', err);
      setError('Failed to get status');
    }
  };

  const handleCommand = async (command) => {
    if (loading || disabled) return;

    setLoading(true);
    setError(null);

    try {
      // Set transitioning state immediately
      const transitionState = command === 'start' ? 'starting' : 'stopping';
      setStatus(transitionState);

      const response = await ApiService.sendRecordingCommand(deviceId, command);

      if (response.status === 'success') {
        // Poll recording status every 1 second for up to 10 seconds
        let attempts = 0;
        const maxAttempts = 10; // 10 seconds total

        const pollStatus = async () => {
          attempts++;

          try {
            const statusResponse = await ApiService.getRecordingStatus(deviceId);
            const recordingStatus = statusResponse.recording_status;
            const currentState = recordingStatus.recording_state;

            // Check if state has changed to expected final state
            const expectedState = command === 'start' ? 'recording' : 'idle';

            if (currentState === expectedState) {
              // Success! Update to final state
              setStatus(currentState);
              if (currentState === 'recording' && statusResponse.duration_seconds) {
                setDuration(statusResponse.duration_seconds);
              }
              if (onStatusChange) {
                onStatusChange(deviceId, recordingStatus);
              }
              setLoading(false);
              return; // Stop polling
            }

            // State hasn't changed yet, continue polling if under max attempts
            if (attempts < maxAttempts) {
              setTimeout(pollStatus, 1000); // Check again in 1 second
            } else {
              // Timeout - force check one final time
              await fetchRecordingStatus();
              setLoading(false);
            }

          } catch (pollError) {
            console.error('Error polling status:', pollError);
            if (attempts < maxAttempts) {
              setTimeout(pollStatus, 1000); // Retry in 1 second
            } else {
              setLoading(false);
            }
          }
        };

        // Start polling after brief initial delay
        setTimeout(pollStatus, 1000);
      }

    } catch (err) {
      console.error(`Failed to ${command} recording:`, err);
      setError(`Failed to ${command} recording`);

      // Revert to previous state on error
      setStatus(command === 'start' ? 'idle' : 'recording');
      setLoading(false);
    }
  };

  const handleStart = (e) => {
    e?.stopPropagation();
    handleCommand('start');
  };

  const handleStop = (e) => {
    e?.stopPropagation();
    handleCommand('stop');
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getButtonConfig = () => {
    switch (status) {
      case 'starting':
        return {
          text: 'Starting...',
          className: 'bg-warning/10 text-warning border border-warning/20',
          icon: <Hourglass size={14} className="mr-1.5" />,
          onClick: null,
          disabled: true
        };

      case 'recording':
        return {
          text: `Stop Recording (${formatDuration(duration)})`,
          className: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20',
          icon: <Square size={14} fill="currentColor" className="mr-1.5" />,
          onClick: handleStop,
          disabled: false
        };

      case 'stopping':
        return {
          text: 'Stopping...',
          className: 'bg-warning/10 text-warning border border-warning/20',
          icon: <Hourglass size={14} className="mr-1.5" />,
          onClick: null,
          disabled: true
        };

      case 'offline':
        return {
          text: 'Device Offline',
          className: 'bg-surface-raised text-content-muted border border-surface-border',
          icon: <CircleDashed size={14} className="mr-1.5" />,
          onClick: null,
          disabled: true
        };

      case 'error':
        return {
          text: 'Error - Try Again',
          className: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20',
          icon: <AlertCircle size={14} className="mr-1.5" />,
          onClick: handleStart,
          disabled: false
        };

      default: // idle
        return {
          text: 'Start Recording',
          className: 'bg-success/10 hover:bg-success/20 text-success border border-success/20',
          icon: <Mic size={14} className="mr-1.5" />,
          onClick: handleStart,
          disabled: false
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${buttonConfig.className} ${loading ? 'animate-pulse' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          buttonConfig.onClick?.(e);
        }}
        disabled={buttonConfig.disabled || loading || disabled}
        title={error || `Current status: ${status}`}
      >
        {buttonConfig.icon}
        <span>{buttonConfig.text}</span>
        {loading && <span className="ml-1.5 w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin"></span>}
      </button>

      {error && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-danger/5 border border-danger/10 rounded text-xs text-danger">
          <AlertTriangle size={12} />
          <span>{error}</span>
          <button
            className="ml-1 p-0.5 rounded hover:bg-danger/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
            }}
            title="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default RecordingControlButton;
