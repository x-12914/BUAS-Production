import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Maximize } from 'lucide-react';
import { io } from 'socket.io-client';

const LiveVideoPlayer = ({ deviceId, onClose, cameraFacing = 'back' }) => {
    const videoRef = useRef(null);
    const mediaSourceRef = useRef(null);
    const sourceBufferRef = useRef(null);
    const queueRef = useRef([]);
    const socketRef = useRef(null);
    
    const [status, setStatus] = useState('connecting');
    const [error, setError] = useState(null);
    const containerRef = useRef(null);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    };

    useEffect(() => {
        let isComponentMounted = true;
        
        // 1. Initialize MediaSource
        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;
        
        if (videoRef.current) {
            videoRef.current.src = URL.createObjectURL(mediaSource);
        }

        const processQueue = () => {
            if (!isComponentMounted || !sourceBufferRef.current || !mediaSourceRef.current) return;
            if (mediaSourceRef.current.readyState !== 'open') return;
            
            const sourceBuffer = sourceBufferRef.current;
            
            if (sourceBuffer.updating || queueRef.current.length === 0) {
                return;
            }
            
            try {
                const chunk = queueRef.current.shift();
                sourceBuffer.appendBuffer(chunk);
            } catch (e) {
                console.error("Error appending buffer:", e);
                // Handle QuotaExceededError by removing old data if needed in future
            }
        };

        const connectSocket = () => {
            // In production, we route through Nginx (which handles port 80/443), so we don't hardcode 5000
            const isProd = process.env.NODE_ENV === 'production';
            const serverUrl = isProd 
                ? `${window.location.origin}/stream` 
                : `${window.location.protocol}//${window.location.hostname}:5000/stream`;
            
            const socket = io(serverUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling']
            });
            
            socketRef.current = socket;
            
            socket.on('connect', () => {
                console.log("Connected to video stream socket");
                socket.emit('join_video_stream', { device_id: deviceId });
            });
            
            socket.on('video_chunk', (data) => {
                if (!isComponentMounted) return;
                
                try {
                    // Decode base64 to Uint8Array
                    const binaryString = atob(data.chunk);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    queueRef.current.push(bytes);
                    processQueue();
                } catch (err) {
                    console.error("Error processing video chunk", err);
                }
            });
            
            socket.on('disconnect', () => {
                console.log("Disconnected from video stream socket");
                setStatus('connecting');
            });
        };

        // 2. Handle MediaSource Open
        const handleSourceOpen = () => {
            if (!isComponentMounted) return;
            
            try {
                // vp8 is standard for Android WebM
                const sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
                sourceBuffer.mode = 'sequence';
                sourceBufferRef.current = sourceBuffer;
                
                sourceBuffer.addEventListener('updateend', processQueue);
                
                setStatus('active');
                
                // 3. Connect to SocketIO now that MSE is ready
                connectSocket();
            } catch (e) {
                console.error("Error creating SourceBuffer:", e);
                setError("Browser doesn't support the required video codec.");
                setStatus('error');
            }
        };

        mediaSource.addEventListener('sourceopen', handleSourceOpen);

        return () => {
            isComponentMounted = false;
            
            if (socketRef.current) {
                socketRef.current.emit('leave_video_stream', { device_id: deviceId });
                socketRef.current.disconnect();
            }
            
            if (mediaSourceRef.current) {
                mediaSourceRef.current.removeEventListener('sourceopen', handleSourceOpen);
                if (mediaSourceRef.current.readyState === 'open' && sourceBufferRef.current) {
                    try {
                        mediaSourceRef.current.removeSourceBuffer(sourceBufferRef.current);
                    } catch (e) {
                        // ignore errors during cleanup
                    }
                }
            }
        };
    }, [deviceId]);

    return (
        <div className="fixed bottom-4 right-80 z-50 w-96 bg-surface-overlay border border-surface-border rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border z-10 relative bg-surface-overlay">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-warning'}`}></span>
                    <span className="text-sm font-medium text-content">Live Camera Feed</span>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        className="p-1 rounded hover:bg-surface-hover text-content-muted transition-colors" 
                        onClick={toggleFullscreen} 
                        title="Fullscreen"
                    >
                        <Maximize size={16} />
                    </button>
                    <button 
                        className="p-1 rounded hover:bg-surface-hover text-content-muted transition-colors" 
                        onClick={onClose} 
                        title="Close Video"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Video Container */}
            <div ref={containerRef} className="relative bg-black w-full aspect-video flex items-center justify-center overflow-hidden">
                {status === 'connecting' && !error && (
                    <div className="absolute flex flex-col items-center justify-center text-content-muted">
                        <Camera className="animate-pulse mb-2 opacity-50" size={32} />
                        <span className="text-xs">Buffering stream...</span>
                    </div>
                )}
                
                {error && (
                    <div className="absolute text-danger text-xs text-center px-4">
                        {error}
                    </div>
                )}

                <video 
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    style={{
                        transform: cameraFacing === 'front' ? 'rotate(90deg) scaleX(-1)' : 'rotate(90deg)',
                        transformOrigin: 'center center',
                        width: '100%',
                        height: '100%'
                    }}
                    autoPlay
                    playsInline
                    muted
                    onPlaying={() => setStatus('active')}
                    onError={(e) => {
                        console.error("Video error:", e);
                        setStatus('error');
                        setError("Stream interrupted. Please restart the camera.");
                    }}
                />
            </div>
            
            {/* Footer */}
            <div className="px-4 py-2 bg-surface border-t border-surface-border flex justify-between items-center text-xs text-content-muted">
                <span>Target: {deviceId}</span>
                <span className="text-indigo-400 font-medium">LIVE</span>
            </div>
        </div>
    );
};

export default LiveVideoPlayer;
