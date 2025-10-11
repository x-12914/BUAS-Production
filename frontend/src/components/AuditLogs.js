import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ApiService from '../services/api';
import './AuditLogs.css';

const AuditLogs = ({ user }) => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    action: '',
    user_id: '',
    start_date: '',
    end_date: '',
    search: ''
  });

  const itemsPerPage = 25;

  // Define available actions for filtering
  const auditActions = [
    'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED',
    'USER_CREATED', 'USER_DEACTIVATED', 'USER_REACTIVATED', 'PASSWORD_RESET',
    'DEVICE_ACCESSED', 'DEVICE_ACCESS_DENIED', 'DEVICE_ASSIGNED',
    'RECORDING_START', 'RECORDING_STOP', 'BATCH_RECORDING_START', 'BATCH_RECORDING_STOP',
    'CONTACT_DATA_ACCESSED', 'AUDIO_DATA_ACCESSED', 'LOCATION_DATA_ACCESSED',
    'AUDIT_LOG_ACCESSED', 'DEVICE_REGISTERED', 'RECORDING_EVENT_RECEIVED'
  ];

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: itemsPerPage,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await ApiService.getAuditLogs(params);
      console.log('Audit logs API response:', { 
        page: params.page, 
        total: response.total, 
        total_pages: response.total_pages,
        logs_count: response.logs?.length 
      });
      setAuditLogs(response.logs || []);
      setTotalPages(response.total_pages || Math.ceil((response.total || 0) / itemsPerPage));
      setError(null);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load audit logs. You may not have permission to view this data.');
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, itemsPerPage]);

  useEffect(() => {
    fetchAuditLogs(currentPage);
  }, [fetchAuditLogs, currentPage]);

  // Apply filters
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const applyFilters = () => {
    fetchAuditLogs(1);
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      user_id: '',
      start_date: '',
      end_date: '',
      search: ''
    });
    setCurrentPage(1);
    setTimeout(() => fetchAuditLogs(1), 100);
  };

  // Filter logs by search term (client-side for current page)
  const filteredLogs = useMemo(() => {
    if (!filters.search) return auditLogs;
    
    const searchTerm = filters.search.toLowerCase();
    return auditLogs.filter(log => 
      log.action?.toLowerCase().includes(searchTerm) ||
      log.username?.toLowerCase().includes(searchTerm) ||
      log.resource_type?.toLowerCase().includes(searchTerm)
    );
  }, [auditLogs, filters.search]);

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    try {
      let date;
      
      // Handle different timestamp formats
      if (typeof timestamp === 'string') {
        // If timestamp doesn't end with 'Z', add it to indicate UTC
        const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
        date = new Date(utcTimestamp);
      } else {
        date = new Date(timestamp);
      }
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid timestamp:', timestamp);
        return 'Invalid Date';
      }
      
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Africa/Lagos',  // Nigerian timezone (WAT - UTC+1)
        hour12: true  // Use 12-hour format for better readability
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error, timestamp);
      return 'Error formatting date';
    }
  };

  // Get action badge color
  const getActionBadgeColor = (action) => {
    if (action?.includes('FAILED') || action?.includes('DENIED')) return 'error';
    if (action?.includes('SUCCESS') || action?.includes('CREATED')) return 'success';
    if (action?.includes('ACCESS')) return 'info';
    if (action?.includes('PASSWORD') || action?.includes('USER')) return 'warning';
    return 'default';
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Success'];
    const csvData = [
      headers.join(','),
      ...filteredLogs.map(log => [
        `"${formatTimestamp(log.timestamp)}"`,
        `"${log.username || 'System'}"`,
        `"${log.action || 'N/A'}"`,
        `"${log.resource_type || 'N/A'}"`,
        `"${log.success ? 'Yes' : 'No'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading && auditLogs.length === 0) {
    return (
      <div className="audit-logs-container">
        <div className="audit-logs-header">
          <h2>📋 Audit Logs</h2>
          <p>Security and compliance monitoring</p>
        </div>
        <div className="loading-audit">
          <div className="spinner"></div>
          <p>Loading audit logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="audit-logs-container">
        <div className="audit-logs-header">
          <h2>📋 Audit Logs</h2>
          <p>Security and compliance monitoring</p>
        </div>
        <div className="error-state">
          <h3>❌ Access Denied</h3>
          <p>{error}</p>
          <p className="permission-note">
            Only Super Users can view audit logs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="audit-logs-container">
      {/* Header */}
      <div className="audit-logs-header">
        <div className="header-content">
          <h2>📋 Audit Logs</h2>
        </div>
        <button onClick={exportToCSV} className="btn btn-export" disabled={filteredLogs.length === 0}>
          📄 Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="audit-filters">
        <div className="filter-row">
          <div className="filter-group">
            <label>Action:</label>
            <select 
              value={filters.action} 
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">All Actions</option>
              {auditActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Start Date:</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>End Date:</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>

          <div className="filter-actions">
            <button onClick={applyFilters} className="btn btn-primary">
              🔍 Apply Filters
            </button>
            <button onClick={clearFilters} className="btn btn-secondary">
              🗑️ Clear
            </button>
          </div>
        </div>

        <div className="search-row">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search audit logs..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="audit-table-container">
        <div className="table-wrapper">
          <table className="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="no-data">
                    {filters.search ? 'No matching audit logs found' : 'No audit logs available'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className={log.success ? 'success-row' : 'error-row'}>
                    <td className="timestamp-cell">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="user-cell">
                      {log.username || 'System'}
                    </td>
                    <td className="action-cell">
                      <span className={`action-badge ${getActionBadgeColor(log.action)}`}>
                        {log.action || 'N/A'}
                      </span>
                    </td>
                    <td className="resource-cell">
                      {log.resource_type || 'N/A'}
                    </td>
                    <td className="status-cell">
                      <span className={`status-badge ${log.success ? 'success' : 'error'}`}>
                        {log.success ? '✅ Success' : '❌ Failed'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => {
                const newPage = Math.max(1, currentPage - 1);
                setCurrentPage(newPage);
              }}
              disabled={currentPage === 1 || loading}
              className="btn btn-pagination"
            >
              ← Previous
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => {
                const newPage = Math.min(totalPages, currentPage + 1);
                setCurrentPage(newPage);
              }}
              disabled={currentPage === totalPages || loading}
              className="btn btn-pagination"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
