import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import SmsTable from './SmsTable';
import ApiService from '../services/api';

const DeviceSmsHistory = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

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
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading SMS messages...</p>
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
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();

            // Use window.location.href for reliable navigation
            window.location.href = `/device/${deviceId}`;
          }}
          className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors relative z-10"
        >
          <ArrowLeft size={16} /> Back to Device Details
        </button>
        <div>
          <h1 className="text-xl font-display font-semibold text-content">Device SMS Messages</h1>
          <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
          {deviceInfo && (
            <span className="text-xs text-content-secondary mt-1 inline-block">
              {summary.total_messages} SMS messages
            </span>
          )}
        </div>
      </div>

      {/* SMS Table */}
      <div>
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
