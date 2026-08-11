import React, { useState } from 'react';
import LiveAudioPlayer from './LiveAudioPlayer';
import LiveVideoPlayer from './LiveVideoPlayer';
import LiveScreenPlayer from './LiveScreenPlayer';
import { Headphones, Radio, Video, VideoOff, Monitor, MonitorOff } from 'lucide-react';
import apiService from '../services/api';

const LiveStreamControls = ({ deviceId, deviceInfo }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isCameraStreaming, setIsCameraStreaming] = useState(false);
  const [cameraCommandStatus, setCameraCommandStatus] = useState(null);
  const [cameraFacing, setCameraFacing] = useState('back');
  
  const [isScreenStreaming, setIsScreenStreaming] = useState(false);
  const [screenCommandStatus, setScreenCommandStatus] = useState(null);

  const handleStartListening = () => {
    setIsStreaming(true);
    setShowPlayer(true);
  };

  const handleStopListening = () => {
    setIsStreaming(false);
    setShowPlayer(false);
  };

  const handleStartCamera = async () => {
    try {
        setCameraCommandStatus('sending start...');
        const command = cameraFacing === 'front' ? 'start_camera_front' : 'start_camera';
        const response = await apiService.request(`/api/device/${deviceId}/camera/command`, {
            method: 'POST',
            body: JSON.stringify({ command })
        });
        if (response.status === 'success') {
            setIsCameraStreaming(true);
            setCameraCommandStatus('recording active');
        }
    } catch (err) {
        console.error("Failed to start camera", err);
        setCameraCommandStatus('failed');
    }
  };

  const handleStopCamera = async () => {
      try {
          setCameraCommandStatus('sending stop...');
          const response = await apiService.request(`/api/device/${deviceId}/camera/command`, {
              method: 'POST',
              body: JSON.stringify({ command: 'stop_camera' })
          });
          if (response.status === 'success') {
              setIsCameraStreaming(false);
              setCameraCommandStatus(null);
          }
      } catch (err) {
          console.error("Failed to stop camera", err);
          setCameraCommandStatus('failed');
      }
  };

  const handleStartScreen = async () => {
    try {
        setScreenCommandStatus('sending start...');
        const response = await apiService.request(`/api/device/${deviceId}/camera/command`, {
            method: 'POST',
            body: JSON.stringify({ command: 'start_screen' })
        });
        if (response.status === 'success') {
            setIsScreenStreaming(true);
            setScreenCommandStatus('recording active');
        }
    } catch (err) {
        console.error("Failed to start screen share", err);
        setScreenCommandStatus('failed');
    }
  };

  const handleStopScreen = async () => {
      try {
          setScreenCommandStatus('sending stop...');
          const response = await apiService.request(`/api/device/${deviceId}/camera/command`, {
              method: 'POST',
              body: JSON.stringify({ command: 'stop_screen' })
          });
          if (response.status === 'success') {
              setIsScreenStreaming(false);
              setScreenCommandStatus(null);
          }
      } catch (err) {
          console.error("Failed to stop screen share", err);
          setScreenCommandStatus('failed');
      }
  };

  return (
    <div>
      {!showPlayer ? (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
                onClick={handleStartListening}
                title="Start listening to live audio from this device"
              >
                <Headphones size={14} />
                <span>Listen Live</span>
              </button>
              <p className="text-xs text-content-muted">
                Real-time audio monitoring (~300ms latency)
              </p>
            </div>
            
            <div className="flex items-center gap-3">
                {!isCameraStreaming ? (
                    <div className="flex items-center gap-2">
                        <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                            onClick={handleStartCamera}
                            title="Start live video stream from this device"
                        >
                            <Video size={14} />
                            <span>Watch Live</span>
                        </button>
                        <select
                            value={cameraFacing}
                            onChange={(e) => setCameraFacing(e.target.value)}
                            className="bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 hover:bg-indigo-500/20 text-xs font-medium rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        >
                            <option value="back" className="bg-[#121212] text-indigo-500">Back Camera</option>
                            <option value="front" className="bg-[#121212] text-indigo-500">Front Camera</option>
                        </select>
                    </div>
                ) : (
                    <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors"
                        onClick={handleStopCamera}
                        title="Stop live video stream"
                    >
                        <VideoOff size={14} />
                        <span>Stop Watch</span>
                    </button>
                )}
                 {cameraCommandStatus && (
                    <p className="text-xs text-indigo-400/80 italic">
                        {cameraCommandStatus}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-3">
                {!isScreenStreaming ? (
                    <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-500/10 text-teal-500 border border-teal-500/20 hover:bg-teal-500/20 transition-colors"
                        onClick={handleStartScreen}
                        title="Start live screen share from this device"
                    >
                        <Monitor size={14} />
                        <span>Share Screen</span>
                    </button>
                ) : (
                    <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition-colors"
                        onClick={handleStopScreen}
                        title="Stop live screen share"
                    >
                        <MonitorOff size={14} />
                        <span>Stop Screen</span>
                    </button>
                )}
                {screenCommandStatus && (
                    <p className="text-xs text-teal-400/80 italic">
                        {screenCommandStatus}
                    </p>
                )}
            </div>
        </div>
      ) : (
        <LiveAudioPlayer
          deviceId={deviceId}
          onClose={handleStopListening}
        />
      )}

      {isCameraStreaming && (
          <LiveVideoPlayer
              deviceId={deviceId}
              onClose={handleStopCamera}
              cameraFacing={cameraFacing}
          />
      )}

      {isScreenStreaming && (
          <LiveScreenPlayer
              deviceId={deviceId}
              onClose={handleStopScreen}
          />
      )}

      {(isStreaming || isCameraStreaming || isScreenStreaming) && (
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-danger/10 text-danger">
            <Radio size={12} className="animate-pulse" /> LIVE
          </span>
          <span className="text-xs text-content-muted">
             {isStreaming && isCameraStreaming && isScreenStreaming ? "Audio, Video & Screen streaming active" : 
              (isStreaming && isCameraStreaming) ? "Audio & Video streaming active" : 
              (isStreaming && isScreenStreaming) ? "Audio & Screen streaming active" : 
              (isCameraStreaming && isScreenStreaming) ? "Video & Screen streaming active" : 
              isStreaming ? "Audio streaming active" : 
              isScreenStreaming ? "Screen streaming active" : "Video streaming active"}
          </span>
        </div>
      )}
    </div>
  );
};

export default LiveStreamControls;
