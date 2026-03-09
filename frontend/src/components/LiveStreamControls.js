import React, { useState } from 'react';
import LiveAudioPlayer from './LiveAudioPlayer';
import { Headphones, Radio } from 'lucide-react';
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
            <span className="button-icon"><Headphones size={18} style={{verticalAlign: 'text-bottom'}}/></span>
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
          <span className="live-badge"><Radio size={12} style={{marginRight: '4px', verticalAlign: 'middle', animation: 'pulse 2s infinite'}}/> LIVE</span>
          <span className="live-text">Streaming active</span>
        </div>
      )}
    </div>
  );
};

export default LiveStreamControls;

