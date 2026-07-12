import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import LocationTable from './LocationTable';
import ApiService from '../services/api';
import { MapPin, AlertTriangle, ArrowLeft } from 'lucide-react';

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
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading location history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-danger flex items-center justify-center gap-2">
            <AlertTriangle size={20} /> Error
          </h2>
          <p className="text-sm text-content-secondary mt-2">{error}</p>
          <button onClick={() => navigate(`/device/${deviceId}`)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:text-content hover:bg-surface-hover transition-colors">
            <ArrowLeft size={16} /> Back to Device Details
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <button onClick={() => navigate(`/device/${deviceId}`)} className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors">
          <ArrowLeft size={16} /> Back to Device Details
        </button>
        <div>
          <h1 className="text-xl font-display font-semibold text-content flex items-center gap-2">
            <MapPin size={22} /> Device Location History
          </h1>
          <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
        </div>
      </div>

      {/* Location Table */}
      <div>
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
