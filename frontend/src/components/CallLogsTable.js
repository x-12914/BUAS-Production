import React, { useState, useEffect, useMemo } from 'react';
import ApiService from '../services/api';
import { PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, FileText, FileJson, ChevronLeft, ChevronRight } from 'lucide-react';

const CallLogsTable = ({
  data = [],
  summary = {},
  deviceId,
  deviceInfo,
  onDataChange,
  onFilterChange
}) => {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [lastDataLength, setLastDataLength] = useState(0);

  // Filter states
  const [numberFilter, setNumberFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [minDurationFilter, setMinDurationFilter] = useState('');

  // Table states
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedCalls, setSelectedCalls] = useState(new Set());

  // Use data from props instead of local state
  const callLogsData = data;

  // Notify parent of filter changes
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        numberFilter,
        typeFilter,
        dateFromFilter,
        dateToFilter,
        minDurationFilter
      });
    }
  }, [numberFilter, typeFilter, dateFromFilter, dateToFilter, minDurationFilter, onFilterChange]);

  // Format duration helper
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0s';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Export functions with proper sanitization
  const sanitizeForCSV = (value) => {
    if (value == null) return '';
    const str = String(value);
    // Escape quotes and wrap in quotes if contains special chars
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportToCSV = async (selectedOnly = false) => {
    try {
      let dataToExport;

      if (selectedOnly) {
        // For selected only, use current page data
        dataToExport = callLogsData.filter(call => selectedCalls.has(call.id));
      } else {
        // For export all, fetch all data from API
        const response = await ApiService.getDeviceCallLogs(deviceId, {
          per_page: 10000, // Large number to get all data
          page: 1
        });
        dataToExport = response.call_logs || [];
      }

      if (dataToExport.length === 0) {
        alert(selectedOnly ? 'No calls selected for export' : 'No data to export');
        return;
      }

      const headers = ['Date', 'Time', 'Number', 'Name', 'Type', 'Duration'];
      const csvContent = [
        headers.join(','),
        ...dataToExport.map(call => [
          sanitizeForCSV(call.call_date || call.date),
          sanitizeForCSV(call.call_time || call.time),
          sanitizeForCSV(call.phone_number || call.number),
          sanitizeForCSV(call.contact_name || call.name),
          sanitizeForCSV(call.call_type || call.type),
          sanitizeForCSV(formatDuration(call.duration))
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `call_logs_${deviceId}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const exportToJSON = async (selectedOnly = false) => {
    try {
      let dataToExport;

      if (selectedOnly) {
        // For selected only, use current page data
        dataToExport = callLogsData.filter(call => selectedCalls.has(call.id));
      } else {
        // For export all, fetch all data from API
        const response = await ApiService.getDeviceCallLogs(deviceId, {
          per_page: 10000, // Large number to get all data
          page: 1
        });
        dataToExport = response.call_logs || [];
      }

      if (dataToExport.length === 0) {
        alert(selectedOnly ? 'No calls selected for export' : 'No data to export');
        return;
      }

      const exportData = {
        device_id: deviceId,
        exported_at: new Date().toISOString(),
        call_count: dataToExport.length,
        call_logs: dataToExport
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `call_logs_${deviceId}_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  // Selection handlers
  const toggleSelectCall = (callId) => {
    const newSelected = new Set(selectedCalls);
    if (newSelected.has(callId)) {
      newSelected.delete(callId);
    } else {
      newSelected.add(callId);
    }
    setSelectedCalls(newSelected);
  };

  const selectAllCalls = () => {
    if (selectedCalls.size === callLogsData.length) {
      setSelectedCalls(new Set());
    } else {
      setSelectedCalls(new Set(callLogsData.map(call => call.id)));
    }
  };

  // Sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Local sorting and filtering for current page
  const processedData = useMemo(() => {
    let processed = [...callLogsData];

    // Sort data
    processed.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'date':
          aValue = new Date(`${a.call_date || a.date}T${a.call_time || a.time}`);
          bValue = new Date(`${b.call_date || b.date}T${b.call_time || b.time}`);
          break;
        case 'number':
          aValue = (a.phone_number || a.number || '').toLowerCase();
          bValue = (b.phone_number || b.number || '').toLowerCase();
          break;
        case 'name':
          aValue = (a.contact_name || a.name || '').toLowerCase();
          bValue = (b.contact_name || b.name || '').toLowerCase();
          break;
        case 'type':
          aValue = a.call_type || a.type;
          bValue = b.call_type || b.type;
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        default:
          return 0;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return processed;
  }, [callLogsData, sortField, sortDirection]);

  // Pagination logic
  const totalItems = processedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = processedData.slice(startIndex, endIndex);

  // Reset to first page only when data changes significantly (filter changes)
  useEffect(() => {
    const currentDataLength = data.length;

    // Only reset to page 1 if:
    // 1. This is the first load (lastDataLength is 0)
    // 2. The data length changed significantly (likely a filter change)
    if (currentDataLength > 0 &&
        (lastDataLength === 0 || Math.abs(currentDataLength - lastDataLength) > 10)) {
      setCurrentPage(1);
    }

    setLastDataLength(currentDataLength);
  }, [data.length, lastDataLength]);

  // Pagination handlers
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  // Reset filters
  const clearFilters = () => {
    setNumberFilter('');
    setTypeFilter('');
    setDateFromFilter('');
    setDateToFilter('');
    setMinDurationFilter('');
  };

  // Safe field access for Android data
  const getSafeValue = (obj, field, defaultValue = 'Unknown') => {
    return obj && obj[field] !== null && obj[field] !== undefined ? obj[field] : defaultValue;
  };

  // Get call type badge styles
  const getCallTypeBadge = (type) => {
    switch (type) {
      case 'incoming': return 'bg-info-muted text-info';
      case 'outgoing': return 'bg-accent-muted text-accent';
      case 'missed': return 'bg-danger-muted text-danger';
      default: return 'bg-warning-muted text-warning';
    }
  };

  // Get call type icon
  const getCallTypeIcon = (type) => {
    switch (type) {
      case 'incoming': return <PhoneIncoming size={14} className="inline-block mr-1 align-middle" />;
      case 'outgoing': return <PhoneOutgoing size={14} className="inline-block mr-1 align-middle" />;
      case 'missed': return <PhoneMissed size={14} className="inline-block mr-1 align-middle" />;
      default: return <PhoneCall size={14} className="inline-block mr-1 align-middle" />;
    }
  };

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-surface-border">
        <h2 className="text-lg font-display font-semibold text-content flex items-center gap-2">
          <PhoneCall size={20} className="text-accent" /> Call Logs - {deviceInfo?.display_name || deviceId}
        </h2>

        {/* Summary Stats */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Total:</span>
            <span className="text-sm font-medium text-content">{summary.total_calls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Incoming:</span>
            <span className="text-sm font-medium text-info">{summary.incoming_calls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Outgoing:</span>
            <span className="text-sm font-medium text-accent">{summary.outgoing_calls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Missed:</span>
            <span className="text-sm font-medium text-danger">{summary.missed_calls}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Total Time:</span>
            <span className="text-sm font-medium text-content">{formatDuration(summary.total_duration)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Contacts:</span>
            <span className="text-sm font-medium text-content">{summary.unique_numbers}</span>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="p-4 border-b border-surface-border space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Phone Number:</label>
            <input
              type="text"
              placeholder="Filter by number..."
              value={numberFilter}
              onChange={(e) => setNumberFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 min-w-[180px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Call Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content-secondary"
            >
              <option value="">All</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
              <option value="missed">Missed</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Min Duration (seconds):</label>
            <input
              type="number"
              placeholder="0"
              min="0"
              value={minDurationFilter}
              onChange={(e) => setMinDurationFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 w-32"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">From Date:</label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content focus:outline-none focus:border-accent/50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">To Date:</label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content focus:outline-none focus:border-accent/50"
            />
          </div>

          <button
            className="px-3 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>

        {/* Export Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-content-muted">
            {selectedCalls.size > 0 && (
              <span>{selectedCalls.size} call(s) selected</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              onClick={() => exportToCSV(false)}
              disabled={callLogsData.length === 0}
            >
              <FileText size={14} /> Export All CSV
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              onClick={() => exportToCSV(true)}
              disabled={selectedCalls.size === 0}
            >
              <FileText size={14} /> Export Selected CSV
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              onClick={() => exportToJSON(false)}
              disabled={callLogsData.length === 0}
            >
              <FileJson size={14} /> Export All JSON
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
              onClick={() => exportToJSON(true)}
              disabled={selectedCalls.size === 0}
            >
              <FileJson size={14} /> Export Selected JSON
            </button>
          </div>
        </div>
      </div>

      {/* Call Logs Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-4 py-3 text-left bg-surface w-10">
                <input
                  type="checkbox"
                  checked={selectedCalls.size === callLogsData.length && callLogsData.length > 0}
                  onChange={selectAllCalls}
                  className="rounded border-surface-border"
                />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('date')}
              >
                Date/Time {sortField === 'date' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('number')}
              >
                Number {sortField === 'number' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('name')}
              >
                Contact {sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('type')}
              >
                Type {sortField === 'type' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('duration')}
              >
                Duration {sortField === 'duration' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-12 text-content-muted text-sm">
                  No call logs found
                </td>
              </tr>
            ) : (
              paginatedData.map((call) => (
                <tr key={call.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedCalls.has(call.id)}
                      onChange={() => toggleSelectCall(call.id)}
                      className="rounded border-surface-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-content-secondary font-mono">{getSafeValue(call, 'call_date', 'No date') || getSafeValue(call, 'date', 'No date')}</div>
                    <div className="text-xs text-content-muted font-mono">{getSafeValue(call, 'call_time', 'No time') || getSafeValue(call, 'time', 'No time')}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-content font-mono">
                    {getSafeValue(call, 'phone_number', 'Unknown number') || getSafeValue(call, 'number', 'Unknown number')}
                  </td>
                  <td className="px-4 py-3 text-sm text-content">
                    {getSafeValue(call, 'contact_name', 'Unknown') || getSafeValue(call, 'name', 'Unknown')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCallTypeBadge(call.call_type || call.type)}`}>
                      {getCallTypeIcon(call.call_type || call.type)} {((call.call_type || call.type || 'Unknown').charAt(0).toUpperCase() + (call.call_type || call.type || 'Unknown').slice(1))}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-content-secondary font-mono">
                    {formatDuration(call.duration || 0)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
          <span className="text-xs text-content-muted">
            Page {currentPage} of {totalPages} ({totalItems} total calls)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default CallLogsTable;
