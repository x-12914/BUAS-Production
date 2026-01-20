import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import './RecordingControlButton.css';

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
          className: 'recording-btn starting',
          icon: '⏳',
          onClick: null,
          disabled: true
        };
      
      case 'recording':
        return {
          text: `Stop Recording (${formatDuration(duration)})`,
          className: 'recording-btn recording',
          icon: '⏹️',
          onClick: handleStop,
          disabled: false
        };
      
      case 'stopping':
        return {
          text: 'Stopping...',
          className: 'recording-btn stopping',
          icon: '⏳',
          onClick: null,
          disabled: true
        };
      
      case 'offline':
        return {
          text: 'Device Offline',
          className: 'recording-btn offline',
          icon: '🔴',
          onClick: null,
          disabled: true
        };
      
      case 'error':
        return {
          text: 'Error - Try Again',
          className: 'recording-btn error',
          icon: '❌',
          onClick: handleStart,
          disabled: false
        };
      
      default: // idle
        return {
          text: 'Start Recording',
          className: 'recording-btn idle',
          icon: '🎙️',
          onClick: handleStart,
          disabled: false
        };
    }
  };

  const buttonConfig = getButtonConfig();

  return (
    <div className="recording-control-container">
      <button
        className={`${buttonConfig.className} ${loading ? 'loading' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          buttonConfig.onClick?.(e);
        }}
        disabled={buttonConfig.disabled || loading || disabled}
        title={error || `Current status: ${status}`}
      >
        <span className="recording-icon">{buttonConfig.icon}</span>
        <span className="recording-text">{buttonConfig.text}</span>
        {loading && <div className="button-spinner"></div>}
      </button>
      
      {error && (
        <div className="recording-error">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button 
            className="error-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setError(null);
            }}
            title="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default RecordingControlButton;
