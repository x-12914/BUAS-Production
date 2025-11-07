import React, { useCallback, useEffect, useRef, useState } from 'react';
import LiveAudioPlayer from './LiveAudioPlayer';
import './DeviceCardListenControl.css';

let activeListenSession = null;

const DeviceCardListenControl = ({ deviceId, deviceName, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const containerRef = useRef(null);

  const isListening = isOpen;
  const isBusy = status === 'connecting' || status === 'waiting';

  const closePopover = useCallback(() => {
    setIsOpen(false);
    setStatus('idle');
    if (activeListenSession?.deviceId === deviceId) {
      activeListenSession = null;
    }
  }, [deviceId]);

  const handleToggle = (event) => {
    event.stopPropagation();
    if (disabled) return;

    if (isOpen) {
      closePopover();
    } else {
      setIsOpen(true);
      setStatus('connecting');
      if (activeListenSession && activeListenSession.deviceId !== deviceId) {
        activeListenSession.close();
      }
      activeListenSession = { deviceId, close: closePopover };
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (!containerRef.current) return;

      if (!containerRef.current.contains(event.target)) {
        closePopover();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closePopover();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closePopover]);

  useEffect(() => {
    return () => {
      if (activeListenSession?.deviceId === deviceId) {
        activeListenSession = null;
      }
    };
  }, [deviceId]);

  const getButtonLabel = () => {
    if (!isListening) {
      return 'Listen Live';
    }

    switch (status) {
      case 'connecting':
        return 'Cancel Connection';
      case 'waiting':
        return 'Cancel Request';
      case 'active':
        return 'Stop Listening';
      case 'error':
        return 'Close Player';
      default:
        return 'Stop Listening';
    }
  };

  const buttonLabel = getButtonLabel();

  useEffect(() => {
    if (!isOpen) return;
    if (status === 'stopped') {
      closePopover();
    }
  }, [status, isOpen, closePopover]);

  return (
    <div className="listen-live-control" ref={containerRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`listen-live-btn ${isListening ? 'active' : ''} ${isBusy ? 'busy' : ''}`}
        onClick={handleToggle}
        disabled={disabled}
        title={disabled ? 'Action disabled while dashboard is loading' : buttonLabel}
      >
        <span className="listen-live-icon">🎧</span>
        <span className="listen-live-text">{buttonLabel}</span>
        {isBusy && <span className="listen-live-spinner" aria-hidden="true"></span>}
      </button>

      {isOpen && (
        <div className="listen-live-popover" role="dialog">
          <div className="listen-live-popover-header">
            <span className="popover-icon">🎧</span>
            <div className="popover-title">{deviceName || deviceId}</div>
          </div>
          <LiveAudioPlayer
            deviceId={deviceId}
            variant="compact"
            onClose={closePopover}
            onStatusChange={setStatus}
          />
        </div>
      )}
    </div>
  );
};

export default DeviceCardListenControl;
