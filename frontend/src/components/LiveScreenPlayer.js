import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Monitor, Maximize, AlertCircle } from 'lucide-react';
import { io } from 'socket.io-client';

const LiveScreenPlayer = ({ deviceId, onClose }) => {
    const videoRef = useRef(null);
    const socketRef = useRef(null);
    const containerRef = useRef(null);

    // MSE state
    const mediaSourceRef = useRef(null);
    const sourceBufferRef = useRef(null);
    const chunkQueueRef = useRef([]);      // pending Uint8Array chunks
    const isAppendingRef = useRef(false);  // prevents concurrent appendBuffer calls
    const isMountedRef = useRef(true);

    const [status, setStatus] = useState('connecting'); // 'connecting' | 'buffering' | 'active' | 'error'
    const [error, setError] = useState(null);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    };

    // ── Core MSE append logic ─────────────────────────────────────────────
    const drainQueue = useCallback(() => {
        if (!isMountedRef.current) return;
        const sb = sourceBufferRef.current;
        const ms = mediaSourceRef.current;
        if (!sb || !ms) return;
        if (ms.readyState !== 'open') return;
        if (sb.updating) return;
        if (isAppendingRef.current) return;
        if (chunkQueueRef.current.length === 0) return;

        const chunk = chunkQueueRef.current.shift();
        isAppendingRef.current = true;
        try {
            sb.appendBuffer(chunk);
        } catch (e) {
            isAppendingRef.current = false;
            if (e.name === 'QuotaExceededError') {
                // Evict old data (keep last 10 seconds worth)
                try {
                    const buffered = sb.buffered;
                    if (buffered.length > 0) {
                        const end = buffered.end(buffered.length - 1);
                        sb.remove(0, Math.max(0, end - 10));
                    }
                } catch (_) {}
            } else {
                console.error('[ScreenPlayer] appendBuffer error:', e);
            }
        }
    }, []);

    const enqueueChunk = useCallback((bytes) => {
        chunkQueueRef.current.push(bytes);
        drainQueue();
    }, [drainQueue]);

    // ── Socket + MSE lifecycle ────────────────────────────────────────────
    useEffect(() => {
        isMountedRef.current = true;

        // 1. Set up MSE
        if (!window.MediaSource) {
            setError('Your browser does not support MediaSource Extensions.');
            setStatus('error');
            return;
        }

        const ms = new MediaSource();
        mediaSourceRef.current = ms;
        const objectUrl = URL.createObjectURL(ms);

        if (videoRef.current) {
            videoRef.current.src = objectUrl;
        }

        const onSourceOpen = () => {
            if (!isMountedRef.current) return;
            URL.revokeObjectURL(objectUrl); // free memory once attached

            // VP8 inside WebM — matches what MediaRecorder produces on Android
            const mimeType = 'video/webm; codecs="vp8"';
            if (!MediaSource.isTypeSupported(mimeType)) {
                setError('Browser does not support VP8/WebM streaming.');
                setStatus('error');
                return;
            }

            try {
                const sb = ms.addSourceBuffer(mimeType);
                sb.mode = 'sequence';  // handles live/streaming data properly
                sourceBufferRef.current = sb;

                sb.addEventListener('updateend', () => {
                    isAppendingRef.current = false;
                    drainQueue();
                });

                sb.addEventListener('error', (e) => {
                    console.error('[ScreenPlayer] SourceBuffer error:', e);
                    isAppendingRef.current = false;
                });

                setStatus('buffering');

                // 2. Connect socket only after MSE is ready to receive data
                connectSocket();
            } catch (e) {
                console.error('[ScreenPlayer] Failed to add SourceBuffer:', e);
                setError('Failed to initialize video decoder. Try refreshing.');
                setStatus('error');
            }
        };

        ms.addEventListener('sourceopen', onSourceOpen);

        // 3. Socket connection
        const connectSocket = () => {
            const isProd = process.env.NODE_ENV === 'production';
            const serverUrl = isProd
                ? `${window.location.origin}/stream`
                : `${window.location.protocol}//${window.location.hostname}:5000/stream`;

            const socket = io(serverUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
            });

            socketRef.current = socket;

            socket.on('connect', () => {
                console.log('[ScreenPlayer] Socket connected — joining stream room');
                socket.emit('join_screen_stream', { device_id: deviceId });
            });

            socket.on('screen_chunk', (data) => {
                if (!isMountedRef.current) return;
                try {
                    // Decode base64 → Uint8Array
                    const binary = atob(data.chunk);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    enqueueChunk(bytes);
                } catch (e) {
                    console.error('[ScreenPlayer] Chunk decode error:', e);
                }
            });

            socket.on('connect_error', (err) => {
                console.error('[ScreenPlayer] Socket error:', err);
            });

            socket.on('disconnect', () => {
                console.log('[ScreenPlayer] Socket disconnected');
                if (isMountedRef.current) setStatus('buffering');
            });
        };

        // ── Cleanup ───────────────────────────────────────────────────────
        return () => {
            isMountedRef.current = false;

            if (socketRef.current) {
                socketRef.current.emit('leave_screen_stream', { device_id: deviceId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            chunkQueueRef.current = [];
            isAppendingRef.current = false;

            const sbToRemove = sourceBufferRef.current;
            const msToClose = mediaSourceRef.current;
            sourceBufferRef.current = null;
            mediaSourceRef.current = null;

            if (msToClose) {
                msToClose.removeEventListener('sourceopen', onSourceOpen);
                try {
                    if (msToClose.readyState === 'open') {
                        if (sbToRemove) msToClose.removeSourceBuffer(sbToRemove);
                        msToClose.endOfStream();
                    }
                } catch (_) {}
            }

            if (videoRef.current) {
                videoRef.current.src = '';
            }
        };
    }, [deviceId, drainQueue, enqueueChunk]);

    // ── Render ────────────────────────────────────────────────────────────
    const statusDot = status === 'active'
        ? 'bg-green-400 animate-pulse'
        : status === 'error'
        ? 'bg-red-500'
        : 'bg-yellow-400 animate-pulse';

    const statusLabel = status === 'active'
        ? 'Streaming'
        : status === 'buffering'
        ? 'Buffering…'
        : status === 'error'
        ? 'Error'
        : 'Connecting…';

    return (
        <div className="fixed bottom-4 right-80 z-50 w-[420px] bg-surface-overlay border border-surface-border rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-overlay">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                    <span className="text-sm font-medium text-content">Live Screen</span>
                    <span className="text-xs text-content-muted">— {statusLabel}</span>
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
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Video area */}
            <div
                ref={containerRef}
                className="relative bg-black w-full aspect-video flex items-center justify-center overflow-hidden"
            >
                {/* Overlay — shown until video actually plays */}
                {status !== 'active' && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-content-muted z-10 pointer-events-none">
                        <Monitor className="opacity-40 animate-pulse" size={36} />
                        <span className="text-xs">{statusLabel}</span>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center z-10">
                        <AlertCircle size={28} className="text-red-400" />
                        <span className="text-xs text-red-400">{error}</span>
                    </div>
                )}

                <video
                    ref={videoRef}
                    className="w-full h-full object-contain"
                    autoPlay
                    playsInline
                    muted
                    onPlaying={() => {
                        if (isMountedRef.current) setStatus('active');
                    }}
                    onWaiting={() => {
                        if (isMountedRef.current && status === 'active') setStatus('buffering');
                    }}
                    onError={(e) => {
                        console.error('[ScreenPlayer] <video> error:', e.nativeEvent);
                        if (isMountedRef.current) {
                            setStatus('error');
                            setError('Stream interrupted. Send start_screen again from the dashboard.');
                        }
                    }}
                />
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-surface border-t border-surface-border flex justify-between items-center text-xs text-content-muted">
                <span>Target: {deviceId}</span>
                <span className={`font-semibold ${status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {status === 'active' ? '● LIVE' : '◌ WAITING'}
                </span>
            </div>
        </div>
    );
};

export default LiveScreenPlayer;
