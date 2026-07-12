import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import DeviceMarker from './DeviceMarker';
import useMapData from '../hooks/useMapData';

// Component to handle map bounds updates
const MapBoundsUpdater = ({ devices }) => {
  const map = useMap();

  useEffect(() => {
    if (devices && devices.length > 0) {
      const validDevices = devices.filter(device =>
        device.location && device.location.lat && device.location.lng
      );

      if (validDevices.length === 0) return;

      if (validDevices.length === 1) {
        // Single device - center on it
        const device = validDevices[0];
        map.setView([device.location.lat, device.location.lng], 14);
      } else {
        // Multiple devices - fit bounds to show all
        const bounds = validDevices.map(device => [
          device.location.lat,
          device.location.lng
        ]);
        map.fitBounds(bounds, { padding: [20, 20] });
      }
    }
  }, [devices, map]);

  return null;
};

const MapComponent = ({ searchedDevices, onDeviceClick }) => {
  const {
    devices,
    loading,
    error,
    fetchDeviceLocations,
    getTimestampStatus,
    formatTimestamp
  } = useMapData();

  const mapRef = useRef(null);

  // Fetch device locations when searched devices change
  useEffect(() => {
    if (searchedDevices && searchedDevices.length > 0) {
      fetchDeviceLocations(searchedDevices);
    }
  }, [searchedDevices, fetchDeviceLocations]);

  // Nigeria center coordinates
  const nigeriaCenter = [9.0765, 7.3986];
  const defaultZoom = 6;

  const handleDeviceClick = (device) => {
    if (onDeviceClick) {
      onDeviceClick(device);
    }
  };

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden shadow-lg">
      <div className="relative" style={{ height: '500px', width: '100%' }}>
        <MapContainer
          ref={mapRef}
          center={nigeriaCenter}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={18}
          />

          {devices.map((device) => (
            <DeviceMarker
              key={device.deviceId}
              device={device}
              formatTimestamp={formatTimestamp}
              getTimestampStatus={getTimestampStatus}
              onDeviceClick={handleDeviceClick}
            />
          ))}

          <MapBoundsUpdater devices={devices} />
        </MapContainer>

        {loading && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-surface/80">
            <div className="flex items-center gap-3 px-5 py-4 bg-surface-overlay border border-surface-border rounded-lg shadow-lg">
              <div className="animate-spin w-5 h-5 border-2 border-surface-border border-t-accent rounded-full"></div>
              <span className="text-sm text-content">Loading device locations...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-3 left-3 right-3 z-[1000]">
            <div className="bg-danger/10 text-danger px-4 py-3 rounded-lg border border-danger/20 text-sm">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="px-5 py-4 border-t border-surface-border bg-surface-overlay">
        <h4 className="text-sm font-semibold text-content mb-3">Location Status</h4>
        <div className="flex flex-wrap gap-5">
          <div className="flex items-center gap-2 text-xs text-content-secondary">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow-sm bg-success"></div>
            <span>Fresh (0-20 min)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-content-secondary">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow-sm bg-warning"></div>
            <span>Caution (20-60 min)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-content-secondary">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow-sm bg-danger"></div>
            <span>Stale (60+ min)</span>
          </div>
        </div>
      </div>

      {/* Map Info */}
      {devices.length > 0 && (
        <div className="px-5 py-3 border-t border-surface-border bg-surface-overlay/50 text-sm text-info">
          <p>
            Showing {devices.length} device{devices.length !== 1 ? 's' : ''} on map
          </p>
          {searchedDevices && searchedDevices.length !== devices.length && (
            <p className="text-warning mt-1">
              {searchedDevices.length - devices.length} device(s) not found or have no location data
            </p>
          )}
        </div>
      )}

      {searchedDevices && searchedDevices.length > 0 && devices.length === 0 && !loading && (
        <div className="py-10 px-5 text-center text-content-secondary">
          <p className="text-sm">No devices found with valid location data.</p>
          <p className="text-sm mt-1">Please check that the device IDs are correct and the devices have reported their locations.</p>
        </div>
      )}

      {(!searchedDevices || searchedDevices.length === 0) && !loading && (
        <div className="py-16 px-5 text-center bg-surface-overlay/50">
          <h3 className="text-lg font-semibold text-content mb-2">Device Location Map</h3>
          <p className="text-sm text-content-secondary">Use the search above to find and display device locations on the map.</p>
          <p className="text-sm text-content-secondary mt-1">You can search for multiple devices by entering their IDs.</p>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
