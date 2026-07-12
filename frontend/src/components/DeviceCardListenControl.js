import React, { useCallback, useEffect, useRef, useState } from 'react';
import LiveAudioPlayer from './LiveAudioPlayer';
import { Headphones } from 'lucide-react';

let activeListenSession = null;

const DeviceCardListenControl = ({ deviceId, deviceName, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const [popoverStyles, setPopoverStyles] = useState({ top: 0, width: 0 });
  const updatePositions = useCallback(() => {
    const card = containerRef.current?.closest('.user-card');
    if (!card) return;

    const cardRect = card.getBoundingClientRect();
    const header = card.querySelector('.user-header');
    const headerRect = header ? header.getBoundingClientRect() : cardRect;
    const topOffset = Math.max(headerRect.bottom - cardRect.top - 12, 0);
    const padding = 16;
    const minWidth = 220;
    const maxWidth = 280;
    const availableWidth = cardRect.width - padding * 2;
    const width = Math.max(Math.min(availableWidth, maxWidth), minWidth);
    const left = Math.max((cardRect.width - width) / 2, padding);

    setPopoverStyles({
      top: topOffset + 8,
      width,
      left,
    });

    if (overlayRef.current) {
      Object.assign(overlayRef.current.style, {
        position: 'absolute',
        top: `${topOffset}px`,
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '1500',
      });
    }
  }, []);

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
    if (disabled || isOpen) return;

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

  const getButtonLabel = () => {
    if (!isListening) {
      return 'Listen Live';
    }

    if (status === 'active') {
      return 'Listening...';
    }

    if (status === 'connecting' || status === 'waiting') {
      return 'Connecting...';
    }

    if (status === 'error') {
      return 'Stream Error';
    }

    return 'Listen Live';
  };

  const buttonLabel = getButtonLabel();

  useEffect(() => {
    if (!isOpen) return;
    if (status === 'stopped') {
      closePopover();
    }
  }, [status, isOpen, closePopover]);

  useEffect(() => {
    const cleanup = () => {
      if (activeListenSession?.deviceId === deviceId) {
        activeListenSession = null;
      }
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
    };

    if (!isOpen) {
      cleanup();
      return undefined;
    }

    const card = containerRef.current?.closest('.user-card');
    if (!card) return cleanup;

    if (!overlayRef.current) {
      overlayRef.current = document.createElement('div');
      overlayRef.current.className = 'listen-live-overlay';
      card.appendChild(overlayRef.current);
    }

    overlayRef.current.addEventListener('click', closePopover);
    updatePositions();

    window.addEventListener('resize', updatePositions);
    window.addEventListener('scroll', updatePositions, true);

    return () => {
      overlayRef.current?.removeEventListener('click', closePopover);
      window.removeEventListener('resize', updatePositions);
      window.removeEventListener('scroll', updatePositions, true);
      cleanup();
    };
  }, [isOpen, deviceId, updatePositions, closePopover]);

  return (
    <div className="relative inline-flex" ref={containerRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
          isListening
            ? 'opacity-0 pointer-events-none'
            : 'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20'
        } ${isBusy ? 'animate-pulse' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={handleToggle}
        disabled={disabled || isOpen}
        title={disabled ? 'Action disabled while dashboard is loading' : buttonLabel}
      >
        <Headphones size={14} className="mr-1.5" />
        <span>{buttonLabel}</span>
        {isBusy && <span className="ml-1.5 w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" aria-hidden="true"></span>}
      </button>

      {isOpen && (
        <div
          className="absolute z-[2000] bg-surface-overlay border border-surface-border rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          style={{ top: popoverStyles.top, width: popoverStyles.width, left: popoverStyles.left }}
          onClick={(event) => event.stopPropagation()}
        >
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
