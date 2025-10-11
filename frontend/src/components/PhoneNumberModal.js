import React, { useState, useEffect, useRef } from 'react';
import './PhoneNumberModal.css';

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
    <div className="phone-modal-overlay" onClick={handleClose}>
      <div className="phone-modal" onClick={(e) => e.stopPropagation()}>
        <div className="phone-modal-header">
          <h3>📞 Phone Numbers</h3>
          <button 
            className="phone-modal-close-btn" 
            onClick={handleClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        <div className="phone-modal-body">
          <div className="phone-input-section">
            <label htmlFor="phoneInput">
              Enter phone number(s) for device: <strong>{deviceId}</strong>
            </label>
            <input
              id="phoneInput"
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="e.g., 08012345678, 2348012345678, +2348012345678"
              className="phone-input-field"
              disabled={loading}
              autoFocus
            />
            <div className="phone-input-help">
              <p>🇳🇬 <strong>Nigerian Phone Numbers:</strong></p>
              <ul>
                <li>Local format: 08012345678, 07012345678, 09012345678</li>
                <li>With country code: 2348012345678, 2347012345678</li>
                <li>International format: +2348012345678, +2347012345678</li>
              </ul>
              <p>🌍 <strong>International Numbers:</strong></p>
              <ul>
                <li>With country code: +1234567890, +44123456789</li>
                <li>Separate multiple numbers with commas</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="phone-modal-error">
              <span>⚠️ {error}</span>
            </div>
          )}
        </div>

        <div className="phone-modal-actions">
          <button 
            onClick={handleClose} 
            disabled={loading}
            className="phone-modal-cancel-btn"
          >
            Cancel
          </button>
          <div className="phone-modal-right-actions">
            <button 
              onClick={handleClearAll}
              disabled={loading}
              className="phone-modal-clear-btn"
              title="Clear all phone numbers"
            >
              🗑️ Clear All
            </button>
            <button 
              onClick={handleSave}
            disabled={loading}
              className="phone-modal-save-btn"
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
