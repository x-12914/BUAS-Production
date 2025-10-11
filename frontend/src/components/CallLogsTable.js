import React, { useState, useEffect, useMemo } from 'react';
import ApiService from '../services/api';
import './CallLogsTable.css';

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

  // Get call type icon
  const getCallTypeIcon = (type) => {
    switch (type) {
      case 'incoming': return '📞';
      case 'outgoing': return '📱';
      case 'missed': return '❌';
      default: return '📞';
    }
  };

  // Get call type class for styling
  const getCallTypeClass = (type) => {
    switch (type) {
      case 'incoming': return 'incoming';
      case 'outgoing': return 'outgoing';
      case 'missed': return 'missed';
      default: return 'unknown';
    }
  };

  return (
    <div className="call-logs-table-container">
      {/* Header */}
      <div className="call-logs-table-header">
        <h2>📞 Call Logs - {deviceInfo?.display_name || deviceId}</h2>
        
        {/* Summary Stats */}
        <div className="call-logs-summary">
          <div className="stat-item">
            <span className="stat-label">Total:</span>
            <span className="stat-value">{summary.total_calls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Incoming:</span>
            <span className="stat-value incoming">{summary.incoming_calls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Outgoing:</span>
            <span className="stat-value outgoing">{summary.outgoing_calls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Missed:</span>
            <span className="stat-value missed">{summary.missed_calls}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Total Time:</span>
            <span className="stat-value">{formatDuration(summary.total_duration)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Contacts:</span>
            <span className="stat-value">{summary.unique_numbers}</span>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="call-logs-controls">
        <div className="filters-row">
          <div className="filter-group">
            <label>Phone Number:</label>
            <input
              type="text"
              placeholder="Filter by number..."
              value={numberFilter}
              onChange={(e) => setNumberFilter(e.target.value)}
            />
          </div>
          
          <div className="filter-group">
            <label>Call Type:</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              <option value="incoming">Incoming</option>
              <option value="outgoing">Outgoing</option>
              <option value="missed">Missed</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Min Duration (seconds):</label>
            <input
              type="number"
              placeholder="0"
              min="0"
              value={minDurationFilter}
              onChange={(e) => setMinDurationFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>From Date:</label>
            <input
              type="date"
              value={dateFromFilter}
              onChange={(e) => setDateFromFilter(e.target.value)}
            />
          </div>
          
          <div className="filter-group">
            <label>To Date:</label>
            <input
              type="date"
              value={dateToFilter}
              onChange={(e) => setDateToFilter(e.target.value)}
            />
          </div>
          
          <button className="btn btn-secondary" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>

        {/* Export Controls */}
        <div className="export-controls">
          <div className="selection-info">
            {selectedCalls.size > 0 && (
              <span>{selectedCalls.size} call(s) selected</span>
            )}
          </div>
          
          <div className="export-buttons">
            <button 
              className="btn btn-export" 
              onClick={() => exportToCSV(false)}
              disabled={callLogsData.length === 0}
            >
              📄 Export All CSV
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToCSV(true)}
              disabled={selectedCalls.size === 0}
            >
              📄 Export Selected CSV
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToJSON(false)}
              disabled={callLogsData.length === 0}
            >
              📊 Export All JSON
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToJSON(true)}
              disabled={selectedCalls.size === 0}
            >
              📊 Export Selected JSON
            </button>
          </div>
        </div>
      </div>

      {/* Call Logs Table */}
      <div className="table-container">
        <table className="call-logs-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedCalls.size === callLogsData.length && callLogsData.length > 0}
                  onChange={selectAllCalls}
                />
              </th>
              <th 
                className={`sortable ${sortField === 'date' ? sortDirection : ''}`}
                onClick={() => handleSort('date')}
              >
                Date/Time
              </th>
              <th 
                className={`sortable ${sortField === 'number' ? sortDirection : ''}`}
                onClick={() => handleSort('number')}
              >
                Number
              </th>
              <th 
                className={`sortable ${sortField === 'name' ? sortDirection : ''}`}
                onClick={() => handleSort('name')}
              >
                Contact
              </th>
              <th 
                className={`sortable ${sortField === 'type' ? sortDirection : ''}`}
                onClick={() => handleSort('type')}
              >
                Type
              </th>
              <th 
                className={`sortable ${sortField === 'duration' ? sortDirection : ''}`}
                onClick={() => handleSort('duration')}
              >
                Duration
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="6" className="no-data">
                  No call logs found
                </td>
              </tr>
            ) : (
              paginatedData.map((call) => (
                <tr key={call.id} className={`call-type-${getCallTypeClass(call.call_type || call.type)}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedCalls.has(call.id)}
                      onChange={() => toggleSelectCall(call.id)}
                    />
                  </td>
                  <td className="datetime-cell">
                    <div className="date">{getSafeValue(call, 'call_date', 'No date') || getSafeValue(call, 'date', 'No date')}</div>
                    <div className="time">{getSafeValue(call, 'call_time', 'No time') || getSafeValue(call, 'time', 'No time')}</div>
                  </td>
                  <td className="number-cell">
                    {getSafeValue(call, 'phone_number', 'Unknown number') || getSafeValue(call, 'number', 'Unknown number')}
                  </td>
                  <td className="name-cell">
                    {getSafeValue(call, 'contact_name', 'Unknown') || getSafeValue(call, 'name', 'Unknown')}
                  </td>
                  <td className="type-cell">
                    <span className={`type-badge ${getCallTypeClass(call.call_type || call.type)}`}>
                      {getCallTypeIcon(call.call_type || call.type)} {(getSafeValue(call, 'call_type', 'Unknown') || getSafeValue(call, 'type', 'Unknown')).charAt(0).toUpperCase() + (getSafeValue(call, 'call_type', 'Unknown') || getSafeValue(call, 'type', 'Unknown')).slice(1)}
                    </span>
                  </td>
                  <td className="duration-cell">
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
        <div className="pagination-section">
          <div className="pagination">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="btn btn-pagination"
            >
              ← Previous
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages} ({totalItems} total calls)
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="btn btn-pagination"
            >
              Next →
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default CallLogsTable;