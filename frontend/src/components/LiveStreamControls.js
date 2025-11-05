import React, { useState } from 'react';
import LiveAudioPlayer from './LiveAudioPlayer';
import './LiveStreamControls.css';

const LiveStreamControls = ({ deviceId, deviceInfo }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  const handleStartListening = () => {
    setIsStreaming(true);
    setShowPlayer(true);
  };

  const handleStopListening = () => {
    setIsStreaming(false);
    setShowPlayer(false);
  };

  return (
    <div className="live-stream-controls">
      {!showPlayer ? (
        <div className="stream-trigger">
          <button 
            className="listen-live-button"
            onClick={handleStartListening}
            title="Start listening to live audio from this device"
          >
            <span className="button-icon">🎧</span>
            <span className="button-text">Listen Live</span>
          </button>
          <p className="stream-info-text">
            Real-time audio monitoring (~300ms latency)
          </p>
        </div>
      ) : (
        <LiveAudioPlayer 
          deviceId={deviceId} 
          onClose={handleStopListening}
        />
      )}
      
      {isStreaming && (
        <div className="streaming-indicator">
          <span className="live-badge">🔴 LIVE</span>
          <span className="live-text">Streaming active</span>
        </div>
      )}
    </div>
  );
};

export default LiveStreamControls;

