import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import ApiService from '../services/api';

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
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-display font-semibold text-content">Device Location Search</h3>
        <p className="text-xs text-content-muted mt-0.5">Enter device IDs to view their locations on the map</p>
      </div>

      <div className="relative">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder="Type device ID (e.g., device123)"
            className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            disabled={loading}
          />
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef} className="absolute z-30 w-full mt-1 bg-surface-overlay border border-surface-border rounded-lg shadow-xl overflow-hidden">
            {suggestions.map((device) => (
              <div
                key={device.id}
                className="px-3 py-2 hover:bg-surface-hover cursor-pointer transition-colors"
                onClick={() => handleSuggestionClick(device)}
              >
                <div className="text-sm text-content">
                  {device.display_name || device.id}
                </div>
                {device.display_name && device.display_name !== device.id && (
                  <div className="text-xs text-content-muted">
                    ID: {device.id}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedDevices.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-content-secondary">Selected Devices ({selectedDevices.length})</span>
            <button onClick={clearAll} className="text-xs font-medium text-danger hover:text-danger/80 transition-colors">
              Clear All
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedDevices.map((deviceId) => {
              // Find the device to get its display name
              const device = availableDevices.find(d => d.id === deviceId);
              const displayName = device?.display_name || deviceId;

              return (
                <span key={deviceId} className="inline-flex items-center gap-1 px-2 py-1 bg-accent/10 border border-accent/20 rounded-md text-xs font-medium text-accent">
                  {displayName}
                  <button
                    onClick={() => removeDevice(deviceId)}
                    className="p-0.5 rounded hover:bg-accent/20 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></div>
          <span className="text-xs text-content-muted">Loading device locations...</span>
        </div>
      )}
    </div>
  );
};

export default DeviceSearch;
