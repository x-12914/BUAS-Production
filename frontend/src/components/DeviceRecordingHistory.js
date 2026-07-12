import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Mic } from 'lucide-react';
import RecordingEventsTable from './RecordingEventsTable';
import ApiService from '../services/api';

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
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading recording events...</p>
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
            <Mic size={22} /> Device Recording Events
          </h1>
          <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
          {deviceInfo && (
            <span className="text-xs text-content-secondary mt-1 inline-block">
              {recordingEvents.length} recording events
            </span>
          )}
        </div>
      </div>

      {/* Recording Events Table */}
      <div>
        {Array.isArray(recordingEvents) && recordingEvents.length > 0 ? (
          <RecordingEventsTable
            data={recordingEvents}
            deviceId={deviceId}
            audioFiles={audioFiles}
            onDataChange={handleDataChange}
          />
        ) : (
          <div className="bg-surface-raised border border-surface-border rounded-xl p-10 text-center">
            <h3 className="text-sm font-medium text-content-secondary">No recording events found</h3>
            <p className="text-xs text-content-muted mt-1">This device has no recording events in its history.</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:text-content hover:bg-surface-hover transition-colors">
              Refresh Data
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceRecordingHistory;
