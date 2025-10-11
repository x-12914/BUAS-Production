import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import DeviceMarker from './DeviceMarker';
import useMapData from '../hooks/useMapData';
import 'leaflet/dist/leaflet.css';
import './MapComponent.css';

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
    <div className="map-component">
      <div className="map-container">
        <MapContainer
          ref={mapRef}
          center={nigeriaCenter}
          zoom={defaultZoom}
          style={{ height: '500px', width: '100%' }}
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
          <div className="map-loading-overlay">
            <div className="map-loading-content">
              <div className="loading-spinner"></div>
              <span>Loading device locations...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="map-error-overlay">
            <div className="map-error-content">
              <span>⚠️ {error}</span>
            </div>
          </div>
        )}
      </div>

      {/* Map Legend */}
      <div className="map-legend">
        <h4>Location Status</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color fresh"></div>
            <span>Fresh (0-20 min)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color caution"></div>
            <span>Caution (20-60 min)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color stale"></div>
            <span>Stale (60+ min)</span>
          </div>
        </div>
      </div>

      {/* Map Info */}
      {devices.length > 0 && (
        <div className="map-info">
          <p>
            Showing {devices.length} device{devices.length !== 1 ? 's' : ''} on map
          </p>
          {searchedDevices && searchedDevices.length !== devices.length && (
            <p className="warning-text">
              ⚠️ {searchedDevices.length - devices.length} device(s) not found or have no location data
            </p>
          )}
        </div>
      )}

      {searchedDevices && searchedDevices.length > 0 && devices.length === 0 && !loading && (
        <div className="no-devices-message">
          <p>No devices found with valid location data.</p>
          <p>Please check that the device IDs are correct and the devices have reported their locations.</p>
        </div>
      )}

      {(!searchedDevices || searchedDevices.length === 0) && !loading && (
        <div className="empty-map-message">
          <h3>Device Location Map</h3>
          <p>Use the search above to find and display device locations on the map.</p>
          <p>You can search for multiple devices by entering their IDs.</p>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
