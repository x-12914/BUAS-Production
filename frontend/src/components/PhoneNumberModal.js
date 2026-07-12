import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2 } from 'lucide-react';

const PhoneNumberModal = ({
  isOpen,
  onClose,
  onSave,
  initialPhoneNumbers = [],
  deviceId
}) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const userClearedInput = useRef(false);

  useEffect(() => {
    if (isOpen) {
      // Initialize with existing phone numbers only when modal opens
      setPhoneInput(initialPhoneNumbers.join(', '));
      setError('');
      userClearedInput.current = false; // Reset the clear flag when modal opens
    }
  }, [isOpen]); // Only depend on isOpen, not initialPhoneNumbers

  // Separate effect to handle phone numbers update when modal is already open
  useEffect(() => {
    if (isOpen && initialPhoneNumbers.length > 0 && !userClearedInput.current) {
      // Only update if the input is empty and user hasn't manually cleared it
      if (!phoneInput.trim()) {
        setPhoneInput(initialPhoneNumbers.join(', '));
      }
    }
  }, [initialPhoneNumbers, isOpen]);

  const validatePhoneNumber = (phone) => {
    // Remove all non-digit characters except + at the beginning
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // Nigerian phone number patterns (priority)
    const nigerianPatterns = [
      /^0[789][01]\d{8}$/,           // 08012345678, 07012345678, 09012345678
      /^234[789][01]\d{8}$/,         // 2348012345678, 2347012345678, 2349012345678
      /^\+234[789][01]\d{8}$/,       // +2348012345678, +2347012345678, +2349012345678
    ];

    // Check Nigerian patterns first (priority)
    for (const pattern of nigerianPatterns) {
      if (pattern.test(cleaned)) {
        return true;
      }
    }

    // International patterns (fallback) - but exclude numbers that start with 234 (Nigerian country code)
    if (!cleaned.startsWith('234')) {
      const internationalPatterns = [
        /^\+[1-9]\d{6,14}$/,           // +1234567890 (international with country code)
        /^[1-9]\d{9,14}$/,             // 1234567890 (without country code, 10-15 digits total)
      ];

      for (const pattern of internationalPatterns) {
        if (pattern.test(cleaned)) {
          return true;
        }
      }
    }

    return false;
  };

  const parsePhoneNumbers = (input) => {
    return input.split(',')
      .map(num => num.trim())
      .filter(num => num.length > 0);
  };

  const handleSave = async () => {
    setError('');

    // Allow empty input to remove all numbers
    const phoneNumbers = phoneInput.trim() ? parsePhoneNumbers(phoneInput) : [];

    // Validate each phone number
    for (const phone of phoneNumbers) {
      if (!validatePhoneNumber(phone)) {
        setError(`Invalid phone number format: ${phone}. Nigerian formats: 08012345678, 2348012345678, +2348012345678. International: +1234567890`);
        return;
      }
    }

    setLoading(true);
    try {
      await onSave(phoneNumbers);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save phone numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setPhoneInput('');
    setError('');
    userClearedInput.current = false; // Reset the clear flag when closing
    onClose();
  };

  const handleClearAll = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPhoneInput('');
    setError('');
    userClearedInput.current = true; // Mark that user manually cleared the input
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-surface-overlay border border-surface-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-lg font-display font-semibold text-content">Phone Numbers</h2>
          <button
            className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
            onClick={handleClose}
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div className="space-y-1">
            <label htmlFor="phoneInput" className="text-sm font-medium text-content-secondary">
              Enter phone number(s) for device: <span className="font-semibold text-content">{deviceId}</span>
            </label>
            <input
              id="phoneInput"
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="e.g., 08012345678, 2348012345678, +2348012345678"
              className="w-full px-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="bg-surface-raised border border-surface-border rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-content-secondary">Nigerian Phone Numbers:</p>
            <ul className="text-xs text-content-muted space-y-0.5 list-disc list-inside">
              <li>Local format: 08012345678, 07012345678, 09012345678</li>
              <li>With country code: 2348012345678, 2347012345678</li>
              <li>International format: +2348012345678, +2347012345678</li>
            </ul>
            <p className="text-xs font-medium text-content-secondary mt-2">International Numbers:</p>
            <ul className="text-xs text-content-muted space-y-0.5 list-disc list-inside">
              <li>With country code: +1234567890, +44123456789</li>
              <li>Separate multiple numbers with commas</li>
            </ul>
          </div>

          {error && (
            <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-surface-border">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearAll}
              disabled={loading}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 transition-colors flex items-center gap-1.5"
              title="Clear all phone numbers"
            >
              <Trash2 size={14} />
              Clear All
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Phone Numbers'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneNumberModal;
