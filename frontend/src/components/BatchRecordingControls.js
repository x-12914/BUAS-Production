import React from 'react';
import './BatchRecordingControls.css';

const BatchRecordingControls = ({ 
  devices, 
  disabled = false, 
  operatorMode = false, 
  superUserMode = false 
}) => {
  // Calculate device counts for display
  const getControlCounts = () => {
    if (!devices || devices.length === 0) {
      return { total: 0, controllable: 0, recording: 0, idle: 0 };
    }

    const controllable = devices.filter(device => {
      const recordingStatus = device.recording_status;
      return recordingStatus && recordingStatus.can_control;
    });

    const recording = devices.filter(device => {
      const recordingStatus = device.recording_status;
      return recordingStatus && recordingStatus.recording_state === 'recording';
    });

    const idle = devices.filter(device => {
      const recordingStatus = device.recording_status;
      return recordingStatus && recordingStatus.recording_state === 'idle';
    });

    return {
      total: devices.length,
      controllable: controllable.length,
      recording: recording.length,
      idle: idle.length
    };
  };

  const counts = getControlCounts();

  return (
    <div className="batch-recording-controls">
      <div className="batch-controls-header">
        <h3>
          🎮 Device Status Overview
        </h3>
        <div className="device-counts">
          <span className="count-item">
            <span className="count-label">Total:</span>
            <span className="count-value">{counts.total}</span>
          </span>
          <span className="count-item">
            <span className="count-label">Controllable:</span>
            <span className="count-value">{counts.controllable}</span>
          </span>
          <span className="count-item recording">
            <span className="count-label">Recording:</span>
            <span className="count-value">{counts.recording}</span>
          </span>
          <span className="count-item idle">
            <span className="count-label">Idle:</span>
            <span className="count-value">{counts.idle}</span>
          </span>
        </div>
      </div>

      {/* Role-based information */}
    </div>
  );
};

export default BatchRecordingControls;
