import React, { useState, useEffect, useRef } from 'react';
import ApiService from '../services/api';
import './DeviceSearch.css';

const DeviceSearch = ({ onDevicesSelected }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Fetch available devices on component mount
  useEffect(() => {
    const fetchAvailableDevices = async () => {
      setLoading(true);
      try {
        const dashboardData = await ApiService.getDashboardData();
        if (dashboardData.users && Array.isArray(dashboardData.users)) {
          const devices = dashboardData.users.map(user => ({
            id: user.user_id || user.device_id || user.id,
            display_name: user.display_name,
            android_id: user.android_id
          })).filter(device => device.id);
          setAvailableDevices(devices);
        }
      } catch (error) {
        console.error('Failed to fetch available devices:', error);
        // Fallback to some example devices
        setAvailableDevices(['device123', 'device456', 'device789']);
      } finally {
        setLoading(false);
      }
    };

    fetchAvailableDevices();
  }, []);

  // Update suggestions based on search term
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = availableDevices
      .filter(device => {
        const searchLower = searchTerm.toLowerCase();
        return (
          (device.display_name && device.display_name.toLowerCase().includes(searchLower)) ||
          device.id.toLowerCase().includes(searchLower) ||
          (device.android_id && device.android_id.toLowerCase().includes(searchLower))
        ) && !selectedDevices.includes(device.id);
      })
      .slice(0, 10); // Limit to 10 suggestions

    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  }, [searchTerm, availableDevices, selectedDevices]);

  // Handle input change
  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle suggestion click
  const handleSuggestionClick = (device) => {
    addDevice(device.id);
  };

  // Handle input key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) {
        addDevice(suggestions[0].id);
      } else if (searchTerm.trim()) {
        addDevice(searchTerm.trim());
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Add device to selection
  const addDevice = (deviceId) => {
    const trimmedId = deviceId.trim();
    if (trimmedId && !selectedDevices.includes(trimmedId)) {
      const newSelection = [...selectedDevices, trimmedId];
      setSelectedDevices(newSelection);
      onDevicesSelected(newSelection);
    }
    setSearchTerm('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Remove device from selection
  const removeDevice = (deviceId) => {
    const newSelection = selectedDevices.filter(id => id !== deviceId);
    setSelectedDevices(newSelection);
    onDevicesSelected(newSelection);
  };

  // Clear all selections
  const clearAll = () => {
    setSelectedDevices([]);
    onDevicesSelected([]);
    setSearchTerm('');
    setShowSuggestions(false);
  };

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        inputRef.current && 
        !inputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="device-search">
      <div className="search-header">
        <h3>Device Location Search</h3>
        <p>Enter device IDs to view their locations on the map</p>
      </div>

      <div className="search-input-container">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          placeholder="Type device ID (e.g., device123)"
          className="search-input"
          disabled={loading}
        />
        
        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef} className="suggestions-dropdown">
            {suggestions.map((device) => (
              <div
                key={device.id}
                className="suggestion-item"
                onClick={() => handleSuggestionClick(device)}
              >
                <div className="suggestion-main">
                  {device.display_name || device.id}
                </div>
                {device.display_name && device.display_name !== device.id && (
                  <div className="suggestion-sub">
                    ID: {device.id}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDevices.length > 0 && (
        <div className="selected-devices">
          <div className="selected-header">
            <span>Selected Devices ({selectedDevices.length})</span>
            <button onClick={clearAll} className="clear-all-btn">
              Clear All
            </button>
          </div>
          <div className="device-tags">
            {selectedDevices.map((deviceId) => {
              // Find the device to get its display name
              const device = availableDevices.find(d => d.id === deviceId);
              const displayName = device?.display_name || deviceId;
              
              return (
                <span key={deviceId} className="device-tag">
                  {displayName}
                  <button
                    onClick={() => removeDevice(deviceId)}
                    className="remove-device-btn"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="search-loading">
          <div className="loading-spinner"></div>
          <span>Loading device locations...</span>
        </div>
      )}
    </div>
  );
};

export default DeviceSearch;
