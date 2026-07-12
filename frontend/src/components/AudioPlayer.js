import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Square, RotateCcw, Download, Volume2, X } from 'lucide-react';

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-display font-semibold text-content truncate">
              {audio.filename}
            </h3>
            <p className="text-sm text-content-secondary mt-1">
              Device: {audio.user}
            </p>
          </div>
          <button
            className="p-2 rounded-lg border border-surface-border text-content-secondary hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors flex-shrink-0"
            onClick={onClose}
          >
            <X size={16} />
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

        {/* Controls */}
        <div className="flex items-center gap-3 mb-4">
          <button
            className="p-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
            onClick={togglePlayPause}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-mono text-content-muted min-w-[36px] text-center">
              {formatTime(currentTime)}
            </span>

            <div
              className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden cursor-pointer group relative"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-100"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>

            <span className="text-xs font-mono text-content-muted min-w-[36px] text-center">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 mb-4">
          <Volume2 size={14} className="text-content-muted flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-surface-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-center">
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
            onClick={() => {
              const audioElement = audioRef.current;
              if (audioElement) {
                audioElement.currentTime = 0;
                setCurrentTime(0);
              }
            }}
          >
            <RotateCcw size={14} /> Restart
          </button>

          <a
            href={audio.url}
            download={audio.filename}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={14} /> Download
          </a>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
