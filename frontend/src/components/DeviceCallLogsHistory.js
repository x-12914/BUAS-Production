import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import CallLogsTable from './CallLogsTable';
import ApiService from '../services/api';

const DeviceCallLogsHistory = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [callLogsData, setCallLogsData] = useState(location.state?.callLogsData || []);
  const [deviceInfo, setDeviceInfo] = useState(location.state?.deviceInfo || null);
  const [loading, setLoading] = useState(!location.state?.callLogsData);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({
    total_calls: 0,
    incoming_calls: 0,
    outgoing_calls: 0,
    missed_calls: 0,
    total_duration: 0,
    unique_numbers: 0
  });

  // Filter state for API calls
  const [numberFilter, setNumberFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [minDurationFilter, setMinDurationFilter] = useState('');

  // Helper function to fetch all Call Logs data across multiple pages
  const fetchAllCallLogsData = async (baseParams) => {
    let allCallLogsData = [];
    let page = 1;
    let hasMore = true;
    let totalSummary = {};

    while (hasMore) {
      const params = {
        ...baseParams,
        page: page,
        per_page: 100  // Use max allowed per page
      };

      const response = await ApiService.getDeviceCallLogs(deviceId, params);

      if (response.call_logs && response.call_logs.length > 0) {
        allCallLogsData = [...allCallLogsData, ...response.call_logs];
        totalSummary = response.summary || {};
        hasMore = response.pagination?.has_next || false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { call_logs: allCallLogsData, summary: totalSummary };
  };

  const fetchData = async () => {
    try {
      const baseParams = {};
      if (dateFromFilter) baseParams.date_from = dateFromFilter;
      if (dateToFilter) baseParams.date_to = dateToFilter;
      if (numberFilter) baseParams.number = numberFilter;
      if (typeFilter) baseParams.type = typeFilter;
      if (minDurationFilter) baseParams.min_duration = minDurationFilter;

      const [callLogsResponse, deviceResponse] = await Promise.all([
        fetchAllCallLogsData(baseParams),
        location.state?.deviceInfo ? Promise.resolve({ data: location.state.deviceInfo }) : ApiService.getDeviceDetails(deviceId)
      ]);

      setCallLogsData(callLogsResponse.call_logs || []);
      setSummary(callLogsResponse.summary || {});
      setDeviceInfo(deviceResponse.data);
      setError(null);
    } catch (err) {
      setError('Failed to load call logs data');
      console.error('Error fetching call logs data:', err);
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
  }, [deviceId, location.state, dateFromFilter, dateToFilter, numberFilter, typeFilter, minDurationFilter]);

  // Handler for data refresh after changes
  const handleDataChange = async () => {
    try {
      const baseParams = {};
      if (dateFromFilter) baseParams.date_from = dateFromFilter;
      if (dateToFilter) baseParams.date_to = dateToFilter;
      if (numberFilter) baseParams.number = numberFilter;
      if (typeFilter) baseParams.type = typeFilter;
      if (minDurationFilter) baseParams.min_duration = minDurationFilter;

      const callLogsResponse = await fetchAllCallLogsData(baseParams);
      setCallLogsData(callLogsResponse.call_logs || []);
      setSummary(callLogsResponse.summary || {});
    } catch (err) {
      console.error('Error refreshing call logs data:', err);
    }
  };

  // Handlers for filter changes
  const handleFilterChange = (filters) => {
    setNumberFilter(filters.numberFilter || '');
    setTypeFilter(filters.typeFilter || '');
    setDateFromFilter(filters.dateFromFilter || '');
    setDateToFilter(filters.dateToFilter || '');
    setMinDurationFilter(filters.minDurationFilter || '');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading call logs...</p>
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
          <h1 className="text-xl font-display font-semibold text-content">Device Call Logs</h1>
          <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
          {deviceInfo && (
            <span className="text-xs text-content-secondary mt-1 inline-block">
              {summary.total_calls} call logs
            </span>
          )}
        </div>
      </div>

      {/* Call Logs Table */}
      <div>
        <CallLogsTable
          data={callLogsData}
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

export default DeviceCallLogsHistory;
