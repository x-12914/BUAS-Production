import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

// Fix for default markers in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom colored icons
const createColoredIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          background-color: white;
          width: 6px;
          height: 6px;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
};

const DeviceMarker = ({ device, formatTimestamp, getTimestampStatus, onDeviceClick }) => {
  if (!device.location || !device.location.lat || !device.location.lng) {
    return null;
  }

  const status = getTimestampStatus(device.timestamp);
  const timestampDisplay = formatTimestamp(device.timestamp);

  // Color mapping based on timestamp freshness
  const colorMap = {
    fresh: '#22c55e',    // Green
    caution: '#f59e0b',  // Yellow
    stale: '#ef4444',    // Red
    unknown: '#6b7280'   // Gray
  };

  const markerColor = colorMap[status];
  const icon = createColoredIcon(markerColor);

  const handleMarkerClick = () => {
    if (onDeviceClick) {
      onDeviceClick(device);
    }
  };

  return (
    <Marker
      position={[device.location.lat, device.location.lng]}
      icon={icon}
      eventHandlers={{
        click: handleMarkerClick
      }}
    >
      <Popup>
        <div style={{ minWidth: '200px' }}>
          <div style={{ 
            fontWeight: 'bold', 
            fontSize: '14px', 
            marginBottom: '8px',
            color: '#1f2937'
          }}>
            {device.deviceId}
          </div>
          
          <div style={{ 
            fontSize: '12px', 
            color: '#6b7280',
            marginBottom: '4px' 
          }}>
            Last seen: {timestampDisplay}
          </div>
          
          <div style={{ 
            fontSize: '11px', 
            color: '#9ca3af' 
          }}>
            Location: {device.location.lat.toFixed(6)}, {device.location.lng.toFixed(6)}
          </div>
          
          <div style={{
            marginTop: '8px',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '500',
            backgroundColor: markerColor,
            color: 'white',
            textAlign: 'center'
          }}>
            {status.toUpperCase()}
          </div>

          {device.error && (
            <div style={{
              marginTop: '4px',
              fontSize: '10px',
              color: '#ef4444',
              fontStyle: 'italic'
            }}>
              Warning: {device.error}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export default DeviceMarker;
