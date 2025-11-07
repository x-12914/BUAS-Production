import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './LiveAudioPlayer.css';

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

const LiveAudioPlayer = ({ deviceId, onClose }) => {
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
  const MAX_AUDIO_QUEUE_SIZE = 20; // Sufficient for Ogg Opus frames
  const BATCH_SIZE = 1; // Decode immediately (Android sends 1 page per chunk at 40ms intervals)

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
  };  const connectToStream = () => {
    try {
      // Connect to streaming namespace via Socket.IO
      // In production, use the same origin (nginx will proxy to Flask)
      // The key is: we connect to the NAMESPACE (/stream), not the path
      const socketUrl = process.env.NODE_ENV === 'production' 
        ? `${window.location.protocol}//${window.location.host}`  // Use full origin with protocol
        : API_BASE_URL;  // Development: direct connection
      
      console.log('Connecting to Socket.IO at:', socketUrl);
      
      // Socket.IO v4: Connect to namespace
      // The namespace is specified in the URL, path is the Socket.IO endpoint
      socketRef.current = io(`${socketUrl}/stream`, {
        path: '/socket.io',
        withCredentials: true,
        transports: ['polling', 'websocket'],  // Try polling first, then upgrade to websocket
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
      });
      
      // Store reference for cleanup (same object)
      baseSocketRef.current = socketRef.current;

      socketRef.current.on('connect', () => {
        console.log('Connected to streaming server');
        setStatus('connecting');
        
        // Request live stream
        socketRef.current.emit('request_live_stream', { device_id: deviceId });
      });

      socketRef.current.on('stream_requested', (data) => {
        console.log('Stream requested, waiting for device:', data);
        sessionIdRef.current = data.session_id;
        setStatus('waiting');
        
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        // Set timeout for device connection (2 minutes)
        // If device doesn't connect, show error
        timeoutRef.current = setTimeout(() => {
          // Check if still waiting for this session
          if (sessionIdRef.current === data.session_id) {
            console.warn('Stream request timeout - device did not connect');
            setError('Device did not respond. Please try again.');
            setStatus('error');
          }
          timeoutRef.current = null;
        }, 120000); // 2 minutes
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
        
        // Clear timeout since device connected
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Update listener count if provided
        if (data.listener_count !== undefined) {
          setListenerCount(data.listener_count);
        }
        
        setStatus('active');
        startPlayback();
        startDurationCounter();
      });

      socketRef.current.on('listener_count_update', (data) => {
        // Real-time listener count updates when other users join/leave
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
        
        // Handle different disconnect reasons
        switch (reason) {
          case 'io server disconnect':
            // Server intentionally disconnected (e.g., auth failure)
            setError('Connection closed by server');
            cleanup();
            break;
          case 'io client disconnect':
            // Client intentionally disconnected (we handle this in cleanup)
            // Don't cleanup here as it's already handled
            break;
          case 'transport close':
          case 'transport error':
            // Network error or connection lost
            setError('Connection lost. Reconnecting...');
            // Socket.IO will auto-reconnect, so don't cleanup yet
            // Only cleanup if reconnection fails
            break;
          default:
            // Unknown reason
            console.warn('Unexpected disconnect reason:', reason);
            cleanup();
        }
      });

      socketRef.current.on('connect_error', (err) => {
        console.error('Connection error:', err);
        setError('Failed to connect to streaming server');
        setStatus('error');
        // Don't cleanup on connect error - Socket.IO will retry
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
        cleanup(); // Clean up if all reconnection attempts failed
      });

      socketRef.current.on('reconnect', (attemptNumber) => {
        console.log(`Reconnected after ${attemptNumber} attempts`);
        setError(null);
        setStatus('connecting');
        // Re-request stream after reconnection
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
      
      // Calculate latency
      if (timestamp) {
        const serverTime = new Date(timestamp).getTime();
        const clientTime = Date.now();
        setLatency(clientTime - serverTime);
      }
      
      // Update sequence tracking
      sequenceRef.current = sequence;
      
      // Decode base64 audio data (Ogg Opus container from Android)
      const binaryString = atob(chunk);
      const oggBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        oggBytes[i] = binaryString.charCodeAt(i);
      }
      
      setBytesReceived(prev => prev + oggBytes.length);
      
      // Check queue size
      if (audioQueueRef.current.length >= MAX_AUDIO_QUEUE_SIZE) {
        console.warn(`Audio queue full (${audioQueueRef.current.length}), dropping oldest chunk`);
        audioQueueRef.current.shift();
      }
      
      // Queue Ogg Opus data for decoding
  audioQueueRef.current.push(oggBytes.buffer);
      
      // Start decoding if not already processing - wait for small buffer to reduce initial latency
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
      // Check capture pattern
      if (view[offset] !== 0x4f || view[offset+1] !== 0x67 || view[offset+2] !== 0x67 || view[offset+3] !== 0x53) {
        break; // Not an Ogg page
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
    // Initialize playback timeline
    nextPlayTimeRef.current = audioContextRef.current?.currentTime || 0;
  };

  const playNextChunk = async () => {
    // Recreate audio context if it was closed
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      initializeAudioContext();
    }
    
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    
  // Get next Ogg Opus chunk from queue
  const oggBuffer = audioQueueRef.current.shift();

    try {
      // Parse incoming Ogg pages
      const pages = parseOggPages(oggBuffer);
      let alreadyAccumulated = false; // Track if we already accumulated pages from this chunk
      
      console.log(`Parsed ${pages.length} Ogg pages from chunk (${oggBuffer.byteLength} bytes)`);
      
      // If we haven't captured the header prefix (OpusHead + OpusTags), look for it
      if (!headerPrefixRef.current) {
        if (pages.length >= 2) {
          // Check if first two pages are headers (OpusHead starts with "OpusHead")
          const firstPageData = pages[0];
          const isOpusHead = firstPageData.length > 30 && 
            firstPageData[28] === 0x4f && firstPageData[29] === 0x70 && 
            firstPageData[30] === 0x75 && firstPageData[31] === 0x73 &&
            firstPageData[32] === 0x48 && firstPageData[33] === 0x65 &&
            firstPageData[34] === 0x61 && firstPageData[35] === 0x64;
          
          if (isOpusHead) {
            // Store headers (first two pages)
            const headerPrefix = new Uint8Array(pages[0].length + pages[1].length);
            headerPrefix.set(pages[0], 0);
            headerPrefix.set(pages[1], pages[0].length);
            headerPrefixRef.current = headerPrefix.buffer;
            console.log('Captured Ogg headers (OpusHead + OpusTags)');
            
            // If there are audio pages after headers, accumulate them and continue to decode logic
            if (pages.length > 2) {
              for (let i = 2; i < pages.length; i++) {
                accumulatedPagesRef.current.push(pages[i]);
              }
              console.log(`Accumulated ${pages.length - 2} audio pages from first chunk`);
              alreadyAccumulated = true; // Mark as accumulated
              // Don't return - fall through to decode logic below
            } else {
              // Only headers, no audio yet - wait for next chunk
              if (audioQueueRef.current.length > 0) {
                playNextChunk();
              } else {
                isPlayingRef.current = false;
              }
              return;
            }
          } else {
            // Not headers, wait for proper header packet
            if (audioQueueRef.current.length > 0) {
              playNextChunk();
            } else {
              isPlayingRef.current = false;
            }
            return;
          }
        } else {
          // Not enough pages to be headers
          if (audioQueueRef.current.length > 0) {
            playNextChunk();
          } else {
            isPlayingRef.current = false;
          }
          return;
        }
      }
      
      // We have headers - check if this is a header-only resend
      if (headerPrefixRef.current && pages.length === 2) {
        const firstPageData = pages[0];
        const isOpusHead = firstPageData.length > 30 && 
          firstPageData[28] === 0x4f && firstPageData[29] === 0x70;
        
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
      
      // Accumulate audio pages (skip if we already accumulated from header packet above)
      if (headerPrefixRef.current && !alreadyAccumulated) {
        for (let i = 0; i < pages.length; i++) {
          accumulatedPagesRef.current.push(pages[i]);
        }
      }
      
      // Check if we should decode now
      // Decode when: enough pages accumulated OR this is the last chunk in queue
      const shouldDecode = accumulatedPagesRef.current.length >= BATCH_SIZE || 
                          (accumulatedPagesRef.current.length > 0 && audioQueueRef.current.length === 0);
      
      if (shouldDecode) {
        // Calculate total size needed
        let totalAudioSize = 0;
        for (const page of accumulatedPagesRef.current) {
          totalAudioSize += page.length;
        }
        
        // Build complete Ogg stream: headers + accumulated audio pages
        const headerPrefix = new Uint8Array(headerPrefixRef.current);
        const completeStream = new Uint8Array(headerPrefix.length + totalAudioSize);
        completeStream.set(headerPrefix, 0);
        
        let offset = headerPrefix.length;
        for (const page of accumulatedPagesRef.current) {
          completeStream.set(page, offset);
          offset += page.length;
        }
        
        // Clear accumulated pages
        accumulatedPagesRef.current = [];
        
        // Decode the complete stream
        const audioBuffer = await audioContextRef.current.decodeAudioData(completeStream.buffer);
      
        // Verify decoded buffer has valid data
        if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.duration === 0) {
          throw new Error('Decoded buffer is empty or invalid');
        }
        
        // Ensure analyser exists
        if (!analyserRef.current && audioContextRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser();
          analyserRef.current.fftSize = 256;
          analyserRef.current.connect(audioContextRef.current.destination);
        }
        
        // Create source and connect to analyser
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyserRef.current);
        
        // Update audio level visualization
        updateAudioLevel();
        
        // Schedule audio precisely for continuous playback without gaps/cracks
        const currentTime = audioContextRef.current.currentTime;
        
        // If we're behind schedule or just starting, play ASAP but with small buffer
        if (nextPlayTimeRef.current < currentTime) {
          nextPlayTimeRef.current = currentTime + 0.05; // 50ms buffer to prevent underruns
        }
        
        // Start playback at scheduled time
        source.start(nextPlayTimeRef.current);
        
        // Schedule next chunk to start right when this one ends
        nextPlayTimeRef.current += audioBuffer.duration;
        
        // Also handle onended as fallback
        source.onended = () => {
          // If queue accumulated more chunks while playing, restart
          if (!isPlayingRef.current && audioQueueRef.current.length >= 2 && audioContextRef.current) {
            isPlayingRef.current = true;
            playNextChunk();
          }
        };
      }
      
      // Continue processing queue
      if (audioQueueRef.current.length > 0 && audioContextRef.current) {
        // Use small delay to avoid blocking
        setTimeout(() => playNextChunk(), 0);
      } else if (accumulatedPagesRef.current.length === 0) {
        isPlayingRef.current = false;
      }
      
    } catch (err) {
      console.error('Ogg Opus decode error:', err);
      // Continue with next chunk
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
    
    // Calculate average level
    const sum = dataArray.reduce((a, b) => a + b, 0);
    const average = sum / dataArray.length;
    setAudioLevel(Math.round(average / 255 * 100));
    
    // Continue updating while playing
    if (isPlayingRef.current) {
      requestAnimationFrame(updateAudioLevel);
    }
  };

  const handleStop = async () => {
    try {
      if (socketRef.current && socketRef.current.connected) {
        // Send leave_stream event with timeout protection
        const leavePromise = new Promise((resolve) => {
          // Set up a one-time listener for confirmation (optional)
          const timeout = setTimeout(() => {
            resolve(); // Continue even if no response
          }, 500); // Max 500ms wait
          
          // Try to send leave_stream event
          try {
            socketRef.current.emit('leave_stream', { device_id: deviceId }, () => {
              clearTimeout(timeout);
              resolve(); // Server acknowledged
            });
          } catch (err) {
            console.warn('Error sending leave_stream:', err);
            clearTimeout(timeout);
            resolve(); // Continue anyway
          }
        });
        
        await leavePromise;
      }
    } catch (err) {
      console.error('Error in handleStop:', err);
      // Continue with cleanup even if leave_stream failed
    } finally {
      // Always cleanup, even if leave_stream failed
      cleanup();
      if (onClose) onClose();
    }
  };

  const cleanup = () => {
    isPlayingRef.current = false;
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Clear duration interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    
    // baseSocketRef and socketRef point to same object now, so only need to clean one
    if (baseSocketRef.current && baseSocketRef.current !== socketRef.current) {
      baseSocketRef.current.disconnect();
      baseSocketRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    audioQueueRef.current = [];
    accumulatedPagesRef.current = []; // Clear accumulated audio pages
    nextPlayTimeRef.current = 0; // Reset timeline
    headerPrefixRef.current = null; // Reset header cache
  };

  const startDurationCounter = () => {
    // Clear any existing interval
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    
    // Start new interval to increment duration every second
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

  const getStatusIcon = () => {
    switch (status) {
      case 'connecting':
        return '🔌';
      case 'waiting':
        return '⏳';
      case 'active':
        return '🔴';
      case 'error':
        return '❌';
      case 'stopped':
        return '⏹️';
      default:
        return '❓';
    }
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

  return (
    <div className="live-audio-player">
      <div className="player-header">
        <div className="status-indicator">
          <span className={`status-icon ${status}`}>{getStatusIcon()}</span>
          <span className={`status-text ${status}`}>{getStatusText()}</span>
          {status === 'active' && listenerCount > 0 && (
            <span className="listener-badge"> • {listenerCount} listener{listenerCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button className="close-button" onClick={handleStop} title="Stop listening">
          ✕
        </button>
      </div>

      <div className="player-body">
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {status === 'waiting' && (
          <div className="waiting-message">
            <p>Waiting for device to connect and start streaming...</p>
            <p className="hint">The device will start streaming within 30 seconds.</p>
          </div>
        )}

        {status === 'active' && (
          <div className="stream-info">
            <div className="audio-level-meter">
              <div className="meter-label">Audio Level</div>
              <div className="meter-bar">
                <div 
                  className="meter-fill" 
                  style={{ width: `${audioLevel}%` }}
                ></div>
              </div>
              <div className="meter-value">{audioLevel}%</div>
            </div>

            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Duration:</span>
                <span className="stat-value">{formatDuration(duration)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Data received:</span>
                <span className="stat-value">{formatBytes(bytesReceived)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="player-footer">
        <button 
          className="stop-button" 
          onClick={handleStop}
          disabled={status === 'stopped' || status === 'error'}
        >
          Stop Listening
        </button>
      </div>
    </div>
  );
};

export default LiveAudioPlayer;

