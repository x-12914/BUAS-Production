import React, { useRef, useState, useEffect } from 'react';
import './AudioPlayer.css';

const AudioPlayer = ({ audio, onClose }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleLoadedMetadata = () => {
      setDuration(audioElement.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audioElement.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e) => {
      console.error('Audio playback error:', audioElement.error);
    };

    const handleLoadStart = () => {
      // Audio loading started
    };

    const handleCanPlay = () => {
      // Audio can start playing
    };

    audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    audioElement.addEventListener('timeupdate', handleTimeUpdate);
    audioElement.addEventListener('ended', handleEnded);
    audioElement.addEventListener('error', handleError);
    audioElement.addEventListener('loadstart', handleLoadStart);
    audioElement.addEventListener('canplay', handleCanPlay);

    // Auto-play when component mounts
    audioElement.play().then(() => {
      setIsPlaying(true);
    }).catch(err => {
      console.error('Error auto-playing audio:', err);
    });

    return () => {
      audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audioElement.removeEventListener('timeupdate', handleTimeUpdate);
      audioElement.removeEventListener('ended', handleEnded);
      audioElement.removeEventListener('error', handleError);
      audioElement.removeEventListener('loadstart', handleLoadStart);
      audioElement.removeEventListener('canplay', handleCanPlay);
    };
  }, [audio.url]);

  const togglePlayPause = () => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    if (isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    } else {
      audioElement.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Error playing audio:', err);
      });
    }
  };

  const handleSeek = (e) => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    audioElement.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    
    const audioElement = audioRef.current;
    if (audioElement) {
      audioElement.volume = newVolume;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player-overlay">
      <div className="audio-player">
        <div className="audio-player-header">
          <div className="audio-info">
            <h3 className="audio-title">🎵 {audio.filename}</h3>
            <p className="audio-user">Device: {audio.user}</p>
          </div>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <audio
          ref={audioRef}
          src={audio.url}
          volume={volume}
          onError={(e) => {
            console.error('Audio error:', e);
          }}
        />

        <div className="audio-controls">
          <button 
            className="play-pause-button"
            onClick={togglePlayPause}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>

          <div className="progress-container">
            <span className="time-display current-time">
              {formatTime(currentTime)}
            </span>
            
            <div 
              className="progress-bar"
              onClick={handleSeek}
            >
              <div 
                className="progress-fill"
                style={{ width: `${progressPercentage}%` }}
              />
              <div 
                className="progress-thumb"
                style={{ left: `${progressPercentage}%` }}
              />
            </div>
            
            <span className="time-display duration">
              {formatTime(duration)}
            </span>
          </div>

          <div className="volume-container">
            <span className="volume-icon">🔊</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={handleVolumeChange}
              className="volume-slider"
            />
          </div>
        </div>

        <div className="audio-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => {
              const audioElement = audioRef.current;
              if (audioElement) {
                audioElement.currentTime = 0;
                setCurrentTime(0);
              }
            }}
          >
            ⏮️ Restart
          </button>
          
          <a 
            href={audio.url}
            download={audio.filename}
            className="btn btn-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            💾 Download
          </a>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
