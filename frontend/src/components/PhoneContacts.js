import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ApiService from '../services/api';
import './PhoneContacts.css';

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
        console.log(`Fetching contacts for device: ${deviceId}`);
        const response = await ApiService.getDeviceContacts(deviceId);
        console.log('Contacts API response:', response);
        
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
      <div className="phone-contacts-container">
        <div className="contacts-header">
          <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
            ← Back to Device Details
          </button>
          <div className="contacts-title">
            <h1>📞 Phone Contacts</h1>
            <p>Device: {deviceId}</p>
          </div>
        </div>
        <div className="loading-contacts">
          <div className="spinner"></div>
          <p>Loading contacts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="phone-contacts-container">
        <div className="contacts-header">
          <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
            ← Back to Device Details
          </button>
          <div className="contacts-title">
            <h1>📞 Phone Contacts</h1>
            <p>Device: {deviceId}</p>
          </div>
        </div>
        <div className="error-state">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-contacts-container">
      {/* Header */}
      <div className="contacts-header">
        <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
          ← Back to Device Details
        </button>
        <div className="contacts-title">
          <h1>📞 Phone Contacts</h1>
          <p>Device: {deviceId}</p>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="contacts-table-container">
        <div className="table-header">
          <div className="table-title">
            <h3>📋 Contact Numbers ({filteredAndSortedContacts.length} numbers)</h3>
            <p>Phone numbers from device contacts</p>
          </div>

          <div className="table-controls">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search phone numbers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
            </div>

            <div className="export-buttons">
              <button onClick={exportToCSV} className="btn btn-export">
                📄 Export CSV
              </button>
            </div>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="contacts-table">
            <thead>
              <tr>
                <th onClick={handleSort} className="sortable">
                  Contact Name {getSortIcon()}
                </th>
                <th>Phone Number</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContacts.length === 0 ? (
                <tr>
                  <td colSpan="2" className="no-data">
                    {searchTerm ? 'No matching contacts found' : 'No contacts available - Device not synced yet'}
                  </td>
                </tr>
              ) : (
                paginatedContacts.map((contact, index) => (
                  <tr key={index}>
                    <td className="contact-name">{contact.name || 'Unknown'}</td>
                    <td className="contact-phone">{contact.phone || 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="btn btn-pagination"
            >
              ← Previous
            </button>
            <span className="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-pagination"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhoneContacts;
