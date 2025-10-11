import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import RecordingEventsTable from './RecordingEventsTable';
import ApiService from '../services/api';
import './DeviceRecordingHistory.css';

const DeviceRecordingHistory = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [recordingEvents, setRecordingEvents] = useState(location.state?.recordingEvents || []);
  const [deviceInfo, setDeviceInfo] = useState(location.state?.deviceInfo || null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [loading, setLoading] = useState(!location.state?.recordingEvents);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventsResponse, deviceResponse, audioResponse] = await Promise.all([
          ApiService.getDeviceRecordingEvents(deviceId).catch(err => {
            console.error('getDeviceRecordingEvents failed:', err);
            throw new Error(`Recording events API failed: ${err.message}`);
          }),
          location.state?.deviceInfo ? 
            Promise.resolve({ data: location.state.deviceInfo }) : 
            ApiService.getDeviceDetails(deviceId).catch(err => {
              console.error('getDeviceDetails failed:', err);
              throw new Error(`Device details API failed: ${err.message}`);
            }),
          ApiService.getDeviceAudioFiles(deviceId).catch(err => {
            console.error('getDeviceAudioFiles failed:', err);
            throw new Error(`Audio files API failed: ${err.message}`);
          })
        ]);

        setRecordingEvents(eventsResponse.data?.data || eventsResponse.data || []);
        setDeviceInfo(deviceResponse.data);
        setAudioFiles(audioResponse.data?.audio_files || []);
        setError(null);
      } catch (err) {
        const errorMsg = `Failed to load recording events data: ${err.message}`;
        setError(errorMsg);
        console.error('DeviceRecordingHistory: Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    // If no state data (direct URL access), fetch from API
    if (!location.state?.recordingEvents) {
      fetchData();
    }

    // Continue real-time polling regardless
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [deviceId, location.state]);

  // Handler for data refresh after deletions
  const handleDataChange = async () => {
    try {
      const eventsResponse = await ApiService.getDeviceRecordingEvents(deviceId);
      setRecordingEvents(eventsResponse.data);
    } catch (err) {
      console.error('Error refreshing recording events:', err);
    }
  };

  if (loading) {
    return (
      <div className="device-recording-history-container">
        <div className="loading-recording">
          <div className="spinner"></div>
          <p>Loading recording events...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-recording-history-container">
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
    <div className="device-recording-history-container">
      {/* Header */}
      <div className="recording-history-header">
        <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
          ← Back to Device Details
        </button>
        <div className="recording-history-title">
          <h1>🎵 Device Recording Events</h1>
          <p>Device: {deviceId}</p>
          {deviceInfo && (
            <div className="device-status-info">
              <span className="recording-count">
                {recordingEvents.length} recording events
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Recording Events Table */}
      <div className="recording-table-section">
        {Array.isArray(recordingEvents) && recordingEvents.length > 0 ? (
          <RecordingEventsTable 
            data={recordingEvents} 
            deviceId={deviceId}
            audioFiles={audioFiles}
            onDataChange={handleDataChange}
          />
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
            <h3>No recording events found</h3>
            <p>This device has no recording events in its history.</p>
            <button onClick={() => window.location.reload()} className="btn btn-secondary">
              Refresh Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceRecordingHistory;
