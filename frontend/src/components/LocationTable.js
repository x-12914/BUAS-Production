import React, { useState, useMemo } from 'react';
import { MapPin, Search, FileText, Table as TableIcon, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';

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
    if (sortField !== field) return <ArrowUpDown size={14} className="inline-block ml-1 align-middle" />;
    return sortDirection === 'asc' ? <ArrowUp size={14} className="inline-block ml-1 align-middle" /> : <ArrowDown size={14} className="inline-block ml-1 align-middle" />;
  };

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-display font-semibold text-content flex items-center gap-2">
              <MapPin size={20} className="text-accent" /> Location History
            </h3>
            <p className="text-xs text-content-muted mt-1">Updates every 5 minutes from external software</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search location data..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-2 pl-9 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 min-w-[200px]"
              />
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportToCSV}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors inline-flex items-center gap-1"
              >
                <FileText size={14} /> Export CSV
              </button>
              <button
                onClick={exportToExcel}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors inline-flex items-center gap-1"
              >
                <TableIcon size={14} /> Export Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-surface-border">
              <th
                onClick={() => handleSort('date')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Date {getSortIcon('date')}
              </th>
              <th
                onClick={() => handleSort('timestamp')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Time (WAT) {getSortIcon('timestamp')}
              </th>
              <th
                onClick={() => handleSort('latitude')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Latitude(N) {getSortIcon('latitude')}
              </th>
              <th
                onClick={() => handleSort('longitude')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Longitude(E) {getSortIcon('longitude')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-12 text-content-muted text-sm">
                  {searchTerm ? 'No matching records found' : 'No location data available'}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const hasNewFormat = item.date && item.time;
                return (
                  <tr key={item.id || index} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">{hasNewFormat ? item.date : (item.timestamp ? new Date(item.timestamp).toISOString().split('T')[0] : 'N/A')}</td>
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">{hasNewFormat ? item.time : (item.timestamp ? new Date(item.timestamp).toTimeString().split(' ')[0] : 'N/A')}</td>
                    <td className="px-4 py-3 text-sm text-content font-mono">{hasNewFormat ? (item.latitude?.toFixed(6) || '0.000000') : (item.location?.lat?.toFixed(6) || '0.000000')}</td>
                    <td className="px-4 py-3 text-sm text-content font-mono">{hasNewFormat ? (item.longitude?.toFixed(6) || '0.000000') : (item.location?.lng?.toFixed(6) || '0.000000')}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
          <span className="text-xs text-content-muted">Page {currentPage} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
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

export default LocationTable;
