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
        <div className="space-y-1" style={{ minWidth: '200px' }}>
          <div className="text-sm font-bold text-content">
            {device.deviceId}
          </div>

          <div className="text-xs text-content-secondary">
            Last seen: {timestampDisplay}
          </div>

          <div className="text-[11px] text-content-muted">
            Location: {device.location.lat.toFixed(6)}, {device.location.lng.toFixed(6)}
          </div>

          <div
            className="mt-2 px-2 py-1 rounded text-[11px] font-medium text-white text-center"
            style={{ backgroundColor: markerColor }}
          >
            {status.toUpperCase()}
          </div>

          {device.error && (
            <div className="mt-1 text-[10px] text-danger italic">
              Warning: {device.error}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export default DeviceMarker;
