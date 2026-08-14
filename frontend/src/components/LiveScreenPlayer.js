import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Monitor, Maximize, AlertCircle, Wifi } from 'lucide-react';
import { io } from 'socket.io-client';

/**
 * LiveScreenPlayer — JPEG frame-by-frame renderer.
 *
 * Receives individual JPEG frames from the server via Socket.IO and displays
 * them as a continuously-updating <img> tag. No MSE, no codecs, no browser
 * compatibility headaches. Works everywhere.
 */
const LiveScreenPlayer = ({ deviceId, onClose }) => {
    const containerRef    = useRef(null);
    const imgRef          = useRef(null);
    const socketRef       = useRef(null);
    const isMountedRef    = useRef(true);
    const frameCountRef   = useRef(0);
    const lastFrameTimeRef = useRef(0);

    const [status, setStatus]   = useState('connecting');  // 'connecting'|'active'|'error'
    const [fps, setFps]         = useState(0);
    const [error, setError]     = useState(null);

    // ── FPS meter ─────────────────────────────────────────────────────────
    const fpsIntervalRef = useRef(null);

    const startFpsMeter = useCallback(() => {
        fpsIntervalRef.current = setInterval(() => {
            if (!isMountedRef.current) return;
            const now = Date.now();
            const elapsed = (now - lastFrameTimeRef.current) / 1000;
            if (elapsed > 2) {
                // No frame in 2 seconds — back to buffering
                setFps(0);
                setStatus(prev => prev === 'active' ? 'connecting' : prev);
            }
        }, 2000);
    }, []);

    const stopFpsMeter = useCallback(() => {
        if (fpsIntervalRef.current) {
            clearInterval(fpsIntervalRef.current);
            fpsIntervalRef.current = null;
        }
    }, []);

    // ── Fullscreen toggle ─────────────────────────────────────────────────
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    };

    // ── Socket lifecycle ──────────────────────────────────────────────────
    useEffect(() => {
        isMountedRef.current = true;
        frameCountRef.current = 0;

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
            if (!isMountedRef.current) return;
            console.log('[ScreenPlayer] Connected — joining room for', deviceId);
            socket.emit('join_screen_stream', { device_id: deviceId });
        });

        // ── Core frame handler ────────────────────────────────────────────
        socket.on('screen_frame', (data) => {
            if (!isMountedRef.current) return;
            if (!data?.frame) return;

            const frameDataUrl = `data:${data.mime || 'image/jpeg'};base64,${data.frame}`;

            // Swap the <img> src — browser decodes and renders the JPEG immediately
            if (imgRef.current) {
                imgRef.current.src = frameDataUrl;
            }

            frameCountRef.current++;
            lastFrameTimeRef.current = Date.now();

            // Update status and FPS display
            if (isMountedRef.current) {
                setStatus('active');
                setFps(prev => {
                    // Rolling FPS estimate: count frames over last second
                    return frameCountRef.current > 0 ? frameCountRef.current : prev;
                });
            }
        });

        socket.on('connect_error', (err) => {
            console.error('[ScreenPlayer] Socket error:', err);
            if (isMountedRef.current) {
                setError('Cannot reach streaming server. Check your connection.');
                setStatus('error');
            }
        });

        socket.on('disconnect', (reason) => {
            console.warn('[ScreenPlayer] Disconnected:', reason);
            if (isMountedRef.current) setStatus('connecting');
        });

        startFpsMeter();

        return () => {
            isMountedRef.current = false;
            stopFpsMeter();

            if (socketRef.current) {
                socketRef.current.emit('leave_screen_stream', { device_id: deviceId });
                socketRef.current.disconnect();
                socketRef.current = null;
            }

            // Clean up the object URL to free memory
            if (imgRef.current && imgRef.current.src?.startsWith('data:')) {
                imgRef.current.src = '';
            }
        };
    }, [deviceId, startFpsMeter, stopFpsMeter]);

    // ── Status helpers ────────────────────────────────────────────────────
    const statusDot = {
        connecting: 'bg-yellow-400 animate-pulse',
        active: 'bg-green-400 animate-pulse',
        error: 'bg-red-500',
    }[status] ?? 'bg-yellow-400 animate-pulse';

    const statusText = {
        connecting: 'Waiting for frames…',
        active: 'Live',
        error: 'Error',
    }[status] ?? 'Connecting…';

    return (
        <div className={`fixed bottom-4 right-80 z-[1000] w-[420px] bg-surface-overlay border-2 ${
            status === 'active' ? 'border-success'
            : status === 'error' ? 'border-danger'
            : status === 'connecting' ? 'border-warning'
            : 'border-surface-border'
        } rounded-xl shadow-2xl overflow-hidden`}>

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-overlay">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                    <span className="text-sm font-medium text-content">Live Screen</span>
                    {status === 'active' && (
                        <span className="flex items-center gap-1 text-xs text-green-400 font-semibold">
                            <Wifi size={11} /> {statusText}
                        </span>
                    )}
                    {status !== 'active' && (
                        <span className="text-xs text-content-muted">{statusText}</span>
                    )}
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

            {/* ── Frame display ── */}
            <div
                ref={containerRef}
                className="relative bg-black w-full aspect-video flex items-center justify-center overflow-hidden"
            >
                {/* Overlay shown before first frame arrives */}
                {status !== 'active' && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-content-muted z-10 pointer-events-none">
                        <Monitor className="opacity-30 animate-pulse" size={40} />
                        <span className="text-xs">{statusText}</span>
                        <span className="text-[10px] opacity-50">
                            Accept the screen share prompt on the device
                        </span>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center z-10">
                        <AlertCircle size={28} className="text-red-400" />
                        <span className="text-xs text-red-400">{error}</span>
                    </div>
                )}

                {/*
                  * The <img> tag is always in the DOM but invisible until we set its src.
                  * Each incoming JPEG frame replaces the src — browser renders it instantly.
                  * No codec, no MSE, no pipeline. Just a JPEG displayed in an img tag.
                  */}
                <img
                    ref={imgRef}
                    alt="Live screen"
                    className="w-full h-full object-contain"
                    style={{ display: status === 'active' ? 'block' : 'none' }}
                />
            </div>

            {/* ── Footer ── */}
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
