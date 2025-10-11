import React, { useState, useMemo } from 'react';
import './LocationTable.css';

const LocationTable = ({ data = [], deviceId, onDataChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('timestamp');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    if (searchTerm) {
      filtered = filtered.filter(item => {
        const hasNewFormat = item.date && item.time;
        if (hasNewFormat) {
          return (
            item.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.time.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.latitude?.toString().includes(searchTerm) ||
            item.longitude?.toString().includes(searchTerm) ||
            item.device_id?.toLowerCase().includes(searchTerm.toLowerCase())
          );
        } else {
          return (
            item.timestamp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.location?.lat?.toString().includes(searchTerm) ||
            item.location?.lng?.toString().includes(searchTerm)
          );
        }
      });
    }

    filtered.sort((a, b) => {
      let aValue, bValue;

      if (sortField === 'timestamp' || sortField === 'date') {
        if (a.date && a.time) {
          aValue = new Date(`${a.date}T${a.time}`);
        } else if (a.timestamp) {
          aValue = new Date(a.timestamp);
        } else {
          aValue = new Date(0);
        }

        if (b.date && b.time) {
          bValue = new Date(`${b.date}T${b.time}`);
        } else if (b.timestamp) {
          bValue = new Date(b.timestamp);
        } else {
          bValue = new Date(0);
        }
      } else if (sortField === 'latitude') {
        aValue = a.latitude || a.location?.lat || 0;
        bValue = b.latitude || b.location?.lat || 0;
      } else if (sortField === 'longitude') {
        aValue = a.longitude || a.location?.lng || 0;
        bValue = b.longitude || b.location?.lng || 0;
      }

      return sortDirection === 'asc'
        ? aValue > bValue ? 1 : -1
        : aValue < bValue ? 1 : -1;
    });

    return filtered;
  }, [data, searchTerm, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
  const paginatedData = filteredAndSortedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const exportToCSV = () => {
    const headers = ['Device_ID', 'Latitude', 'Longitude', 'Date_WAT', 'Time_WAT'];
    const csvData = [
      headers.join(','),
      ...filteredAndSortedData.map(item => {
        if (item.date && item.time) {
          return `${item.device_id || deviceId},${item.latitude},${item.longitude},${item.date},${item.time}`;
        } else {
          const timestamp = new Date(item.timestamp);
          const date = timestamp.toISOString().split('T')[0];
          const time = timestamp.toTimeString().split(' ')[0];
          return `${deviceId},${item.location?.lat || 0},${item.location?.lng || 0},${date},${time}`;
        }
      })
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceId}_location_data.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = () => {
    const headers = ['Timestamp', 'Latitude', 'Longitude'];
    const tsvData = [
      headers.join('\t'),
      ...filteredAndSortedData.map(item =>
        `${item.timestamp}\t${item.location.lat}\t${item.location.lng}`
      )
    ].join('\n');

    const blob = new Blob([tsvData], { type: 'text/tab-separated-values' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceId}_location_data.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="location-table-container">
      <div className="table-header">
        <div className="table-title">
          <h3>📍 Location History</h3>
          <p>Updates every 5 minutes from external software</p>
        </div>

        <div className="table-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search location data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <span className="search-icon">🔍</span>
          </div>

          <div className="export-buttons">
            <button onClick={exportToCSV} className="btn btn-export">📄 Export CSV</button>
            <button onClick={exportToExcel} className="btn btn-export">📊 Export Excel</button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="location-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} className="sortable">DATE(YYYY-MM-DD) {getSortIcon('date')}</th>
              <th onClick={() => handleSort('timestamp')} className="sortable">Time (WAT) {getSortIcon('timestamp')}</th>
              <th onClick={() => handleSort('latitude')} className="sortable">LATITUDE(N) {getSortIcon('latitude')}</th>
              <th onClick={() => handleSort('longitude')} className="sortable">LONGITUDE(E) {getSortIcon('longitude')}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="4" className="no-data">
                  {searchTerm ? 'No matching records found' : 'No location data available'}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const hasNewFormat = item.date && item.time;
                return (
                  <tr key={item.id || index}>
                    <td>{hasNewFormat ? item.date : (item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : 'N/A')}</td>
                    <td>{hasNewFormat ? item.time : (item.timestamp ? new Date(item.timestamp).toTimeString().split(' ')[0] : 'N/A')}</td>
                    <td>{hasNewFormat ? (item.latitude?.toFixed(6) || '0.000000') : (item.location?.lat?.toFixed(6) || '0.000000')}</td>
                    <td>{hasNewFormat ? (item.longitude?.toFixed(6) || '0.000000') : (item.location?.lng?.toFixed(6) || '0.000000')}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="btn btn-pagination">← Previous</button>
          <span className="page-info">Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="btn btn-pagination">Next →</button>
        </div>
      )}
    </div>
  );
};

export default LocationTable;
