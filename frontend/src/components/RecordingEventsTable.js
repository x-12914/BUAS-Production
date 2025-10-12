import React, { useState, useMemo } from 'react';
import AudioPlayer from './AudioPlayer';
import ApiService from '../services/api';
import './RecordingEventsTable.css';

const RecordingEventsTable = ({ data = [], deviceId, audioFiles = [], onDataChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('start_timestamp');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const itemsPerPage = 10;

  // Filter and sort data
  const filteredAndSortedData = useMemo(() => {
    let filtered = data;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.start_timestamp.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.stop_timestamp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.start_location.lat.toString().includes(searchTerm) ||
        item.start_location.lng.toString().includes(searchTerm) ||
        item.stop_location?.lat.toString().includes(searchTerm) ||
        item.stop_location?.lng.toString().includes(searchTerm)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      if (sortField === 'start_timestamp') {
        aValue = new Date(a.start_timestamp);
        bValue = new Date(b.start_timestamp);
      } else if (sortField === 'stop_timestamp') {
        aValue = new Date(a.stop_timestamp || 0);
        bValue = new Date(b.stop_timestamp || 0);
      } else if (sortField === 'start_latitude') {
        aValue = a.start_location.lat;
        bValue = b.start_location.lat;
      } else if (sortField === 'start_longitude') {
        aValue = a.start_location.lng;
        bValue = b.start_location.lng;
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [data, searchTerm, sortField, sortDirection]);

  // Pagination
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

  const exportToCSV = async () => {
    // Use new format headers with separate Date and Time columns
    const headers = [
      'Device_ID', 
      'Start_Date_WAT', 
      'Start_Time_WAT',
      'Start_Latitude', 
      'Start_Longitude', 
      'Stop_Date_WAT', 
      'Stop_Time_WAT',
      'Stop_Latitude', 
      'Stop_Longitude',
      'Audio_File_ID',
      'Audio_Link'
    ];
    
    // Resolve audio files for all items
    const resolvedData = await Promise.all(
      filteredAndSortedData.map(async (item) => {
        let audioFileName = '';
        let audioLink = '';
        
        try {
          // Use the new audio file resolution API
          const startDate = item.start_date || (item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : '');
          const startTime = item.start_time || (item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : '');
          
          const response = await ApiService.resolveAudioFile(
            item.device_id || deviceId,
            item.audio_file_id,
            startDate,
            startTime
          );
          
          if (response.success && response.actual_filename) {
            audioFileName = response.actual_filename;
            audioLink = response.audio_url;
          } else {
            audioFileName = 'No audio file found';
            audioLink = 'Audio Not Available';
          }
        } catch (error) {
          console.error('Error resolving audio file:', error);
          audioFileName = 'Error resolving audio';
          audioLink = 'Audio Not Available';
        }
        
        return { ...item, audioFileName, audioLink };
      })
    );
    
    const csvData = [
      headers.join(','),
      ...resolvedData.map(item => {
        // Handle both new and old formats
        if (item.start_date && item.start_time) {
          // New format
          return `${item.device_id || deviceId},${item.start_date},${item.start_time},${item.start_latitude || ''},${item.start_longitude || ''},${item.stop_date || ''},${item.stop_time || ''},${item.stop_latitude || ''},${item.stop_longitude || ''},${item.audioFileName},${item.audioLink}`;
        } else {
          // Old format - convert timestamps to date/time
          const startDate = item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : '';
          const startTime = item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : '';
          const stopDate = item.stop_timestamp ? new Date(item.stop_timestamp).toISOString().split('T')[0] : '';
          const stopTime = item.stop_timestamp ? new Date(item.stop_timestamp).toTimeString().split(' ')[0] : '';
          
          return `${deviceId},${startDate},${startTime},${item.start_location?.lat || ''},${item.start_location?.lng || ''},${stopDate},${stopTime},${item.stop_location?.lat || ''},${item.stop_location?.lng || ''},${item.audioFileName},${item.audioLink}`;
        }
      })
    ].join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceId}_recording_events_WAT.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToExcel = async () => {
    const headers = [
      'Start Timestamp', 
      'Start Latitude', 
      'Start Longitude', 
      'Stop Timestamp', 
      'Stop Latitude', 
      'Stop Longitude',
      'Audio File ID',
      'Audio Link'
    ];
    
    // Resolve audio files for all items
    const resolvedData = await Promise.all(
      filteredAndSortedData.map(async (item) => {
        let audioFileName = '';
        let audioLink = '';
        
        try {
          // Use the new audio file resolution API
          const startDate = item.start_date || (item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : '');
          const startTime = item.start_time || (item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : '');
          
          const response = await ApiService.resolveAudioFile(
            item.device_id || deviceId,
            item.audio_file_id,
            startDate,
            startTime
          );
          
          if (response.success && response.actual_filename) {
            audioFileName = response.actual_filename;
            audioLink = response.audio_url;
          } else {
            audioFileName = 'No audio file found';
            audioLink = 'Audio Not Available';
          }
        } catch (error) {
          console.error('Error resolving audio file:', error);
          audioFileName = 'Error resolving audio';
          audioLink = 'Audio Not Available';
        }
        
        return { ...item, audioFileName, audioLink };
      })
    );
    
    const tsvData = [
      headers.join('\t'),
      ...resolvedData.map(item => {
        return `${item.start_timestamp}\t${item.start_location.lat}\t${item.start_location.lng}\t${item.stop_timestamp || ''}\t${item.stop_location?.lat || ''}\t${item.stop_location?.lng || ''}\t${item.audioFileName}\t${item.audioLink}`;
      })
    ].join('\n');

    const blob = new Blob([tsvData], { type: 'text/tab-separated-values' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deviceId}_recording_events.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  // Audio control functions
  const hasAudioFile = (item) => {
    // Primary check: does the item have an audio_file_id?
    if (item.audio_file_id && item.audio_file_id.trim() !== '') {
      return true;
    }

    // For recent uploads, be more strict - don't show play button unless we have specific file ID
    // This prevents the issue where recent uploads would play previous audio
    const recordingDate = new Date(item.start_timestamp || `${item.start_date} ${item.start_time}`);
    const now = new Date();
    const timeDiff = now - recordingDate;
    const isRecent = timeDiff < 5 * 60 * 1000; // Less than 5 minutes ago
    
    if (isRecent) {
      // For recent recordings, only show play button if we have specific audio_file_id
      return false;
    }

    // Fallback check: are there any audio files for this device? (only for older recordings)
    if (audioFiles && audioFiles.length > 0) {
      return true;
    }

    return false;
  };

  const getAudioFileForItem = async (item) => {
    try {
      // Use the new audio file resolution API
      const startDate = item.start_date || (item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : '');
      const startTime = item.start_time || (item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : '');
      
      const response = await ApiService.resolveAudioFile(
        item.device_id || deviceId,
        item.audio_file_id,
        startDate,
        startTime
      );
      
      if (response.success && response.actual_filename) {
        return response.actual_filename;
      }
    } catch (error) {
      console.error('Error resolving audio file:', error);
    }
    
    return null;
  };

  const handlePlay = async (item) => {
    if (!hasAudioFile(item)) return;
    
    const audioFileName = await getAudioFileForItem(item);
    if (!audioFileName) {
      console.warn(`No audio file found for recording: ${item.start_timestamp || `${item.start_date} ${item.start_time}`}`);
      return;
    }
    
    // Get the API base URL and ensure it has port 5000 for audio files
    let baseUrl = ApiService.baseURL;
    if (!baseUrl.includes(':5000') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl + ':5000';
    } else if (baseUrl === 'http://localhost') {
      baseUrl = 'http://localhost:5000';
    }
    const fullAudioUrl = `${baseUrl}/api/uploads/${audioFileName}`;
    
    // Create audio object for player
    const audioData = {
      url: fullAudioUrl,
      filename: audioFileName,
      user: deviceId,
      timestamp: item.start_timestamp || `${item.start_date} ${item.start_time}`
    };
    
    setCurrentAudio(audioData);
    setShowAudioPlayer(true);
  };

  const handleDownload = async (item) => {
    if (!hasAudioFile(item)) return;
    
    const audioFileName = await getAudioFileForItem(item);
    if (!audioFileName) return;
    
    // Get the API base URL and ensure it has port 5000 for audio files
    let baseUrl = ApiService.baseURL;
    if (!baseUrl.includes(':5000') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl + ':5000';
    } else if (baseUrl === 'http://localhost') {
      baseUrl = 'http://localhost:5000';
    }
    const fullAudioUrl = `${baseUrl}/api/uploads/${audioFileName}`;
    
    // Create download link (same approach as AudioPlayer)
    const link = document.createElement('a');
    link.href = fullAudioUrl;
    link.download = audioFileName;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeAudioPlayer = () => {
    setShowAudioPlayer(false);
    setCurrentAudio(null);
  };

  return (
    <div className="recording-events-table-container">
      <div className="table-header">
        <div className="table-title">
          <h3>🎵 Recording Events ({filteredAndSortedData.length} events)</h3>
          <p>Location data when recording started and stopped</p>
        </div>
        
        <div className="table-controls">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search recording events..."
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
            <button onClick={exportToExcel} className="btn btn-export">
              📊 Export Excel
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="recording-events-table">
          <thead>
            <tr>
              <th 
                onClick={() => handleSort('start_timestamp')}
                className="sortable"
              >
                START DATE(YYYY-MM-DD) {getSortIcon('start_timestamp')}
              </th>
              <th>Start Time (WAT)</th>
              <th 
                onClick={() => handleSort('start_latitude')}
                className="sortable"
              >
                START LATITUDE(N) {getSortIcon('start_latitude')}
              </th>
              <th 
                onClick={() => handleSort('start_longitude')}
                className="sortable"
              >
                START LONGITUDE(E) {getSortIcon('start_longitude')}
              </th>
              <th 
                onClick={() => handleSort('stop_timestamp')}
                className="sortable"
              >
                STOP DATE(YYYY-MM-DD) {getSortIcon('stop_timestamp')}
              </th>
              <th>Stop Time (WAT)</th>
              <th>STOP LATITUDE(N)</th>
              <th>STOP LONGITUDE(E)</th>
              <th>AUDIO CONTROLS</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="9" className="no-data">
                  {searchTerm ? 'No matching records found' : 'No recording events available'}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                // Handle both new format (date/time) and old format (timestamp)
                const hasNewFormat = item.start_date && item.start_time;
                
                return (
                  <tr key={item.id || index}>
                    <td>
                      {hasNewFormat ? item.start_date : 
                       (item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : 'N/A')}
                    </td>
                    <td>
                      {hasNewFormat ? item.start_time : 
                       (item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : 'N/A')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.start_latitude ? item.start_latitude.toFixed(6) : 'N/A') : 
                        (item.start_location?.lat ? item.start_location.lat.toFixed(6) : 'N/A')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.start_longitude ? item.start_longitude.toFixed(6) : 'N/A') : 
                        (item.start_location?.lng ? item.start_location.lng.toFixed(6) : 'N/A')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.stop_date || 'Active') : 
                        (item.stop_timestamp ? new Date(item.stop_timestamp).toISOString().split('T')[0] : 'Active')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.stop_time || '-') : 
                        (item.stop_timestamp ? new Date(item.stop_timestamp).toTimeString().split(' ')[0] : '-')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.stop_latitude ? item.stop_latitude.toFixed(6) : '-') : 
                        (item.stop_location?.lat ? item.stop_location.lat.toFixed(6) : '-')}
                    </td>
                    <td>
                      {hasNewFormat ? 
                        (item.stop_longitude ? item.stop_longitude.toFixed(6) : '-') : 
                        (item.stop_location?.lng ? item.stop_location.lng.toFixed(6) : '-')}
                    </td>
                    <td className="audio-controls-cell">
                      <div className="audio-controls">
                        <button
                          className={`audio-btn play-btn ${!hasAudioFile(item) ? 'disabled' : ''}`}
                          onClick={() => handlePlay(item)}
                          disabled={!hasAudioFile(item)}
                          title={hasAudioFile(item) ? 'Play audio recording' : 'No audio file available'}
                        >
                          <span className="btn-icon">🎵</span>
                          <span className="btn-text">Play</span>
                        </button>
                        <button
                          className={`audio-btn download-btn ${!hasAudioFile(item) ? 'disabled' : ''}`}
                          onClick={() => handleDownload(item)}
                          disabled={!hasAudioFile(item)}
                          title={hasAudioFile(item) ? 'Download audio file' : 'No audio file available'}
                        >
                          <span className="btn-icon">💾</span>
                          <span className="btn-text">Download</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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

      {/* Audio Player Modal */}
      {showAudioPlayer && currentAudio && (
        <AudioPlayer
          audio={currentAudio}
          onClose={closeAudioPlayer}
        />
      )}
    </div>
  );
};

export default RecordingEventsTable;
