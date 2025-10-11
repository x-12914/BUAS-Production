import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import SmsTable from './SmsTable';
import ApiService from '../services/api';
import './DeviceSmsHistory.css';

const DeviceSmsHistory = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Debug logging
  console.log('DeviceSmsHistory - deviceId:', deviceId);
  console.log('DeviceSmsHistory - current location:', location.pathname);
  const [smsData, setSmsData] = useState(location.state?.smsData || []);
  const [deviceInfo, setDeviceInfo] = useState(location.state?.deviceInfo || null);
  const [loading, setLoading] = useState(!location.state?.smsData);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    total_messages: 0,
    unread_messages: 0,
    read_messages: 0,
    unique_senders: 0
  });

  // Filter state for API calls
  const [searchTerm, setSearchTerm] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  // Helper function to fetch all SMS data across multiple pages
  const fetchAllSmsData = async (baseParams) => {
    let allSmsData = [];
    let page = 1;
    let hasMore = true;
    let totalSummary = {};

    while (hasMore) {
      const params = {
        ...baseParams,
        page: page,
        per_page: 100  // Use max allowed per page
      };

      const response = await ApiService.getDeviceSms(deviceId, params);
      
      if (response.sms_messages && response.sms_messages.length > 0) {
        allSmsData = [...allSmsData, ...response.sms_messages];
        totalSummary = response.summary || {};
        hasMore = response.pagination?.has_next || false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { sms_messages: allSmsData, summary: totalSummary };
  };

  const fetchData = async () => {
    try {
      const baseParams = {};
      if (dateFromFilter) baseParams.date_from = dateFromFilter;
      if (dateToFilter) baseParams.date_to = dateToFilter;
      if (senderFilter) baseParams.sender = senderFilter;
      if (statusFilter) baseParams.status = statusFilter;
      if (searchTerm) baseParams.search = searchTerm;

      const [smsResponse, deviceResponse] = await Promise.all([
        fetchAllSmsData(baseParams),
        location.state?.deviceInfo ? Promise.resolve({ data: location.state.deviceInfo }) : ApiService.getDeviceDetails(deviceId)
      ]);

      setSmsData(smsResponse.sms_messages || []);
      setSummary(smsResponse.summary || {});
      setDeviceInfo(deviceResponse.data);
      setError(null);
    } catch (err) {
      setError('Failed to load SMS data');
      console.error('Error fetching SMS data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load and filter changes
    fetchData();

    // Continue real-time polling regardless
    const interval = setInterval(() => fetchData(), 10000);
    return () => clearInterval(interval);
  }, [deviceId, location.state, dateFromFilter, dateToFilter, senderFilter, statusFilter, searchTerm]);

  // Handler for data refresh after changes
  const handleDataChange = async () => {
    try {
      const baseParams = {};
      if (dateFromFilter) baseParams.date_from = dateFromFilter;
      if (dateToFilter) baseParams.date_to = dateToFilter;
      if (senderFilter) baseParams.sender = senderFilter;
      if (statusFilter) baseParams.status = statusFilter;
      if (searchTerm) baseParams.search = searchTerm;

      const smsResponse = await fetchAllSmsData(baseParams);
      setSmsData(smsResponse.sms_messages || []);
      setSummary(smsResponse.summary || {});
    } catch (err) {
      console.error('Error refreshing SMS data:', err);
    }
  };

  // Handlers for filter changes
  const handleFilterChange = (filters) => {
    setSearchTerm(filters.searchTerm || '');
    setSenderFilter(filters.senderFilter || '');
    setStatusFilter(filters.statusFilter || '');
    setDateFromFilter(filters.dateFromFilter || '');
    setDateToFilter(filters.dateToFilter || '');
  };

  if (loading) {
    return (
      <div className="device-sms-history-container">
        <div className="loading-sms">
          <div className="spinner"></div>
          <p>Loading SMS messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="device-sms-history-container">
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
    <div className="device-sms-history-container">
      {/* Header */}
      <div className="sms-history-header">
        <button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Back button clicked!');
            console.log('DeviceId:', deviceId);
            console.log('Current location:', location.pathname);
            
            // Use window.location.href for reliable navigation
            window.location.href = `/device/${deviceId}`;
          }} 
          className="back-button"
          style={{
            position: 'relative',
            zIndex: 1000,
            pointerEvents: 'auto'
          }}
        >
          ← Back to Device Details
        </button>
        <div className="sms-history-title">
          <h1>📱 Device SMS Messages</h1>
          <p>Device: {deviceId}</p>
          {deviceInfo && (
            <div className="device-status-info">
              <span className="sms-count">
                {summary.total_messages} SMS messages
              </span>
            </div>
          )}
        </div>
      </div>

      {/* SMS Table */}
      <div className="sms-table-section">
        <SmsTable
          data={smsData}
          summary={summary}
          deviceId={deviceId}
          deviceInfo={deviceInfo}
          onDataChange={handleDataChange}
          onFilterChange={handleFilterChange}
        />
      </div>
    </div>
  );
};

export default DeviceSmsHistory;