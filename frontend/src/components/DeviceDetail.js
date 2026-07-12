import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DeviceDetailMap from './DeviceDetailMap';
import RecordingControlButton from './RecordingControlButton';
import FallbackButton from './FallbackButton';
import PhoneNumberModal from './PhoneNumberModal';
import LiveStreamControls from './LiveStreamControls';
import ApiService from '../services/api';
import authService from '../services/authService';
import { Smartphone, PenLine, Download, Info, Battery, BatteryCharging, BatteryWarning, Cpu, MapPin, Contact, FileAudio, MessageSquare, PhoneCall, AlertTriangle, Zap, ArrowLeft, X } from 'lucide-react';

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
    contacts: [],
    platform: 'android'
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

  const isIOS = (deviceInfo?.platform === 'ios') || (deviceExtendedInfo?.platform === 'ios');
  const identifierLabel = isIOS ? 'UUID' : 'Android ID';

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
            contacts: [],
            platform: 'android'
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
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Enter phone number(s)"
            className="flex-1 px-3 py-1.5 text-sm bg-surface-overlay border border-surface-border rounded-lg text-content-muted cursor-pointer"
            readOnly
            onClick={() => setShowPhoneModal(true)}
          />
          <button
            className="p-1.5 rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover hover:text-content transition-colors"
            onClick={() => setShowPhoneModal(true)}
            title="Add phone numbers"
          >
            <PenLine size={14} />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-content">
          {currentPhoneNumbers.join(', ')}
        </span>
        <button
          className="p-1.5 rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover hover:text-content transition-colors"
          onClick={() => setShowPhoneModal(true)}
          title="Edit phone numbers"
        >
          <PenLine size={14} />
        </button>
      </div>
    );
  };

  const getBatteryColorClass = (batteryLevel) => {
    if (batteryLevel >= 60) return 'text-success';
    if (batteryLevel >= 30) return 'text-warning';
    return 'text-danger';
  };

  const getBatteryIcon = (batteryLevel, isCharging) => {
    if (isCharging) return <BatteryCharging size={14} />;
    if (batteryLevel >= 50) return <Battery size={14} />;
    return <BatteryWarning size={14} />;
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-8 h-8 border-2 border-surface-border border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-content-secondary">Loading device details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="bg-surface-raised border border-danger/30 rounded-xl p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-danger">
            <AlertTriangle size={24} />
            <h2 className="text-lg font-display font-semibold">Error</h2>
          </div>
          <p className="text-sm text-content-secondary">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Device Header Card */}
      <div className="bg-surface-raised border border-surface-border rounded-xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Smartphone size={24} className="text-accent" />
            <h1 className="text-xl font-display font-semibold text-content">
              {deviceInfo?.display_name || deviceId}
            </h1>
          </div>

          {isIOS && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-success-muted text-success font-medium uppercase tracking-wider">
              iPhone
            </span>
          )}

          {/* Battery Indicator */}
          {deviceExtendedInfo?.battery?.level !== null && deviceExtendedInfo?.battery?.level !== undefined && (
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface-overlay border border-surface-border text-xs font-mono ${getBatteryColorClass(deviceExtendedInfo.battery.level)}`}
              title={`Battery: ${deviceExtendedInfo.battery.level}%\n${deviceExtendedInfo.battery.is_charging ? `Charging via ${deviceExtendedInfo.battery.charging_method || 'Unknown'}` : 'Not charging'}\nHealth: ${deviceExtendedInfo.battery.health || 'Unknown'}${deviceExtendedInfo.battery.temperature ? `\nTemperature: ${deviceExtendedInfo.battery.temperature} C` : ''}${deviceExtendedInfo.battery.voltage ? `\nVoltage: ${deviceExtendedInfo.battery.voltage}mV` : ''}${deviceExtendedInfo.battery.last_updated ? `\nUpdated: ${new Date(deviceExtendedInfo.battery.last_updated).toLocaleString()}` : ''}`}
            >
              {getBatteryIcon(deviceExtendedInfo.battery.level, deviceExtendedInfo.battery.is_charging)}
              <span>{deviceExtendedInfo.battery.level}%</span>
              {deviceExtendedInfo.battery.is_charging && (
                <Zap size={10} className="text-warning" />
              )}
            </div>
          )}

          {/* Title Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {canRenameDevice() && (
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                onClick={() => {
                  setNewDisplayName(deviceInfo?.display_name || '');
                  setShowRenameModal(true);
                  setRenameError('');
                }}
                title="Rename Device"
              >
                <PenLine size={14} /> Rename
              </button>
            )}

            {canExportDevice() && (
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors"
                onClick={() => {
                  setShowExportModal(true);
                  setExportError('');
                }}
                title="Export Device Data"
              >
                <Download size={14} /> Export Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rename Device Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-raised border border-surface-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-surface-border">
              <h3 className="text-base font-display font-semibold text-content">Rename Device</h3>
              <button
                className="p-1.5 rounded-lg text-content-secondary hover:bg-surface-hover hover:text-content transition-colors"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameError('');
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <label htmlFor="displayName" className="text-xs text-content-muted uppercase tracking-wider font-medium">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Enter device display name"
                  maxLength={100}
                  disabled={renameLoading}
                  className="w-full px-3 py-2 text-sm bg-surface-overlay border border-surface-border rounded-lg text-content placeholder:text-content-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
                <p className="text-xs text-content-muted">
                  This name will be displayed instead of the device ID. Original device ID: {deviceId}
                </p>
              </div>

              {renameError && (
                <div className="px-3 py-2 text-xs text-danger bg-danger-muted rounded-lg">
                  {renameError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-surface-border">
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameError('');
                }}
                disabled={renameLoading}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors disabled:opacity-50"
                onClick={handleResetDeviceName}
                disabled={renameLoading}
              >
                {renameLoading ? 'Resetting...' : 'Reset to Original'}
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-raised border border-surface-border rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-surface-border">
              <h3 className="flex items-center gap-2 text-base font-display font-semibold text-content">
                <Download size={18} /> Export Device Data
              </h3>
              <button
                className="p-1.5 rounded-lg text-content-secondary hover:bg-surface-hover hover:text-content transition-colors"
                onClick={() => {
                  setShowExportModal(false);
                  setExportError('');
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="space-y-1 text-sm text-content-secondary">
                <p><span className="font-medium text-content">Device:</span> {deviceInfo?.display_name || deviceId}</p>
                <p><span className="font-medium text-content">Format:</span> Excel (.xlsx)</p>
                <p><span className="font-medium text-content">Data:</span> {isIOS ? 'Locations, Recordings (iOS: other tabs included for structure only)' : 'Locations, Recordings, Contacts, SMS, Call Logs'}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="startDate" className="text-xs text-content-muted uppercase tracking-wider font-medium">
                  Start Date (Optional)
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  disabled={exportLoading}
                  max={exportEndDate || new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 text-sm bg-surface-overlay border border-surface-border rounded-lg text-content focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="endDate" className="text-xs text-content-muted uppercase tracking-wider font-medium">
                  End Date (Optional)
                </label>
                <input
                  id="endDate"
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  disabled={exportLoading}
                  min={exportStartDate}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 text-sm bg-surface-overlay border border-surface-border rounded-lg text-content focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                />
              </div>

              <p className="text-xs text-content-muted">
                Leave dates empty to export all historical data. Export includes all device data across multiple Excel tabs.
              </p>

              {exportError && (
                <div className="px-3 py-2 text-xs text-danger bg-danger-muted rounded-lg">
                  {exportError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t border-surface-border">
              <button
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                onClick={() => {
                  setShowExportModal(false);
                  setExportError('');
                }}
                disabled={exportLoading}
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                onClick={handleExportDevice}
                disabled={exportLoading}
              >
                <Download size={14} /> {exportLoading ? 'Exporting...' : 'Export Excel File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Device Summary Section */}
      <div className="bg-surface-raised border border-surface-border rounded-xl p-6 space-y-4">
        <h3 className="flex items-center gap-2 text-base font-display font-semibold text-content">
          <Cpu size={18} className="text-accent" /> Device Summary
        </h3>

        {/* Info notice if no device data */}
        {(!deviceExtendedInfo.android_id &&
          (!deviceExtendedInfo.phone_numbers || deviceExtendedInfo.phone_numbers.length === 0) &&
          (!deviceExtendedInfo.contacts || deviceExtendedInfo.contacts.length === 0)) && (
            <div className="flex items-start gap-3 p-3 bg-info-muted rounded-lg border border-info/20">
              <Info size={16} className="text-info mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-content">Device Information Not Available</p>
                <p className="text-xs text-content-secondary">This device hasn't synced its information yet. Device details (Android ID, phone numbers, contacts) will appear here once the device uploads its data.</p>
              </div>
            </div>
          )}

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1 p-3 bg-surface-overlay rounded-lg border border-surface-border">
            <span className="text-xs text-content-muted uppercase tracking-wider">Current Location</span>
            <p className="text-sm font-medium text-content">
              {deviceInfo?.location?.lat && deviceInfo?.location?.lng
                ? `${deviceInfo.location.lat.toFixed(4)}, ${deviceInfo.location.lng.toFixed(4)}`
                : 'Location not available'
              }
            </p>
          </div>
          <div className="space-y-1 p-3 bg-surface-overlay rounded-lg border border-surface-border">
            <span className="text-xs text-content-muted uppercase tracking-wider">Total Recordings</span>
            <p className="text-sm font-medium text-content">{recordingEvents.length}</p>
          </div>
          <div className="space-y-1 p-3 bg-surface-overlay rounded-lg border border-surface-border">
            <span className="text-xs text-content-muted uppercase tracking-wider">Last Seen</span>
            <p className="text-sm font-medium text-content">{deviceInfo?.last_seen || 'Never'}</p>
          </div>
          <div className="space-y-1 p-3 bg-surface-overlay rounded-lg border border-surface-border">
            <span className="text-xs text-content-muted uppercase tracking-wider">{identifierLabel}</span>
            <p className="text-sm font-medium text-content break-all">{deviceExtendedInfo.android_id || 'Not available - Device not synced'}</p>
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="space-y-3">
          {/* Recording Control */}
          <div className="space-y-1">
            <span className="text-xs text-content-muted uppercase tracking-wider">Recording Control</span>
            <div className="flex items-center gap-2">
              <RecordingControlButton
                deviceId={deviceId}
                initialStatus={getRecordingState()}
                onStatusChange={handleRecordingStatusChange}
                disabled={loading}
              />
              <FallbackButton
                deviceId={deviceId}
                disabled={loading}
              />
            </div>
          </div>

          {/* Phone Numbers */}
          {!isIOS && (
            <div className="space-y-1">
              <span className="text-xs text-content-muted uppercase tracking-wider">Phone Numbers</span>
              {renderPhoneNumbers()}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {!isIOS && (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-success/30 bg-success-muted text-success hover:bg-success/20 transition-colors"
              onClick={handleViewContacts}
              title={deviceExtendedInfo.contacts?.length === 0 ? "No contacts available - Device needs to sync" : ""}
            >
              <Contact size={14} /> View Contacts ({deviceExtendedInfo.contacts?.length || 0})
              {deviceExtendedInfo.contacts?.length === 0 && <span className="text-content-muted"> - Not synced</span>}
            </button>
          )}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-info/30 bg-info-muted text-info hover:bg-info/20 transition-colors"
            onClick={handleViewLocationTable}
          >
            <MapPin size={14} /> Location Table
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-warning/30 bg-warning-muted text-warning hover:bg-warning/20 transition-colors"
            onClick={handleViewAudioTable}
          >
            <FileAudio size={14} /> Audio Recordings
          </button>
          {!isIOS && (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
              onClick={handleViewSmsTable}
            >
              <MessageSquare size={14} /> SMS Messages
            </button>
          )}
          {!isIOS && (
            <button
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-danger/30 bg-danger-muted text-danger hover:bg-danger/20 transition-colors"
              onClick={handleViewCallLogsTable}
            >
              <PhoneCall size={14} /> Call Logs
            </button>
          )}
        </div>

        {/* Live Audio Streaming Controls */}
        {!isIOS && (
          <div className="pt-2 border-t border-surface-border">
            <LiveStreamControls deviceId={deviceId} deviceInfo={deviceInfo} />
          </div>
        )}
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
