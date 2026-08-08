import React, { useState, useRef, useEffect } from 'react';
import { X, Camera } from 'lucide-react';
import apiService from '../services/api';

const LiveVideoPlayer = ({ deviceId, onClose }) => {
    const videoRef = useRef(null);
    const [status, setStatus] = useState('connecting');
    const [error, setError] = useState(null);

    useEffect(() => {
        let streamUrl = null;

        const startStream = () => {
            // Point the video source to the backend endpoint serving the raw webm chunk stream
            streamUrl = `/api/audit/livestream/watch/${deviceId}`;
            if (videoRef.current) {
                videoRef.current.src = streamUrl;
                
                // Attempt to play automatically
                videoRef.current.play().then(() => {
                    setStatus('active');
                }).catch(err => {
                    console.error("Auto-play blocked or failed", err);
                    setStatus('error');
                    setError("Autoplay failed. Please click play.");
                });
            }
        };

        startStream();

        return () => {
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
        };
    }, [deviceId]);

    return (
        <div className="fixed bottom-4 right-80 z-50 w-96 bg-surface-overlay border border-surface-border rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-warning'}`}></span>
                    <span className="text-sm font-medium text-content">Live Camera Feed</span>
                </div>
                <button 
                    className="p-1 rounded hover:bg-surface-hover text-content-muted transition-colors" 
                    onClick={onClose} 
                    title="Close Video"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Video Container */}
            <div className="relative bg-black w-full aspect-video flex items-center justify-center">
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
                    controls
                    autoPlay
                    muted={false}
                    onPlaying={() => setStatus('active')}
                    onError={(e) => {
                        console.error("Video error:", e);
                        setStatus('error');
                        setError("Stream interrupted or not started yet.");
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
