import { useState, useCallback } from 'react';
import ApiService from '../services/api';

export const useMapData = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch device locations by IDs
  const fetchDeviceLocations = useCallback(async (deviceIds) => {
    if (!deviceIds || deviceIds.length === 0) {
      setDevices([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const devicePromises = deviceIds.map(async (deviceId) => {
        try {
          const locationHistory = await ApiService.getDeviceLocationHistory(deviceId.trim());
          const latestLocation = locationHistory.data && locationHistory.data.length > 0 
            ? locationHistory.data[0] 
            : null;

          return {
            deviceId: deviceId.trim(),
            location: latestLocation?.location || null,
            timestamp: latestLocation?.timestamp || null,
            isOnline: latestLocation ? true : false
          };
        } catch (err) {
          console.warn(`Failed to fetch location for device ${deviceId}:`, err);
          return {
            deviceId: deviceId.trim(),
            location: null,
            timestamp: null,
            isOnline: false,
            error: err.message
          };
        }
      });

      const deviceData = await Promise.all(devicePromises);
      setDevices(deviceData.filter(device => device.location)); // Only show devices with valid locations
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to fetch device locations');
      console.error('Error fetching device locations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Get timestamp freshness status
  const getTimestampStatus = useCallback((timestamp) => {
    if (!timestamp) return 'unknown';
    
    const now = new Date();
    const deviceTime = new Date(timestamp);
    const diffMinutes = Math.floor((now - deviceTime) / (1000 * 60));

    if (diffMinutes <= 20) return 'fresh';      // Green
    if (diffMinutes <= 60) return 'caution';   // Yellow
    return 'stale';                             // Red
  }, []);

  // Format timestamp for display
  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown';
    
    const now = new Date();
    const deviceTime = new Date(timestamp);
    const diffMinutes = Math.floor((now - deviceTime) / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }, []);

  return {
    devices,
    loading,
    error,
    lastUpdated,
    fetchDeviceLocations,
    getTimestampStatus,
    formatTimestamp
  };
};

export default useMapData;
