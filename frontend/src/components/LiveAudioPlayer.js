import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { X, Square } from 'lucide-react';

/**
 * LiveAudioPlayer - Real-time Opus audio streaming component
 *
 * Audio Format: Ogg Opus 48kHz mono @ 48kbps (High Quality Balanced mode)
 * - Better voice quality than previous AAC 128kbps
 * - 62% less bandwidth usage
 * - ~60% lower latency (150-200ms vs 300-500ms)
 * - Works in ALL modern browsers (Chrome, Firefox, Safari, Edge)
 *
 * Uses Web Audio API to decode Ogg Opus containers (universal browser support)
 */

const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? window.location.origin
  : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

const LiveAudioPlayer = ({ deviceId, onClose, variant = 'full', onStatusChange }) => {
  const [status, setStatus] = useState('connecting'); // connecting, waiting, active, error, stopped
  const [error, setError] = useState(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [latency, setLatency] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [duration, setDuration] = useState(0); // Track streaming duration in seconds

  const socketRef = useRef(null);
  const baseSocketRef = useRef(null); // Track base socket for cleanup
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const headerPrefixRef = useRef(null); // Stores OpusHead + OpusTags bytes to prepend for decoding
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef(null);
  const sequenceRef = useRef(0);
  const analyserRef = useRef(null);
  const timeoutRef = useRef(null); // Track timeout for cleanup
  const durationIntervalRef = useRef(null); // Track duration interval
  const nextPlayTimeRef = useRef(0); // Track scheduled playback time for smooth continuous audio
  const accumulatedPagesRef = useRef([]); // Accumulate audio pages for batch decoding
  const underrunCountRef = useRef(0); // Track buffer underruns for diagnostics
  const MAX_AUDIO_QUEUE_SIZE = 20; // Sufficient for Ogg Opus frames
  const BATCH_SIZE = 1; // Decode immediately (Android sends 1 page per chunk at 40ms intervals)

  // Notify parent components about status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  useEffect(() => {
    initializeAudioContext();
    connectToStream();

    // Handle browser/tab close or navigation
    const handleBeforeUnload = () => {
      if (socketRef.current && socketRef.current.connected) {
        // Try to send leave_stream, but don't wait (page is closing)
        try {
          socketRef.current.emit('leave_stream', { device_id: deviceId });
        } catch (err) {
          // Ignore errors during page unload
        }
      }
    };

    // Handle page visibility change (tab hidden/visible)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - could pause or handle gracefully
        // For now, we keep streaming active
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // Cleanup on component unmount
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      // Try graceful disconnect
      if (socketRef.current && socketRef.current.connected) {
        try {
          socketRef.current.emit('leave_stream', { device_id: deviceId });
          // Small delay for server processing
          setTimeout(() => {
            cleanup();
          }, 100);
        } catch (err) {
          // If emit fails, cleanup immediately
          cleanup();
        }
      } else {
        cleanup();
      }
    };
  }, [deviceId]);

  const initializeAudioContext = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });

      // Create analyser for audio level visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);

      console.log('Audio context initialized for Ogg Opus streaming');
    } catch (err) {
      console.error('Failed to initialize audio context:', err);
      setError('Audio initialization failed');
    }
  };

  const connectToStream = () => {
    try {
      // Connect to streaming namespace via Socket.IO
      const socketUrl = process.env.NODE_ENV === 'production'
        ? `${window.location.protocol}//${window.location.host}`
        : API_BASE_URL;

      console.log('Connecting to Socket.IO at:', socketUrl);

      socketRef.current = io(`${socketUrl}/stream`, {
        path: '/socket.io',
        withCredentials: true,
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
      });

      baseSocketRef.current = socketRef.current;

      socketRef.current.on('connect', () => {
        console.log('Connected to streaming server');
        setStatus('connecting');

        socketRef.current.emit('request_live_stream', { device_id: deviceId });
      });

      socketRef.current.on('stream_requested', (data) => {
        console.log('Stream requested, waiting for device:', data);
        sessionIdRef.current = data.session_id;
        setStatus('waiting');

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          if (sessionIdRef.current === data.session_id) {
            console.warn('Stream request timeout - device did not connect');
            setError('Device did not respond. Please try again.');
            setStatus('error');
          }
          timeoutRef.current = null;
        }, 120000);
      });

      socketRef.current.on('stream_joined', (data) => {
        console.log('Joined existing stream:', data);
        sessionIdRef.current = data.session_id;
        setListenerCount(data.listener_count);

        if (data.status === 'active') {
          setStatus('active');
          startPlayback();
          startDurationCounter();

          if (data.needs_header) {
            console.log('Waiting for Ogg header packet from device...');
          }
        } else {
          setStatus('waiting');
        }
      });

      socketRef.current.on('stream_started', (data) => {
        console.log('Stream is now active:', data);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (data.listener_count !== undefined) {
          setListenerCount(data.listener_count);
        }

        setStatus('active');
        startPlayback();
        startDurationCounter();
      });

      socketRef.current.on('listener_count_update', (data) => {
        console.log('Listener count updated:', data.listener_count);
        if (data.listener_count !== undefined) {
          setListenerCount(data.listener_count);
        }
      });

      socketRef.current.on('audio_data', (data) => {
        handleAudioChunk(data);
      });

      socketRef.current.on('stream_error', (data) => {
        console.error('Stream error:', data);
        setError(data.message);
        setStatus('error');
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Disconnected from streaming server:', reason);
        setStatus('stopped');

        switch (reason) {
          case 'io server disconnect':
            setError('Connection closed by server');
            cleanup();
            break;
          case 'io client disconnect':
            break;
          case 'transport close':
          case 'transport error':
            setError('Connection lost. Reconnecting...');
            break;
          default:
            console.warn('Unexpected disconnect reason:', reason);
            cleanup();
        }
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Connection error:', err);
        setError('Failed to connect to streaming server');
        setStatus('error');
      });

      socketRef.current.on('reconnect_error', (err) => {
        console.error('Reconnection error:', err);
        setError('Failed to reconnect. Please try again.');
        setStatus('error');
      });

      socketRef.current.on('reconnect_failed', () => {
        console.error('Reconnection failed after all attempts');
        setError('Connection lost. Please refresh the page.');
        setStatus('error');
        cleanup();
      });

      socketRef.current.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        setError(null);
        setStatus('connecting');
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('request_live_stream', { device_id: deviceId });
        }
      });

    } catch (err) {
      console.error('Failed to connect:', err);
      setError('Failed to initialize stream connection');
      setStatus('error');
    }
  };

  /**
   * Handle incoming audio chunk from server
   * Audio is now Ogg Opus-encoded (48kHz, 48kbps) - works in all browsers!
   */
  const handleAudioChunk = (data) => {
    try {
      const { chunk, sequence, timestamp } = data;

      if (timestamp) {
        const serverTime = new Date(timestamp).getTime();
        const clientTime = Date.now();
        setLatency(clientTime - serverTime);
      }

      sequenceRef.current = sequence;

      const binaryString = atob(chunk);
      const oggBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        oggBytes[i] = binaryString.charCodeAt(i);
      }

      setBytesReceived(prev => prev + oggBytes.length);

      if (audioQueueRef.current.length >= MAX_AUDIO_QUEUE_SIZE) {
        console.warn(`Audio queue full (${audioQueueRef.current.length}), dropping oldest chunk`);
        audioQueueRef.current.shift();
      }

      audioQueueRef.current.push(oggBytes.buffer);

      if (!isPlayingRef.current && audioQueueRef.current.length >= 3) {
        isPlayingRef.current = true;
        playNextChunk();
      }

    } catch (err) {
      console.error('Error handling audio chunk:', err);
    }
  };

  // Parse Ogg pages from an ArrayBuffer and return array of Uint8Array pages
  const parseOggPages = (arrayBuffer) => {
    const view = new Uint8Array(arrayBuffer);
    const pages = [];
    let offset = 0;
    while (offset + 27 <= view.length) {
      if (view[offset] !== 0x4f || view[offset+1] !== 0x67 || view[offset+2] !== 0x67 || view[offset+3] !== 0x53) {
        break;
      }
      const pageSegments = view[offset + 26];
      const segmentTableStart = offset + 27;
      if (segmentTableStart + pageSegments > view.length) break;
      let payloadLen = 0;
      for (let i = 0; i < pageSegments; i++) {
        payloadLen += view[segmentTableStart + i];
      }
      const pageTotalLen = 27 + pageSegments + payloadLen;
      if (offset + pageTotalLen > view.length) break;
      pages.push(view.slice(offset, offset + pageTotalLen));
      offset += pageTotalLen;
    }
    return pages;
  };

  const startPlayback = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
  };

  const playNextChunk = async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      initializeAudioContext();
    }

    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      if (isPlayingRef.current) {
        underrunCountRef.current++;
        const timestamp = Date.now();
        console.warn(`Buffer underrun #${underrunCountRef.current} at ${timestamp} - queue empty, playback stalled`);
      }
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;

    const oggBuffer = audioQueueRef.current.shift();

    try {
      const pages = parseOggPages(oggBuffer);
      let alreadyAccumulated = false;

      console.log(`Parsed ${pages.length} Ogg pages from chunk (${oggBuffer.byteLength} bytes)`);

      if (!headerPrefixRef.current) {
        if (pages.length >= 2) {
          const firstPageData = pages[0];

          let payloadOffset = 28;
          if (firstPageData.length > 27) {
            const numSegments = firstPageData[26];
            payloadOffset = 27 + numSegments;
          }

          const isOpusHead = firstPageData.length > payloadOffset + 8 &&
            firstPageData[payloadOffset] === 0x4f &&
            firstPageData[payloadOffset+1] === 0x70 &&
            firstPageData[payloadOffset+2] === 0x75 &&
            firstPageData[payloadOffset+3] === 0x73 &&
            firstPageData[payloadOffset+4] === 0x48 &&
            firstPageData[payloadOffset+5] === 0x65 &&
            firstPageData[payloadOffset+6] === 0x61 &&
            firstPageData[payloadOffset+7] === 0x64;

          if (isOpusHead) {
            const headerPrefix = new Uint8Array(pages[0].length + pages[1].length);
            headerPrefix.set(pages[0], 0);
            headerPrefix.set(pages[1], pages[0].length);
            headerPrefixRef.current = headerPrefix.buffer;
            console.log('Captured Ogg headers (OpusHead + OpusTags)');

            if (accumulatedPagesRef.current.length > 0) {
              console.warn(`Discarding ${accumulatedPagesRef.current.length} pre-header audio pages (wrong granule positions)`);
              accumulatedPagesRef.current = [];
            }

            if (pages.length > 2) {
              console.warn(`Discarding ${pages.length - 2} audio pages from header chunk (also wrong granule positions)`);
            }

            if (audioQueueRef.current.length > 0) {
              playNextChunk();
            } else {
              isPlayingRef.current = false;
            }
            return;
          } else {
            console.warn('Received audio pages before headers - buffering...');
            for (let i = 0; i < pages.length; i++) {
              accumulatedPagesRef.current.push(pages[i]);
            }
            if (audioQueueRef.current.length > 0) {
              playNextChunk();
            } else {
              isPlayingRef.current = false;
            }
            return;
          }
        } else {
          console.warn('Received single page before headers - buffering...');
          for (let i = 0; i < pages.length; i++) {
            accumulatedPagesRef.current.push(pages[i]);
          }
          if (audioQueueRef.current.length > 0) {
            playNextChunk();
          } else {
            isPlayingRef.current = false;
          }
          return;
        }
      }

      if (headerPrefixRef.current && pages.length === 2) {
        const firstPageData = pages[0];

        let payloadOffset = 28;
        if (firstPageData.length > 27) {
          const numSegments = firstPageData[26];
          payloadOffset = 27 + numSegments;
        }

        const isOpusHead = firstPageData.length > payloadOffset + 8 &&
          firstPageData[payloadOffset] === 0x4f &&
          firstPageData[payloadOffset+1] === 0x70;

        if (isOpusHead) {
          console.log('Skipping header-only packet (already have headers)');
          if (audioQueueRef.current.length > 0) {
            playNextChunk();
          } else {
            isPlayingRef.current = false;
          }
          return;
        }
      }

      if (headerPrefixRef.current && !alreadyAccumulated) {
        for (let i = 0; i < pages.length; i++) {
          accumulatedPagesRef.current.push(pages[i]);
        }
      }

      const shouldDecode = accumulatedPagesRef.current.length >= BATCH_SIZE ||
                          (accumulatedPagesRef.current.length > 0 && audioQueueRef.current.length === 0);

      if (shouldDecode) {
        let totalAudioSize = 0;
        for (const page of accumulatedPagesRef.current) {
          totalAudioSize += page.length;
        }

        const headerPrefix = new Uint8Array(headerPrefixRef.current);
        const completeStream = new Uint8Array(headerPrefix.length + totalAudioSize);
        completeStream.set(headerPrefix, 0);

        let offset = headerPrefix.length;
        for (const page of accumulatedPagesRef.current) {
          completeStream.set(page, offset);
          offset += page.length;
        }

        accumulatedPagesRef.current = [];

        const audioBuffer = await audioContextRef.current.decodeAudioData(completeStream.buffer);

        if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.duration === 0) {
          throw new Error('Decoded buffer is empty or invalid');
        }

        if (!analyserRef.current && audioContextRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          analyserRef.current.connect(audioContextRef.current.destination);
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyserRef.current);

        updateAudioLevel();

        const currentTime = audioContextRef.current.currentTime;

        if (nextPlayTimeRef.current < currentTime) {
          nextPlayTimeRef.current = currentTime + 0.05;
        }

        source.start(nextPlayTimeRef.current);

        nextPlayTimeRef.current += audioBuffer.duration;

        source.onended = () => {
          if (!isPlayingRef.current && audioQueueRef.current.length >= 2 && audioContextRef.current) {
            isPlayingRef.current = true;
            playNextChunk();
          }
        };
      }

      if (audioQueueRef.current.length > 0 && audioContextRef.current) {
        setTimeout(() => playNextChunk(), 0);
      } else if (accumulatedPagesRef.current.length === 0) {
        isPlayingRef.current = false;
      }

    } catch (err) {
      console.error('Ogg Opus decode error:', err);
      if (audioQueueRef.current.length > 0 && audioContextRef.current) {
        playNextChunk();
      } else {
        isPlayingRef.current = false;
      }
    }
  };

  const updateAudioLevel = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length;
    setAudioLevel(Math.round(average / 255 * 100));

    if (isPlayingRef.current) {
      requestAnimationFrame(updateAudioLevel);
    }
  };

  const handleStop = async () => {
    try {
      if (socketRef.current && socketRef.current.connected) {
        const leavePromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve();
          }, 500);

          try {
            socketRef.current.emit('leave_stream', { device_id: deviceId }, () => {
              clearTimeout(timeout);
              resolve();
            });
          } catch (err) {
            console.warn('Error sending leave_stream:', err);
            clearTimeout(timeout);
            resolve();
          }
        });

        await leavePromise;
      }
    } catch (err) {
      console.error('Error in handleStop:', err);
    } finally {
      cleanup();
      if (onClose) onClose();
    }
  };

  const cleanup = () => {
    isPlayingRef.current = false;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    if (baseSocketRef.current && baseSocketRef.current !== socketRef.current) {
      baseSocketRef.current.disconnect();
      baseSocketRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    accumulatedPagesRef.current = [];
    nextPlayTimeRef.current = 0;
    headerPrefixRef.current = null;
  };

  const startDurationCounter = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }

    durationIntervalRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return 'Connecting to server...';
      case 'waiting':
        return 'Waiting for device to start streaming...';
      case 'active':
        return 'LIVE';
      case 'error':
        return 'Error';
      case 'stopped':
        return 'Stopped';
      default:
        return 'Unknown';
    }
  };

  if (variant === 'compact') {
    const isActive = status === 'active';
    const isWaiting = status === 'waiting';
    const isConnecting = status === 'connecting';
    const listenersLabel = listenerCount === 1 ? '1 listener' : `${listenerCount} listeners`;
    const dataLabel = formatBytes(bytesReceived);

    const getControlLabel = () => {
      switch (status) {
        case 'connecting':
          return 'Cancel Connection';
        case 'waiting':
          return 'Cancel Request';
        case 'active':
          return 'Stop Listening';
        case 'error':
          return 'Close Player';
        case 'stopped':
          return 'Close';
        default:
          return status === 'idle' ? 'Close' : 'Stop Listening';
      }
    };

    const controlLabel = getControlLabel();
    const controlDisabled = status === 'stopping';
    const showControl =
      status !== 'idle' ||
      status === 'error' ||
      isConnecting ||
      isWaiting ||
      isActive;

    return (
      <div className="bg-surface-overlay border border-surface-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-danger animate-pulse' : status === 'error' ? 'bg-danger' : status === 'waiting' || status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-content-muted'}`}></span>
            <span className="text-xs font-medium text-content">{getStatusText()}</span>
            {isActive && (
              <span className="text-xs text-content-muted">{formatDuration(duration)}</span>
            )}
          </div>
        </div>

        {error && (
          <div className="px-4 py-2 text-xs text-danger bg-danger/5 border-b border-surface-border">
            {error}
          </div>
        )}

        <div className="px-4 py-3">
          {(isConnecting || isWaiting) && !error && (
            <p className="text-xs text-content-muted">
              {isConnecting ? 'Connecting to streaming server...' : 'Waiting for device to respond...'}
            </p>
          )}

          {!error && (
            <>
              <div className="flex items-center gap-3 text-xs text-content-muted">
                <span>{listenersLabel}</span>
                <span>{dataLabel}</span>
                {latency > 0 && (
                  <span>{latency} ms</span>
                )}
              </div>

              {isActive && (
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-150"
                        style={{ width: `${audioLevel}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-content-muted w-16 text-right">{audioLevel}% level</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {showControl && (
          <div className="px-4 py-3 border-t border-surface-border">
            <button
              className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              onClick={handleStop}
              disabled={controlDisabled}
              title={controlLabel}
            >
              {controlLabel}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] w-80 bg-surface-overlay border-2 ${
      status === 'active' || status === 'error' ? 'border-danger'
      : status === 'waiting' || status === 'connecting' ? 'border-warning'
      : 'border-surface-border'
    } rounded-xl shadow-2xl overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-danger animate-pulse' : status === 'error' ? 'bg-danger' : status === 'waiting' || status === 'connecting' ? 'bg-warning animate-pulse' : 'bg-content-muted'}`}></span>
          <span className="text-sm font-medium text-content">{getStatusText()}</span>
          {status === 'active' && listenerCount > 0 && (
            <span className="text-xs text-content-secondary">{listenerCount} listener{listenerCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button className="p-1 rounded hover:bg-surface-hover text-content-muted transition-colors" onClick={handleStop} title="Stop listening">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 px-3 py-2 text-xs text-danger bg-danger/5 rounded-lg border border-danger/10">
            {error}
          </div>
        )}

        {status === 'waiting' && (
          <div className="text-center py-2">
            <p className="text-xs text-content-secondary">Waiting for device to connect and start streaming...</p>
            <p className="text-xs text-content-muted mt-1">The device will start streaming within 30 seconds.</p>
          </div>
        )}

        {status === 'active' && (
          <div className="space-y-3">
            {/* Audio level meter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-content-muted">Audio Level</span>
                <span className="text-xs font-mono text-content-secondary">{audioLevel}%</span>
              </div>
              <div className="h-2 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-150"
                  style={{ width: `${audioLevel}%` }}
                ></div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="text-xs">
                <span className="text-content-muted">Duration:</span>
                <span className="ml-1 text-content font-mono">{formatDuration(duration)}</span>
              </div>
              <div className="text-xs">
                <span className="text-content-muted">Data:</span>
                <span className="ml-1 text-content font-mono">{formatBytes(bytesReceived)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Status bar */}
      <div className="px-4 py-2 border-t border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-content-muted">
          <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-success' : 'bg-content-muted'}`}></span>
          <span>{status === 'active' ? 'Connected' : status === 'connecting' ? 'Connecting...' : status === 'waiting' ? 'Waiting...' : 'Disconnected'}</span>
        </div>
        <button
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
          onClick={handleStop}
          disabled={status === 'stopped' || status === 'error'}
        >
          <Square size={12} /> Stop
        </button>
      </div>
    </div>
  );
};

export default LiveAudioPlayer;
