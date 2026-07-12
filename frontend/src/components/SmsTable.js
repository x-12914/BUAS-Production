import React, { useState, useEffect, useMemo } from 'react';

const SmsTable = ({
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
  const [searchTerm, setSearchTerm] = useState('');
  const [senderFilter, setSenderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');

  // Expandable rows and modal states
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [modalMessage, setModalMessage] = useState(null);

  // Table states
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedMessages, setSelectedMessages] = useState(new Set());

  // Use data from props instead of local state
  const smsData = data;

  // Notify parent of filter changes
  useEffect(() => {
    if (onFilterChange) {
      onFilterChange({
        searchTerm,
        senderFilter,
        statusFilter,
        dateFromFilter,
        dateToFilter
      });
    }
  }, [searchTerm, senderFilter, statusFilter, dateFromFilter, dateToFilter, onFilterChange]);

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

  const exportToCSV = (selectedOnly = false) => {
    const dataToExport = selectedOnly
      ? smsData.filter(sms => selectedMessages.has(sms.id))
      : smsData;

    if (dataToExport.length === 0) {
      alert(selectedOnly ? 'No messages selected for export' : 'No data to export');
      return;
    }

    const headers = ['Date', 'Time', 'From', 'Message', 'Status'];
    const csvContent = [
      headers.join(','),
      ...dataToExport.map(sms => [
        sanitizeForCSV(sms.date),
        sanitizeForCSV(sms.time),
        sanitizeForCSV(sms.from),
        sanitizeForCSV(sms.message),
        sanitizeForCSV(sms.status)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sms_${deviceId}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToJSON = (selectedOnly = false) => {
    const dataToExport = selectedOnly
      ? smsData.filter(sms => selectedMessages.has(sms.id))
      : smsData;

    if (dataToExport.length === 0) {
      alert(selectedOnly ? 'No messages selected for export' : 'No data to export');
      return;
    }

    const exportData = {
      device_id: deviceId,
      exported_at: new Date().toISOString(),
      message_count: dataToExport.length,
      messages: dataToExport
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sms_${deviceId}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // Selection handlers
  const toggleSelectMessage = (messageId) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
  };

  const selectAllMessages = () => {
    if (selectedMessages.size === smsData.length) {
      setSelectedMessages(new Set());
    } else {
      setSelectedMessages(new Set(smsData.map(sms => sms.id)));
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
    let processed = [...smsData];

    // Sort data
    processed.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'date':
          aValue = new Date(`${a.date}T${a.time}`);
          bValue = new Date(`${b.date}T${b.time}`);
          break;
        case 'from':
          aValue = a.from.toLowerCase();
          bValue = b.from.toLowerCase();
          break;
        case 'message':
          aValue = a.message.toLowerCase();
          bValue = b.message.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
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
  }, [smsData, sortField, sortDirection]);

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
    setSearchTerm('');
    setSenderFilter('');
    setStatusFilter('');
    setDateFromFilter('');
    setDateToFilter('');
  };

  // Smart truncate message for table display - break at word boundaries
  const truncateMessage = (message, maxLength = 80) => {
    if (!message || typeof message !== 'string') return 'No message';
    if (message.length <= maxLength) return message;

    // Find the last space before maxLength to break at word boundary
    const truncated = message.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) { // If we can break at a reasonable word boundary
      return message.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  };

  // Check if message should show in modal (very long messages)
  const shouldShowModal = (message) => {
    return message && message.length > 500;
  };

  // Toggle row expansion
  const toggleRowExpansion = (smsId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(smsId)) {
      newExpanded.delete(smsId);
    } else {
      newExpanded.add(smsId);
    }
    setExpandedRows(newExpanded);
  };

  // Open modal for long messages
  const openMessageModal = (sms) => {
    setModalMessage(sms);
  };

  // Close modal
  const closeMessageModal = () => {
    setModalMessage(null);
  };

  // Safe field access for Android data
  const getSafeValue = (obj, field, defaultValue = 'Unknown') => {
    return obj && obj[field] !== null && obj[field] !== undefined ? obj[field] : defaultValue;
  };

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-surface-border">
        <h2 className="text-lg font-display font-semibold text-content">SMS Messages - {deviceInfo?.display_name || deviceId}</h2>

        {/* Summary Stats */}
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Total:</span>
            <span className="text-sm font-medium text-content">{summary.total_messages}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Unread:</span>
            <span className="text-sm font-medium text-warning">{summary.unread_messages}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Read:</span>
            <span className="text-sm font-medium text-success">{summary.read_messages}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-content-muted">Senders:</span>
            <span className="text-sm font-medium text-content">{summary.unique_senders}</span>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="p-4 border-b border-surface-border space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Search Messages:</label>
            <input
              type="text"
              placeholder="Search in message content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 min-w-[200px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">From:</label>
            <input
              type="text"
              placeholder="Filter by sender..."
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 min-w-[160px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-content-muted">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content-secondary"
            >
              <option value="">All</option>
              <option value="read">Read</option>
              <option value="unread">Unread</option>
            </select>
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
            {selectedMessages.size > 0 && (
              <span>{selectedMessages.size} message(s) selected</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => exportToCSV(false)}
              disabled={smsData.length === 0}
            >
              Export All CSV
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => exportToCSV(true)}
              disabled={selectedMessages.size === 0}
            >
              Export Selected CSV
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => exportToJSON(false)}
              disabled={smsData.length === 0}
            >
              Export All JSON
            </button>
            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => exportToJSON(true)}
              disabled={selectedMessages.size === 0}
            >
              Export Selected JSON
            </button>
          </div>
        </div>
      </div>

      {/* SMS Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="px-4 py-3 text-left bg-surface w-10">
                <input
                  type="checkbox"
                  checked={selectedMessages.size === smsData.length && smsData.length > 0}
                  onChange={selectAllMessages}
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
                onClick={() => handleSort('from')}
              >
                From {sortField === 'from' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('message')}
              >
                Message {sortField === 'message' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
                onClick={() => handleSort('status')}
              >
                Status {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-12 text-content-muted text-sm">
                  No SMS messages found
                </td>
              </tr>
            ) : (
              paginatedData.map((sms) => {
                const isExpanded = expandedRows.has(sms.id);
                const message = getSafeValue(sms, 'message', 'No message');
                const isLongMessage = shouldShowModal(message);
                const isTruncated = message.length > 80;

                return (
                  <React.Fragment key={sms.id}>
                    <tr className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedMessages.has(sms.id)}
                          onChange={() => toggleSelectMessage(sms.id)}
                          className="rounded border-surface-border"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-content-secondary font-mono">{getSafeValue(sms, 'date', 'No date')}</div>
                        <div className="text-xs text-content-muted font-mono">{getSafeValue(sms, 'time', 'No time')}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-content">
                        {getSafeValue(sms, 'from', 'Unknown sender')}
                      </td>
                      <td className="px-4 py-3 text-sm text-content max-w-md">
                        <div>
                          <span>{isExpanded ? message : truncateMessage(message)}</span>
                          {isTruncated && !isLongMessage && (
                            <button
                              className="ml-2 text-xs text-accent hover:text-accent-hover transition-colors"
                              onClick={() => toggleRowExpansion(sms.id)}
                            >
                              {isExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}
                          {isLongMessage && (
                            <button
                              className="ml-2 text-xs text-accent hover:text-accent-hover transition-colors"
                              onClick={() => openMessageModal(sms)}
                            >
                              View Full Message
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          sms.read
                            ? 'bg-success-muted text-success'
                            : 'bg-warning-muted text-warning'
                        }`}>
                          {getSafeValue(sms, 'status', 'Unknown')}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && !isLongMessage && (
                      <tr className="bg-surface">
                        <td colSpan="5" className="px-4 py-3">
                          <div className="text-sm text-content-secondary pl-10">
                            {message}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
          <span className="text-xs text-content-muted">
            Page {currentPage} of {totalPages} ({totalItems} total messages)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={goToNextPage}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Message Modal */}
      {modalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeMessageModal}>
          <div className="bg-surface-raised border border-surface-border rounded-xl max-w-lg w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-surface-border">
              <h3 className="text-base font-display font-semibold text-content">Full Message</h3>
              <button className="text-content-muted hover:text-content text-xl leading-none transition-colors" onClick={closeMessageModal}>x</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <div className="text-sm text-content-secondary">
                  <strong className="text-content">From:</strong> {getSafeValue(modalMessage, 'from', 'Unknown sender')}
                </div>
                <div className="text-sm text-content-secondary">
                  <strong className="text-content">Date:</strong> {getSafeValue(modalMessage, 'date', 'No date')} at {getSafeValue(modalMessage, 'time', 'No time')}
                </div>
                <div className="text-sm text-content-secondary flex items-center gap-2">
                  <strong className="text-content">Status:</strong>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    modalMessage.read
                      ? 'bg-success-muted text-success'
                      : 'bg-warning-muted text-warning'
                  }`}>
                    {getSafeValue(modalMessage, 'status', 'Unknown')}
                  </span>
                </div>
              </div>
              <div className="mt-3 p-3 bg-surface rounded-lg text-sm text-content whitespace-pre-wrap">
                {getSafeValue(modalMessage, 'message', 'No message')}
              </div>
            </div>
            <div className="p-4 border-t border-surface-border flex justify-end">
              <button
                className="px-3 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                onClick={closeMessageModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmsTable;
