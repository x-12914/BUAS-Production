import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Download, AlertTriangle } from 'lucide-react';
import ApiService from '../services/api';

const PhoneContacts = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        const response = await ApiService.getDeviceContacts(deviceId);

        // The response should be the JSON object directly
        setContacts(response.contacts || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching contacts:', err);
        setError(`Failed to load contacts: ${err.message}`);
        setContacts([]); // Fallback to empty array
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();

    // Poll every 30 seconds for updates
    const interval = setInterval(fetchContacts, 30000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts;

    if (searchTerm) {
      filtered = filtered.filter(contact =>
        (contact.name && contact.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (contact.phone && contact.phone.includes(searchTerm))
      );
    }

    filtered.sort((a, b) => {
      // Sort by name primarily, phone as fallback
      const aName = a.name || a.phone || '';
      const bName = b.name || b.phone || '';

      if (sortDirection === 'asc') {
        return aName.localeCompare(bName);
      } else {
        return bName.localeCompare(aName);
      }
    });

    return filtered;
  }, [contacts, searchTerm, sortDirection]);

  const totalPages = Math.ceil(filteredAndSortedContacts.length / itemsPerPage);
  const paginatedContacts = filteredAndSortedContacts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = () => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const exportToCSV = () => {
    const headers = ['Name', 'Phone Number'];
    const csvData = [
      headers.join(','),
      ...filteredAndSortedContacts.map(contact =>
        `"${contact.name || 'Unknown'}","${contact.phone || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceId}_contacts.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getSortIcon = () => {
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <button onClick={() => navigate(`/device/${deviceId}`)} className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors">
            <ArrowLeft size={16} /> Back to Device Details
          </button>
          <div>
            <h1 className="text-xl font-display font-semibold text-content">Phone Contacts</h1>
            <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-content-secondary">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm">Loading contacts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          <button onClick={() => navigate(`/device/${deviceId}`)} className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors">
            <ArrowLeft size={16} /> Back to Device Details
          </button>
          <div>
            <h1 className="text-xl font-display font-semibold text-content">Phone Contacts</h1>
            <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
          </div>
        </div>
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-danger flex items-center justify-center gap-2">
            <AlertTriangle size={20} /> Error
          </h2>
          <p className="text-sm text-content-secondary mt-2">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <button onClick={() => navigate(`/device/${deviceId}`)} className="inline-flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors">
          <ArrowLeft size={16} /> Back to Device Details
        </button>
        <div>
          <h1 className="text-xl font-display font-semibold text-content">Phone Contacts</h1>
          <p className="text-sm text-content-muted mt-1">Device: {deviceId}</p>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-content">Contact Numbers ({filteredAndSortedContacts.length} numbers)</h3>
              <p className="text-xs text-content-muted mt-0.5">Phone numbers from device contacts</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search phone numbers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48 pl-8 pr-3 py-1.5 text-xs bg-surface border border-surface-border rounded-lg text-content placeholder:text-content-muted focus:outline-none focus:border-accent transition-colors"
                />
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-content-muted" />
              </div>

              <button onClick={exportToCSV} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-overlay border border-surface-border text-content-secondary hover:text-content hover:bg-surface-hover transition-colors">
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th onClick={handleSort} className="px-4 py-2.5 text-left text-xs font-medium text-content-muted uppercase tracking-wider cursor-pointer hover:text-content transition-colors">
                  Contact Name {getSortIcon()}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Phone Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {paginatedContacts.length === 0 ? (
                <tr>
                  <td colSpan="2" className="px-4 py-8 text-center text-sm text-content-muted">
                    {searchTerm ? 'No matching contacts found' : 'No contacts available - Device not synced yet'}
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((contact, index) => (
                  <tr key={index} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-2.5 text-sm text-content font-medium">{contact.name || 'Unknown'}</td>
                    <td className="px-4 py-2.5 text-sm text-content-secondary font-mono">{contact.phone || 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:text-content hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-content-muted">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:text-content hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhoneContacts;
