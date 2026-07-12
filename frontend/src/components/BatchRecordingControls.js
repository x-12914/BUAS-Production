import React from 'react';

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
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-medium text-content mb-3">
          Device Status Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-content">{counts.total}</div>
            <div className="text-xs text-content-muted">Total</div>
          </div>
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-content">{counts.controllable}</div>
            <div className="text-xs text-content-muted">Controllable</div>
          </div>
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-success">{counts.recording}</div>
            <div className="text-xs text-content-muted">Recording</div>
          </div>
          <div className="bg-surface-overlay border border-surface-border rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-content-secondary">{counts.idle}</div>
            <div className="text-xs text-content-muted">Idle</div>
          </div>
        </div>
      </div>

      {/* Role-based information */}
    </div>
  );
};

export default BatchRecordingControls;
