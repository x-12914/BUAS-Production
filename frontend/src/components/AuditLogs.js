import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ApiService from '../services/api';

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
    setCurrentPage(1);
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

      if (typeof timestamp === 'string') {
        const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z';
        date = new Date(utcTimestamp);
      } else {
        date = new Date(timestamp);
      }

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
        timeZone: 'Africa/Lagos',
        hour12: true
      });
    } catch (error) {
      console.error('Error formatting timestamp:', error, timestamp);
      return 'Error formatting date';
    }
  };

  // Get action badge classes
  const getActionBadgeClasses = (action) => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
    if (action?.includes('FAILED') || action?.includes('DENIED')) return `${base} bg-danger-muted text-danger`;
    if (action?.includes('SUCCESS') || action?.includes('CREATED')) return `${base} bg-success-muted text-success`;
    if (action?.includes('ACCESS')) return `${base} bg-info-muted text-info`;
    if (action?.includes('PASSWORD') || action?.includes('USER')) return `${base} bg-warning-muted text-warning`;
    return `${base} bg-surface-hover text-content-secondary`;
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
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold text-content">Audit Logs</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-content-muted">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold text-content">Audit Logs</h2>
        </div>
        <div className="bg-danger-muted border border-danger/20 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-danger mb-2">Access Denied</h3>
          <p className="text-sm text-content-secondary mb-2">{error}</p>
          <p className="text-xs text-content-muted">
            Only Super Users can view audit logs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-content">Audit Logs</h2>
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={filteredLogs.length === 0}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-surface-raised border border-surface-border rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[150px]">
            <label className="text-xs font-medium text-content-muted">Action</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
            >
              <option value="">All Actions</option>
              {auditActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1 flex-1 min-w-[150px]">
            <label className="text-xs font-medium text-content-muted">Start Date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
            />
          </div>

          <div className="space-y-1 flex-1 min-w-[150px]">
            <label className="text-xs font-medium text-content-muted">End Date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
            />
          </div>

          <div className="flex items-end gap-2">
            <button onClick={applyFilters} className="px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors">
              Apply Filters
            </button>
            <button onClick={clearFilters} className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors">
              Clear
            </button>
          </div>
        </div>

        <div className="mt-3">
          <input
            type="text"
            placeholder="Search audit logs..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-surface-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-sm text-content-muted">
                    {filters.search ? 'No matching audit logs found' : 'No audit logs available'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-sm text-content whitespace-nowrap">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-sm text-content">
                      {log.username || 'System'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={getActionBadgeClasses(log.action)}>
                        {log.action || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-content">
                      {log.resource_type || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {log.success ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success">
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-danger-muted text-danger">
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
            <span className="text-xs text-content-muted">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newPage = Math.max(1, currentPage - 1);
                  setCurrentPage(newPage);
                }}
                disabled={currentPage === 1 || loading}
                className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => {
                  const newPage = Math.min(totalPages, currentPage + 1);
                  setCurrentPage(newPage);
                }}
                disabled={currentPage === totalPages || loading}
                className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/50 rounded-xl">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
