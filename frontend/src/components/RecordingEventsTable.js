import React, { useState, useMemo } from 'react';
import AudioPlayer from './AudioPlayer';
import ApiService from '../services/api';

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

  const getSortIcon = (field) => {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // Audio control functions
  const hasAudioFile = (item) => {
    // CRITICAL FIX: ALWAYS require audio_file_id to be present
    // This prevents playing wrong/cached audio for incomplete uploads
    // Previous issue: System would fall back to "any audio file" and play previous recordings

    if (!item.audio_file_id || item.audio_file_id.trim() === '') {
      return false;
    }

    // File must be explicitly linked to this recording event
    return true;
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

    // Get the API base URL for proper absolute URL construction
    // Add cache-busting parameter to prevent browser from serving cached old audio
    const cacheBuster = Date.now();
    const fullAudioUrl = `${ApiService.baseURL}/api/uploads/${audioFileName}?t=${cacheBuster}`;

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

    // Get the API base URL for proper absolute URL construction
    // Add cache-busting parameter to ensure fresh download
    const cacheBuster = Date.now();
    const fullAudioUrl = `${ApiService.baseURL}/api/uploads/${audioFileName}?t=${cacheBuster}`;

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
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
      <div className="p-4 border-b border-surface-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-display font-semibold text-content">Recording Events ({filteredAndSortedData.length} events)</h3>
            <p className="text-xs text-content-muted mt-1">Location data when recording started and stopped</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Search recording events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 min-w-[200px]"
            />

            <div className="flex items-center gap-2">
              <button
                onClick={exportToCSV}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={exportToExcel}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
              >
                Export Excel
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
                onClick={() => handleSort('start_timestamp')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Start Date{getSortIcon('start_timestamp')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Start Time (WAT)</th>
              <th
                onClick={() => handleSort('start_latitude')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Start Lat(N){getSortIcon('start_latitude')}
              </th>
              <th
                onClick={() => handleSort('start_longitude')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Start Lng(E){getSortIcon('start_longitude')}
              </th>
              <th
                onClick={() => handleSort('stop_timestamp')}
                className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface cursor-pointer hover:text-content transition-colors"
              >
                Stop Date{getSortIcon('stop_timestamp')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Stop Time (WAT)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Stop Lat(N)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Stop Lng(E)</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Audio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center py-12 text-content-muted text-sm">
                  {searchTerm ? 'No matching records found' : 'No recording events available'}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                // Handle both new format (date/time) and old format (timestamp)
                const hasNewFormat = item.start_date && item.start_time;

                return (
                  <tr key={item.id || index} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">
                      {hasNewFormat ? item.start_date :
                       (item.start_timestamp ? new Date(item.start_timestamp).toISOString().split('T')[0] : 'N/A')}
                    </td>
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">
                      {hasNewFormat ? item.start_time :
                       (item.start_timestamp ? new Date(item.start_timestamp).toTimeString().split(' ')[0] : 'N/A')}
                    </td>
                    <td className="px-4 py-3 text-sm text-content font-mono">
                      {hasNewFormat ?
                        (item.start_latitude ? item.start_latitude.toFixed(6) : 'N/A') :
                        (item.start_location?.lat ? item.start_location.lat.toFixed(6) : 'N/A')}
                    </td>
                    <td className="px-4 py-3 text-sm text-content font-mono">
                      {hasNewFormat ?
                        (item.start_longitude ? item.start_longitude.toFixed(6) : 'N/A') :
                        (item.start_location?.lng ? item.start_location.lng.toFixed(6) : 'N/A')}
                    </td>
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">
                      {hasNewFormat ?
                        (item.stop_date || 'Active') :
                        (item.stop_timestamp ? new Date(item.stop_timestamp).toISOString().split('T')[0] : 'Active')}
                    </td>
                    <td className="px-4 py-3 text-xs text-content-secondary font-mono">
                      {hasNewFormat ?
                        (item.stop_time || '-') :
                        (item.stop_timestamp ? new Date(item.stop_timestamp).toTimeString().split(' ')[0] : '-')}
                    </td>
                    <td className="px-4 py-3 text-sm text-content font-mono">
                      {hasNewFormat ?
                        (item.stop_latitude ? item.stop_latitude.toFixed(6) : '-') :
                        (item.stop_location?.lat ? item.stop_location.lat.toFixed(6) : '-')}
                    </td>
                    <td className="px-4 py-3 text-sm text-content font-mono">
                      {hasNewFormat ?
                        (item.stop_longitude ? item.stop_longitude.toFixed(6) : '-') :
                        (item.stop_location?.lng ? item.stop_location.lng.toFixed(6) : '-')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="px-2 py-1 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handlePlay(item)}
                          disabled={!hasAudioFile(item)}
                          title={hasAudioFile(item) ? 'Play audio recording' : 'No audio file available'}
                        >
                          Play
                        </button>
                        <button
                          className="px-2 py-1 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleDownload(item)}
                          disabled={!hasAudioFile(item)}
                          title={hasAudioFile(item) ? 'Download audio file' : 'No audio file available'}
                        >
                          Download
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
          <span className="text-xs text-content-muted">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
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
