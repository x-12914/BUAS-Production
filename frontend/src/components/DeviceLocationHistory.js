import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import LocationTable from './LocationTable';
import ApiService from '../services/api';
import './DeviceLocationHistory.css';

const DeviceLocationHistory = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [locationData, setLocationData] = useState(location.state?.locationData || []);
  const [deviceInfo, setDeviceInfo] = useState(location.state?.deviceInfo || null);
  const [loading, setLoading] = useState(!location.state?.locationData);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [locationResponse, deviceResponse] = await Promise.all([
          ApiService.getDeviceLocationHistory(deviceId, { per_page: 10000 }),
          location.state?.deviceInfo ? Promise.resolve({ data: location.state.deviceInfo }) : ApiService.getDeviceDetails(deviceId)
        ]);

        setLocationData(locationResponse.data);
        setDeviceInfo(deviceResponse.data);
        setError(null);
      } catch (err) {
        setError('Failed to load location data');
        console.error('Error fetching location data:', err);
      } finally {
        setLoading(false);
      }
    };

    // If no state data (direct URL access), fetch from API
    if (!location.state?.locationData) {
      fetchData();
    }

    // Continue real-time polling regardless
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [deviceId, location.state]);

  // Handler for data refresh after deletions
  const handleDataChange = async () => {
    try {
      const locationResponse = await ApiService.getDeviceLocationHistory(deviceId, { per_page: 10000 });
      setLocationData(locationResponse.data);
    } catch (err) {
      console.error('Error refreshing location data:', err);
    }
  };

  if (loading) {
    return (
      <div className="device-location-history-container">
        <div className="loading-location">
          <div className="spinner"></div>
          <p>Loading location history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-location-history-container">
        <div className="error-state">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate(`/device/${deviceId}`)} className="btn btn-secondary">
            ← Back to Device Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="device-location-history-container">
      {/* Header */}
      <div className="location-history-header">
        <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
          ← Back to Device Details
        </button>
        <div className="location-history-title">
          <h1>📍 Device Location History</h1>
          <p>Device: {deviceId}</p>
          {deviceInfo && (
            <div className="device-status-info">
              {/* Status badge removed - not needed */}
            </div>
          )}
        </div>
      </div>

      {/* Location Table */}
      <div className="location-table-section">
        <LocationTable 
          data={locationData} 
          deviceId={deviceId}
          onDataChange={handleDataChange}
        />
      </div>
    </div>
  );
};

export default DeviceLocationHistory;
