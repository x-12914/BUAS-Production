import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './LiveAudioPlayer.css';

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
  
  const socketRef = useRef(null);
  const baseSocketRef = useRef(null); // Track base socket for cleanup
  const audioContextRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const sessionIdRef = useRef(null);
  const sequenceRef = useRef(0);
  const analyserRef = useRef(null);
  const timeoutRef = useRef(null); // Track timeout for cleanup
  const MAX_AUDIO_QUEUE_SIZE = 30; // Reduced from 50 to prevent queue buildup (decoding faster than receiving)

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
      audioContextRef.current = new AudioContext({ sampleRate: 44100 });
      
      // Create analyser for audio level visualization
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
      
      console.log('Audio context initialized');
    } catch (err) {
      console.error('Failed to initialize audio context:', err);
      setError('Audio not supported in this browser');
      setStatus('error');
    }
  };

  const connectToStream = () => {
    try {
      // Connect to streaming namespace via Socket.IO
      const socketUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin  // Use same origin through nginx
        : API_BASE_URL;  // Development: direct connection
      
      // Socket.IO v4: Connect to namespace
      // The namespace is specified in the URL, path is the Socket.IO endpoint
      socketRef.current = io(`${socketUrl}/stream`, {
        path: '/socket.io',
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
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
        
        setStatus('active');
        startPlayback();
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
   * Add ADTS header to raw AAC-LC frame for browser compatibility
   * MediaCodec outputs raw AAC frames without headers, but Web Audio API needs ADTS headers
   */
  const addADTSHeader = (aacData) => {
    const frameLength = aacData.length + 7; // ADTS header is 7 bytes
    
    // ADTS header structure (7 bytes) - ISO/IEC 13818-7
    const adtsHeader = new Uint8Array(7);
    
    // Byte 0-1: Sync word (0xFFF) + MPEG version (0) + Layer (00) + Protection absent (1)
    adtsHeader[0] = 0xFF;
    adtsHeader[1] = 0xF1; // 0xFFF + protection absent bit (1)
    
    // Byte 2: Profile (AAC LC = 01) + Sampling frequency (44.1kHz = 0100) + Private (0) + Channel config (mono = 001)
    // Profile: 01 (AAC LC) -> bits 0-1, shifted left 6 = 0x40
    // Sampling: 0100 (4 = 44.1kHz) -> bits 2-5, shifted left 2 = 0x10  
    // Private: 0 -> bit 6 = 0x00
    // Channels: 001 (mono = 1) -> bits 7-9 = 0x01
    adtsHeader[2] = 0x40 | // profile AAC LC (01) << 6 = 0x40
                    0x10 | // sampling frequency 44.1kHz (0100) << 2 = 0x10
                    0x01;  // channel configuration mono (001) = 0x01
    // Result: 0x51
    
    // Byte 3-4: Frame length (13 bits, stored in bits 0-12 of the 13-bit field)
    // Frame length includes the 7-byte header
    adtsHeader[3] = (frameLength >> 11) & 0x03; // Bits 11-12 (2 bits)
    adtsHeader[4] = (frameLength >> 3) & 0xFF;    // Bits 3-10 (8 bits)
    
    // Byte 5: Frame length bits 0-2 (3 bits) + Buffer fullness (11 bits, top 5 bits here)
    // Buffer fullness: 0x7FF (all 11 bits = 1 for "unknown")
    // Top 5 bits of buffer fullness: (0x7FF >> 6) & 0x1F = 0x1F
    adtsHeader[5] = ((frameLength & 0x07) << 5) | 0x1F; // Frame length bits 0-2 << 5, buffer fullness top 5 bits = 0x1F
    
    // Byte 6: Buffer fullness (remaining 6 bits, bits 0-5) + Number of AAC frames (3 bits, bits 6-8) - 1
    // For unknown buffer fullness (0x7FF): bottom 6 bits = 0x3F, number of frames = 1 (0 in field)
    // Format: (buffer_bottom_6_bits << 3) | (number_of_frames - 1)
    // (0x3F << 3) | 0 = 0xF8 (0x3F = 00111111, << 3 = 11111000 = 0xF8)
    adtsHeader[6] = 0xF8; // Buffer fullness bottom 6 bits (0x3F) << 3, frames = 0
    
    // Combine header + AAC data
    const adtsFrame = new Uint8Array(frameLength);
    adtsFrame.set(adtsHeader, 0);
    adtsFrame.set(aacData, 7);
    
    return adtsFrame.buffer;
  };

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
      
      // Decode base64 audio data (raw AAC-LC frame from MediaCodec)
      const binaryString = atob(chunk);
      const rawAacBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        rawAacBytes[i] = binaryString.charCodeAt(i);
      }
      
      setBytesReceived(prev => prev + rawAacBytes.length);
      
      // Validate AAC frame size
      // MediaCodec can output:
      // 1. CSD (Codec-Specific Data) frames - typically 2-5 bytes, not decodable as audio
      // 2. Small padding frames - not decodable
      // 3. Valid AAC-LC frames - typically 50-300 bytes at 64kbps
      // We skip frames < 16 bytes (likely CSD or incomplete) and very large frames (likely corrupted)
      if (rawAacBytes.length < 16) {
        // Skip CSD and very small frames - these aren't decodable audio
        if (Math.random() < 0.01) { // Log occasionally
          console.debug(`Skipping non-audio frame: ${rawAacBytes.length} bytes (likely CSD or padding)`);
        }
        return; // Skip this chunk
      }
      
      // Also skip suspiciously large frames (likely corrupted or concatenated)
      if (rawAacBytes.length > 2000) {
        console.warn(`Skipping suspiciously large frame: ${rawAacBytes.length} bytes`);
        return;
      }
      
      // Wrap raw AAC frame with ADTS header for browser compatibility
      const adtsWrappedFrame = addADTSHeader(rawAacBytes);
      
      // Add to queue for playback (with max size to prevent memory leak)
      if (audioQueueRef.current.length >= MAX_AUDIO_QUEUE_SIZE) {
        // Remove oldest chunk if queue is too large
        console.warn(`Audio queue full (${audioQueueRef.current.length}), dropping oldest chunk`);
        audioQueueRef.current.shift();
      }
      audioQueueRef.current.push(adtsWrappedFrame);
      
      // Start playback if not already playing
      // Reduce buffer to 3 frames for lower latency (was 8, but choppiness suggests we need faster start)
      // Process frames faster to prevent queue buildup
      if (!isPlayingRef.current && audioQueueRef.current.length >= 3) {
        playNextChunk();
      }
      
    } catch (err) {
      console.error('Error handling audio chunk:', err);
    }
  };

  const startPlayback = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const playNextChunk = async () => {
    // Recreate audio context if it was closed (happens on some browser events)
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      initializeAudioContext();
    }
    
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    
    // Process multiple frames at once to reduce queue buildup
    // Take up to 2 frames to decode together (improves success rate)
    const framesToProcess = [];
    while (framesToProcess.length < 2 && audioQueueRef.current.length > 0) {
      framesToProcess.push(audioQueueRef.current.shift());
    }
    
    if (framesToProcess.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    try {
      // Concatenate frames for better decoding success
      let combinedBuffer;
      if (framesToProcess.length === 1) {
        combinedBuffer = framesToProcess[0].slice(0);
      } else {
        const totalLength = framesToProcess.reduce((sum, frame) => sum + frame.byteLength, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const frame of framesToProcess) {
          combined.set(new Uint8Array(frame), offset);
          offset += frame.byteLength;
        }
        combinedBuffer = combined.buffer;
      }
      
      // Try to decode - concatenated frames often decode better
      let audioBuffer;
      try {
        audioBuffer = await audioContextRef.current.decodeAudioData(combinedBuffer.slice(0));
      } catch (decodeError) {
        // If decode fails, skip these frames and try next ones
        throw decodeError;
      }
      
      // Verify decoded buffer has valid data
      if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.duration === 0) {
        throw new Error('Decoded buffer is empty or invalid');
      }
      
      // Ensure audio context is still valid
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        initializeAudioContext();
      }
      
      // Ensure analyser exists (should be created by initializeAudioContext, but double-check)
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
      
      // Play immediately (0 = relative to when source was created)
      source.start(0);
      
      // When this chunk ends, play next
      source.onended = () => {
        // Immediately try to play next chunk to reduce choppiness
        if (audioQueueRef.current.length > 0 && audioContextRef.current) {
          playNextChunk();
        } else {
          isPlayingRef.current = false;
        }
      };
      
    } catch (err) {
      // Audio decode/playback error - skip these frames and continue
      // Only log errors occasionally to reduce console spam
      if (Math.random() < 0.05) {
        if (err.name === 'EncodingError') {
          console.debug('Skipping frame(s) that failed to decode');
        } else {
          console.error('Error playing audio chunk:', err);
        }
      }
      // Continue with next chunk immediately to reduce choppiness
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
                <span className="stat-label">Listeners:</span>
                <span className="stat-value">{listenerCount}</span>
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

