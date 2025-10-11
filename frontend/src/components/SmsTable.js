import React, { useState, useEffect, useMemo } from 'react';
import './SmsTable.css';

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
    <div className="sms-table-container">
      {/* Header */}
      <div className="sms-table-header">
        <h2>📱 SMS Messages - {deviceInfo?.display_name || deviceId}</h2>
        
        {/* Summary Stats */}
        <div className="sms-summary">
          <div className="stat-item">
            <span className="stat-label">Total:</span>
            <span className="stat-value">{summary.total_messages}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Unread:</span>
            <span className="stat-value unread">{summary.unread_messages}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Read:</span>
            <span className="stat-value read">{summary.read_messages}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Senders:</span>
            <span className="stat-value">{summary.unique_senders}</span>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="sms-controls">
        <div className="filters-row">
          <div className="filter-group">
            <label>Search Messages:</label>
            <input
              type="text"
              placeholder="Search in message content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="filter-group">
            <label>From:</label>
            <input
              type="text"
              placeholder="Filter by sender..."
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
            />
          </div>
          
          <div className="filter-group">
            <label>Status:</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="read">Read</option>
              <option value="unread">Unread</option>
            </select>
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
            {selectedMessages.size > 0 && (
              <span>{selectedMessages.size} message(s) selected</span>
            )}
          </div>
          
          <div className="export-buttons">
            <button 
              className="btn btn-export" 
              onClick={() => exportToCSV(false)}
              disabled={smsData.length === 0}
            >
              📄 Export All CSV
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToCSV(true)}
              disabled={selectedMessages.size === 0}
            >
              📄 Export Selected CSV
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToJSON(false)}
              disabled={smsData.length === 0}
            >
              📊 Export All JSON
            </button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToJSON(true)}
              disabled={selectedMessages.size === 0}
            >
              📊 Export Selected JSON
            </button>
          </div>
        </div>
      </div>

      {/* SMS Table */}
      <div className="table-container">
        <table className="sms-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedMessages.size === smsData.length && smsData.length > 0}
                  onChange={selectAllMessages}
                />
              </th>
              <th 
                className={`sortable ${sortField === 'date' ? sortDirection : ''}`}
                onClick={() => handleSort('date')}
              >
                Date/Time
              </th>
              <th 
                className={`sortable ${sortField === 'from' ? sortDirection : ''}`}
                onClick={() => handleSort('from')}
              >
                From
              </th>
              <th 
                className={`sortable ${sortField === 'message' ? sortDirection : ''}`}
                onClick={() => handleSort('message')}
              >
                Message
              </th>
              <th 
                className={`sortable ${sortField === 'status' ? sortDirection : ''}`}
                onClick={() => handleSort('status')}
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="5" className="no-data">
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
                    <tr className={`${sms.read ? 'read' : 'unread'} ${isExpanded ? 'expanded' : ''}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedMessages.has(sms.id)}
                          onChange={() => toggleSelectMessage(sms.id)}
                        />
                      </td>
                      <td className="datetime-cell">
                        <div className="date">{getSafeValue(sms, 'date', 'No date')}</div>
                        <div className="time">{getSafeValue(sms, 'time', 'No time')}</div>
                      </td>
                      <td className="from-cell">
                        {getSafeValue(sms, 'from', 'Unknown sender')}
                      </td>
                      <td className="message-cell">
                        <div className="message-content">
                          {isExpanded ? message : truncateMessage(message)}
                          {isTruncated && !isLongMessage && (
                            <button 
                              className="expand-btn"
                              onClick={() => toggleRowExpansion(sms.id)}
                            >
                              {isExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}
                          {isLongMessage && (
                            <button 
                              className="modal-btn"
                              onClick={() => openMessageModal(sms)}
                            >
                              View Full Message
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="status-cell">
                        <span className={`status-badge ${sms.read ? 'read' : 'unread'}`}>
                          {getSafeValue(sms, 'status', 'Unknown')}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && !isLongMessage && (
                      <tr className="expanded-content">
                        <td colSpan="5">
                          <div className="full-message">
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
              Page {currentPage} of {totalPages} ({totalItems} total messages)
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

      {/* Message Modal */}
      {modalMessage && (
        <div className="message-modal-overlay" onClick={closeMessageModal}>
          <div className="message-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Full Message</h3>
              <button className="close-btn" onClick={closeMessageModal}>×</button>
            </div>
            <div className="modal-content">
              <div className="message-details">
                <div className="detail-row">
                  <strong>From:</strong> {getSafeValue(modalMessage, 'from', 'Unknown sender')}
                </div>
                <div className="detail-row">
                  <strong>Date:</strong> {getSafeValue(modalMessage, 'date', 'No date')} at {getSafeValue(modalMessage, 'time', 'No time')}
                </div>
                <div className="detail-row">
                  <strong>Status:</strong> 
                  <span className={`status-badge ${modalMessage.read ? 'read' : 'unread'}`}>
                    {getSafeValue(modalMessage, 'status', 'Unknown')}
                  </span>
                </div>
              </div>
              <div className="message-text">
                {getSafeValue(modalMessage, 'message', 'No message')}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeMessageModal}>
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