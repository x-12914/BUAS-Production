import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import ApiService from '../services/api';
import 'leaflet/dist/leaflet.css';
import './DeviceDetailMap.css';

// Get the API base URL for audio links
const getApiUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.REACT_APP_VPS_URL || 'http://105.114.25.157';
  }
  return process.env.REACT_APP_API_URL || 'http://localhost:5000';
};
const API_BASE_URL = getApiUrl();

// Fix for default markers in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom icons for current and historical positions
const currentPositionIcon = L.divIcon({
  className: 'current-position-marker',
  html: `
    <div style="
      background-color: #22c55e;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 4px solid white;
      box-shadow: 0 3px 6px rgba(0,0,0,0.3);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: white;
        width: 8px;
        height: 8px;
        border-radius: 50%;
      "></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const historicalPositionIcon = L.divIcon({
  className: 'historical-position-marker',
  html: `
    <div style="
      background-color: #94a3b8;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -6],
});

// Create numbered marker function
const createNumberedIcon = (number, isLatest = false) => {
  const backgroundColor = isLatest ? '#8b5cf6' : '#3b82f6'; // Purple for latest, blue for historical
  const size = isLatest ? 32 : 28;
  
  return L.divIcon({
    className: 'numbered-position-marker',
    html: `
      <div style="
        background-color: ${backgroundColor};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: ${isLatest ? '14px' : '12px'};
        color: white;
        font-family: Arial, sans-serif;
      ">
        ${number}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -(size/2)],
  });
};

// Create recording event icons
const createRecordingStartIcon = () => {
  return L.divIcon({
    className: 'recording-start-marker',
    html: `
      <div style="
        background-color: #22c55e;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      ">
        🎤
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const createRecordingStopIcon = () => {
  return L.divIcon({
    className: 'recording-stop-marker',
    html: `
      <div style="
        background-color: #ef4444;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
      ">
        ⏹️
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const createActiveRecordingIcon = () => {
  return L.divIcon({
    className: 'active-recording-marker',
    html: `
      <div style="
        background-color: #22c55e;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        animation: pulse 2s infinite;
      ">
        🎤
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

// Create temporal layered icon for multiple events at same location
const createTemporalLayeredIcon = (events) => {
  const sortedEvents = events.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    return new Date(b.timestamp || b.startTime) - new Date(a.timestamp || a.startTime);
  });
  
  const primaryEvent = sortedEvents[0];
  const hasSecondaryEvents = sortedEvents.length > 1;
  
  // Color mapping for primary event
  const getPrimaryColor = (event) => {
    if (event.type === 'recording') {
      return event.isActive ? '#22c55e' : '#22c55e'; // Green for all recordings
    }
    if (event.type === 'location') {
      return event.isLatest ? '#8b5cf6' : '#3b82f6'; // Purple for latest, blue for historical
    }
    return '#6b7280'; // Gray fallback
  };
  
  const getIconForType = (event) => {
    if (event.type === 'recording') {
      return '🎤';
    }
    if (event.type === 'location') {
      return '📍';
    }
    return '❓';
  };
  
  return L.divIcon({
    className: 'temporal-layered-marker',
    html: `
      <div style="position: relative;">
        <!-- Primary event -->
        <div style="
          background-color: ${getPrimaryColor(primaryEvent)};
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 3px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.3);
        ">
          ${getIconForType(primaryEvent)}
        </div>
        
        <!-- Secondary events badge -->
        ${hasSecondaryEvents ? `
          <div style="
            position: absolute;
            top: -5px;
            right: -5px;
            background-color: #f59e0b;
            color: white;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
            border: 2px solid white;
          ">
            ${sortedEvents.length}
          </div>
        ` : ''}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const DeviceDetailMap = ({ deviceId }) => {
  const [locationHistory, setLocationHistory] = useState([]);
  const [recordingEvents, setRecordingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('24h'); // 24h, 7d, 30d
  const [showLocations, setShowLocations] = useState(true);
  const [showRecordings, setShowRecordings] = useState(true);

  // Fetch both location history and recording events
  useEffect(() => {
    const fetchMapData = async () => {
      if (!deviceId) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch both location and recording data in parallel
        const [locationResponse, recordingResponse] = await Promise.allSettled([
          ApiService.getDeviceLocationHistory(deviceId, { per_page: 10000 }),
          ApiService.getDeviceRecordingEvents(deviceId)
        ]);

        // Process location data
        if (locationResponse.status === 'fulfilled' && locationResponse.value.data && Array.isArray(locationResponse.value.data)) {
          // Filter based on time range and significant movements
          const now = new Date();
          const timeRangeHours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
          const cutoffTime = new Date(now.getTime() - timeRangeHours * 60 * 60 * 1000);

          let filteredHistory = locationResponse.value.data.filter(location => {
            const locationTime = new Date(location.timestamp);
            return locationTime >= cutoffTime;
          });

          // Filter for significant movements (>100 meters apart)
          const significantMovements = [];
          if (filteredHistory.length > 0) {
            significantMovements.push(filteredHistory[0]); // Always include first position

            for (let i = 1; i < filteredHistory.length; i++) {
              const prev = significantMovements[significantMovements.length - 1];
              const current = filteredHistory[i];
              
              const distance = calculateDistance(
                prev.location.lat, prev.location.lng,
                current.location.lat, current.location.lng
              );

              // Include if moved more than 100 meters
              if (distance > 0.1) { // 0.1 km = 100 meters
                significantMovements.push(current);
              }
            }
          }

          const chronologicalMovements = [...significantMovements].reverse();

          const enhancedHistory = chronologicalMovements.map((location, index, arr) => {
            const previous = index > 0 ? arr[index - 1] : null;
            const next = index < arr.length - 1 ? arr[index + 1] : null;

            let distanceFromPreviousMeters = null;
            if (previous) {
              const distanceKm = calculateDistance(
                previous.location.lat, previous.location.lng,
                location.location.lat, location.location.lng
              );
              distanceFromPreviousMeters = distanceKm * 1000;
            }

            let stayDurationMs = null;
            if (location.timestamp) {
              const currentTimestamp = new Date(location.timestamp);
              if (next && next.timestamp) {
                stayDurationMs = new Date(next.timestamp) - currentTimestamp;
              } else {
                stayDurationMs = Date.now() - currentTimestamp.getTime();
              }
              if (stayDurationMs < 0) {
                stayDurationMs = 0;
              }
            }

            return {
              ...location,
              distanceFromPreviousMeters,
              stayDurationMs
            };
          });

          setLocationHistory(enhancedHistory);
        } else {
          setLocationHistory([]);
        }

        // Process recording events
        if (recordingResponse.status === 'fulfilled' && recordingResponse.value.data && Array.isArray(recordingResponse.value.data)) {
          // Filter recording events by time range
          const now = new Date();
          const timeRangeHours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
          const cutoffTime = new Date(now.getTime() - timeRangeHours * 60 * 60 * 1000);

          const filteredRecordings = recordingResponse.value.data.filter(event => {
            const eventTime = new Date(event.start_timestamp || `${event.start_date}T${event.start_time}`);
            return eventTime >= cutoffTime;
          });

          setRecordingEvents(filteredRecordings);
        } else {
          setRecordingEvents([]);
        }

      } catch (err) {
        setError('Failed to load map data');
        console.error('Error fetching map data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMapData();
    
    // Refresh every 5 minutes to match location upload frequency
    const interval = setInterval(fetchMapData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [deviceId, timeRange]);

  // Calculate distance between two points in kilometers
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in kilometers
    return d;
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (durationMs) => {
    if (durationMs === null || durationMs === undefined || Number.isNaN(durationMs)) {
      return 'N/A';
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    if (totalSeconds <= 0) {
      return '< 1s';
    }

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!days && !hours && !minutes) parts.push(`${seconds}s`);

    return parts.join(' ');
  };

  const formatDistance = (meters) => {
    if (meters === null || meters === undefined || Number.isNaN(meters)) {
      return 'N/A';
    }

    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }

    return `${Math.round(meters)} m`;
  };

  // Group events by location (with small tolerance for GPS drift)
  const groupEventsByLocation = () => {
    const allEvents = [];
    
    // Add location events
    if (showLocations) {
      locationHistory.forEach((location, index) => {
        allEvents.push({
          ...location,
          type: 'location',
          isLatest: index === locationHistory.length - 1,
          lat: location.location.lat,
          lng: location.location.lng
        });
      });
    }
    
    // Add recording events
    if (showRecordings) {
      recordingEvents.forEach(event => {
        // Add start location
        allEvents.push({
          ...event,
          type: 'recording',
          lat: event.start_latitude,
          lng: event.start_longitude,
          isActive: !event.stop_timestamp,
          startTime: event.start_timestamp || `${event.start_date}T${event.start_time}`,
          duration: event.stop_timestamp ? 
            Math.round((new Date(event.stop_timestamp) - new Date(event.start_timestamp || `${event.start_date}T${event.start_time}`)) / 1000 / 60) : null
        });
        
        // Add stop location if different from start
        if (event.stop_latitude && event.stop_longitude) {
          const startLat = parseFloat(event.start_latitude);
          const startLng = parseFloat(event.start_longitude);
          const stopLat = parseFloat(event.stop_latitude);
          const stopLng = parseFloat(event.stop_longitude);
          
          // Only add stop marker if it's significantly different from start
          const distance = calculateDistance(startLat, startLng, stopLat, stopLng);
          if (distance > 0.01) { // More than 10 meters apart
            allEvents.push({
              ...event,
              type: 'recording_stop',
              lat: event.stop_latitude,
              lng: event.stop_longitude,
              isActive: false,
              startTime: event.start_timestamp || `${event.start_date}T${event.start_time}`,
              duration: Math.round((new Date(event.stop_timestamp) - new Date(event.start_timestamp || `${event.start_date}T${event.start_time}`)) / 1000 / 60)
            });
          }
        }
      });
    }
    
    // Group events by location with tolerance
    const grouped = {};
    const TOLERANCE = 0.0001; // ~10 meters
    
    allEvents.forEach(event => {
      const key = `${Math.round(event.lat / TOLERANCE) * TOLERANCE},${Math.round(event.lng / TOLERANCE) * TOLERANCE}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          lat: event.lat,
          lng: event.lng,
          events: []
        };
      }
      
      grouped[key].events.push(event);
    });
    
    return Object.values(grouped);
  };

  // Create popup content for recording events
  const RecordingEventPopup = ({ event }) => (
    <div style={{ minWidth: '250px' }}>
      <div style={{ 
        fontWeight: 'bold', 
        fontSize: '14px', 
        marginBottom: '8px',
        color: event.isActive ? '#22c55e' : '#ef4444'
      }}>
        🎤 Recording {event.isActive ? 'Active' : 'Completed'}
      </div>
      
      <div style={{ 
        fontSize: '12px', 
        color: '#6b7280',
        marginBottom: '4px' 
      }}>
        Started: {formatTimestamp(event.startTime)}
      </div>
      
      {event.stop_timestamp && (
        <div style={{ 
          fontSize: '12px', 
          color: '#6b7280',
          marginBottom: '4px' 
        }}>
          Stopped: {formatTimestamp(event.stop_timestamp)}
        </div>
      )}
      
      {event.duration !== null && event.duration !== undefined && (
        <div style={{ 
          fontSize: '12px', 
          color: '#6b7280',
          marginBottom: '4px' 
        }}>
          Duration: {event.duration < 1 ? `${Math.round(event.duration * 60)} seconds` : `${Math.floor(event.duration)} minutes`}
        </div>
      )}
      
      {event.audio_file_id && (
        <div style={{ 
          fontSize: '12px', 
          color: '#3b82f6',
          marginBottom: '4px' 
        }}>
          <a href={`${API_BASE_URL}/api/uploads/${event.audio_file_id}?t=${Date.now()}`} target="_blank" rel="noopener noreferrer">
            🎵 Play Audio
          </a>
        </div>
      )}
      
      <div style={{ 
        fontSize: '11px', 
        color: '#9ca3af' 
      }}>
        Location: {event.lat.toFixed(6)}, {event.lng.toFixed(6)}
      </div>
    </div>
  );

  // Create popup content for multiple events at same location
  const MultiEventPopup = ({ locationGroup }) => (
    <div style={{ minWidth: '280px' }}>
      <div style={{ 
        fontWeight: 'bold', 
        fontSize: '14px', 
        marginBottom: '8px',
        color: '#6b7280'
      }}>
        📍 Events at This Location
      </div>
      
      <div style={{ 
        fontSize: '11px', 
        color: '#9ca3af',
        marginBottom: '8px' 
      }}>
        {locationGroup.lat.toFixed(6)}°N, {locationGroup.lng.toFixed(6)}°E
      </div>
      
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {locationGroup.events
          .sort((a, b) => new Date(b.timestamp || b.startTime) - new Date(a.timestamp || a.startTime))
          .map((event, index) => (
            <div key={index} style={{ 
              marginBottom: '8px', 
              padding: '6px',
              backgroundColor: '#f9fafb',
              borderRadius: '4px',
              border: '1px solid #e5e7eb'
            }}>
              {event.type === 'location' && (
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', color: event.isLatest ? '#8b5cf6' : '#3b82f6' }}>
                    📍 Location Update {event.isLatest ? '(Latest)' : ''}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    {formatTimestamp(event.timestamp)}
                  </div>
                  {event.distanceFromPreviousMeters !== null && event.distanceFromPreviousMeters !== undefined && (
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      Distance from Previous: {formatDistance(event.distanceFromPreviousMeters)}
                    </div>
                  )}
                </div>
              )}
              {event.type === 'recording' && (
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#22c55e' }}>
                    🎤 Recording {event.isActive ? 'Active' : 'Completed'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    Started: {formatTimestamp(event.startTime)}
                  </div>
                  {event.stop_timestamp && (
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      Stopped: {formatTimestamp(event.stop_timestamp)}
                    </div>
                  )}
                  {event.duration !== null && event.duration !== undefined && (
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      Duration: {event.duration < 1 ? `${Math.round(event.duration * 60)} seconds` : `${Math.floor(event.duration)} minutes`}
                    </div>
                  )}
                  {event.audio_file_id && (
                    <div style={{ fontSize: '11px' }}>
                      <a href={`${API_BASE_URL}/api/uploads/${event.audio_file_id}?t=${Date.now()}`} target="_blank" rel="noopener noreferrer">
                        🎵 Play Audio
                      </a>
                    </div>
                  )}
                </div>
              )}
              {event.type === 'recording_stop' && (
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#ef4444' }}>
                    ⏹️ Recording Stopped
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>
                    Duration: {event.duration < 1 ? `${Math.round(event.duration * 60)} seconds` : `${Math.floor(event.duration)} minutes`}
                  </div>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );

  // Nigeria center as fallback
  const nigeriaCenter = [9.0765, 7.3986];
  
  const mapCenter = locationHistory.length > 0 
    ? [locationHistory[0].location.lat, locationHistory[0].location.lng]
    : nigeriaCenter;

  const mapZoom = locationHistory.length > 0 ? 14 : 6;

  // Prepare path for polyline (movement trail)
  const pathPositions = locationHistory.map(location => [
    location.location.lat,
    location.location.lng
  ]);

  if (loading) {
    return (
      <div className="device-detail-map-container">
        <div className="map-loading">
          <div className="loading-spinner"></div>
          <span>Loading device location history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-detail-map-container">
        <div className="map-error">
          <span>⚠️ {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="device-detail-map-container">
      <div className="map-header">
        <h3>Device Location & Recording History</h3>
        <div className="map-controls">
          <div className="time-range-selector">
            <button 
              className={timeRange === '24h' ? 'active' : ''}
              onClick={() => setTimeRange('24h')}
            >
              24 Hours
            </button>
            <button 
              className={timeRange === '7d' ? 'active' : ''}
              onClick={() => setTimeRange('7d')}
            >
              7 Days
            </button>
            <button 
              className={timeRange === '30d' ? 'active' : ''}
              onClick={() => setTimeRange('30d')}
            >
              30 Days
            </button>
          </div>
          <div className="filter-controls">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input 
                type="checkbox" 
                checked={showLocations} 
                onChange={(e) => setShowLocations(e.target.checked)}
              />
              📍 Locations
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input 
                type="checkbox" 
                checked={showRecordings} 
                onChange={(e) => setShowRecordings(e.target.checked)}
              />
              🎤 Recordings
            </label>
          </div>
        </div>
      </div>

      <div className="map-wrapper">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '400px', width: '100%' }}
          zoomControl={true}
          scrollWheelZoom={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={18}
          />

          {/* Movement trail */}
          {pathPositions.length > 1 && (
            <Polyline
              positions={pathPositions}
              color="#3b82f6"
              weight={3}
              opacity={0.7}
            />
          )}

          {/* Grouped event markers */}
          {groupEventsByLocation().map((locationGroup, groupIndex) => {
            const { lat, lng, events } = locationGroup;
            
            // If only one event, show appropriate single marker
            if (events.length === 1) {
              const event = events[0];
              
              if (event.type === 'location') {
                const locationNumber = locationHistory.findIndex(loc => 
                  loc.timestamp === event.timestamp
                ) + 1;
                const isLatest = event.isLatest;
                const numberedIcon = createNumberedIcon(locationNumber, isLatest);
                
                return (
                  <Marker
                    key={`loc-${event.timestamp}-${groupIndex}`}
                    position={[lat, lng]}
                    icon={numberedIcon}
                  >
                    <Popup>
                      <div style={{ minWidth: '200px' }}>
                        <div style={{ 
                          fontWeight: 'bold', 
                          fontSize: '14px', 
                          marginBottom: '8px',
                          color: isLatest ? '#8b5cf6' : '#3b82f6'
                        }}>
                          Point #{locationNumber} {isLatest ? '(Latest)' : ''}
                        </div>
                        
                        <div style={{ 
                          fontSize: '12px', 
                          color: '#6b7280',
                          marginBottom: '4px' 
                        }}>
                          Time: {formatTimestamp(event.timestamp)}
                        </div>
                        
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#9ca3af' 
                        }}>
                          Location: {lat.toFixed(6)}, {lng.toFixed(6)}
                        </div>

                        {event.distanceFromPreviousMeters !== null && event.distanceFromPreviousMeters !== undefined && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#6b7280'
                          }}>
                            Distance from Previous: {formatDistance(event.distanceFromPreviousMeters)}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              } else if (event.type === 'recording' || event.type === 'recording_stop') {
                const icon = event.isActive ? createActiveRecordingIcon() : 
                           event.type === 'recording_stop' ? createRecordingStopIcon() : 
                           createRecordingStartIcon();
                
                return (
                  <Marker
                    key={`rec-${event.id}-${event.type}-${groupIndex}`}
                    position={[lat, lng]}
                    icon={icon}
                  >
                    <Popup>
                      <RecordingEventPopup event={event} />
                    </Popup>
                  </Marker>
                );
              }
            } else {
              // Multiple events at same location - use temporal layered icon
              const layeredIcon = createTemporalLayeredIcon(events);
              
              return (
                <Marker
                  key={`multi-${lat}-${lng}-${groupIndex}`}
                  position={[lat, lng]}
                  icon={layeredIcon}
                >
                  <Popup>
                    <MultiEventPopup locationGroup={locationGroup} />
                  </Popup>
                </Marker>
              );
            }
            
            return null;
          })}
        </MapContainer>
      </div>

      <div className="map-info">
        <div className="map-stats">
          {locationHistory.length > 0 && (
            <div className="stat-item">
              <span className="stat-icon">📍</span>
              <span className="stat-text">
                {locationHistory.length} location point{locationHistory.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          {recordingEvents.length > 0 && (
            <div className="stat-item">
              <span className="stat-icon">🎤</span>
              <span className="stat-text">
                {recordingEvents.length} recording event{recordingEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
        
        {locationHistory.length > 0 || recordingEvents.length > 0 ? (
          <div className="map-legend">
            <p>
              Showing data from the last {timeRange === '24h' ? '24 hours' : timeRange === '7d' ? '7 days' : '30 days'}
            </p>
            <div className="legend-items">
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#8b5cf6' }}></span>
                <span>Latest Location</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#3b82f6' }}></span>
                <span>Historical Location</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#22c55e' }}></span>
                <span>Recording Event</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#ef4444' }}></span>
                <span>Recording Stop</span>
              </div>
              <div className="legend-item">
                <span className="legend-color" style={{ backgroundColor: '#f59e0b' }}></span>
                <span>Multiple Events</span>
              </div>
            </div>
          </div>
        ) : (
          <p>No data available for the selected time range and filters.</p>
        )}
      </div>
    </div>
  );
};

export default DeviceDetailMap;
