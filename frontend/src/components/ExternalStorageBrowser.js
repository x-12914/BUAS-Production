import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ApiService from '../services/api';
import './ExternalStorageBrowser.css';

const ExternalStorageBrowser = () => {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [currentPath, setCurrentPath] = useState('/sdcard');
  const [currentItems, setCurrentItems] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    pages: 0,
    has_next: false,
    has_prev: false
  });
  const [filters, setFilters] = useState({
    file_type: 'all',
    sort_by: 'name',
    sort_order: 'asc',
    per_page: '50'
  });
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [downloadRequests, setDownloadRequests] = useState(new Map());

  // Live updates state
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isLiveMode, setIsLiveMode] = useState(true);

  // Define functions first to avoid hoisting issues
  const loadFileSystemTree = async () => {
    try {
      setLoading(true);
      const response = await ApiService.get(`/api/device/${deviceId}/file-system/tree`);
      
      if (response) {
        setMetadata(response.metadata);
        setCurrentItems(response.root_items || []);
        // Adopt canonical root from the first item if available
        const first = (response.root_items || [])[0];
        if (first && first.parent_path) {
          setCurrentPath(first.parent_path);
        }
        setPagination({
          page: 1,
          per_page: 50,
          total: response.total_items || 0,
          pages: Math.ceil((response.total_items || 0) / 50),
          has_next: false,
          has_prev: false
        });
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError('Failed to load file system tree');
      console.error('Error loading file system tree:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentFolder = async (page = 1) => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: filters.per_page || '50',
        file_type: filters.file_type,
        sort_by: filters.sort_by,
        sort_order: filters.sort_order
      });

      // Handle path encoding properly to avoid double slash issue
      // For paths starting with /, we need to encode the path without the leading slash
      const encodedPath = currentPath.startsWith('/') 
        ? `/${encodeURIComponent(currentPath.substring(1))}` 
        : encodeURIComponent(currentPath);
      
      const response = await ApiService.get(
        `/api/device/${deviceId}/file-system/folder${encodedPath}?${params}`
      );

      if (response) {
        setCurrentItems(response.items || []);
        setPagination(response.pagination);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError('Failed to load folder contents');
      console.error('Error loading folder contents:', err);
    }
  };

  const performSearch = async (query, page = 1) => {
    if (!query.trim()) {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    try {
      setIsSearching(true);
      const params = new URLSearchParams({
        q: query,
        page: page.toString(),
        per_page: '50',
        file_type: filters.file_type
      });

      const response = await ApiService.get(
        `/api/device/${deviceId}/file-system/search?${params}`
      );

      if (response) {
        setSearchResults(response.results || []);
        setPagination(response.pagination);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError('Search failed');
      console.error('Error searching files:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFolderClick = (folder) => {
    if (!folder.is_directory) return;
    
    // Prevent infinite navigation when a folder's path equals currentPath
    if (folder.path === currentPath) return;

    // Normalize duplicate slashes
    const nextPath = folder.path.replace(/\/+/, '/');

    setCurrentPath(nextPath);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    loadCurrentFolder(1);
  };

  const handleBackClick = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) return; // already at root for this storage

    const parentPath = '/' + parts.slice(0, -1).join('/');
    setCurrentPath(parentPath);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
    loadCurrentFolder(1);
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      performSearch(query, 1);
    } else {
      setSearchResults([]);
      setIsSearching(false);
      loadCurrentFolder(1);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    if (searchQuery) {
      performSearch(searchQuery, 1);
    } else {
      loadCurrentFolder(1);
    }
  };

  const handlePageChange = (page) => {
    if (searchQuery) {
      performSearch(searchQuery, page);
    } else {
      loadCurrentFolder(page);
    }
  };

  const handleFileDownload = async (file) => {
    try {
      // Step 1: Request the download
      const response = await ApiService.post(
        `/api/device/${deviceId}/file/${encodeURIComponent(file.path)}/download`
      );

      if (response && response.request_id) {
        // Update download requests state
        setDownloadRequests(prev => new Map(prev.set(file.path, {
          ...response,
          status: 'pending',
          request_id: response.request_id
        })));

        // Step 2: Poll for download completion
        pollDownloadStatus(file.path, response.request_id);
      }
    } catch (err) {
      console.error('Error requesting file download:', err);
      // Show error to user
      setDownloadRequests(prev => new Map(prev.set(file.path, {
        status: 'error',
        error: err.message || 'Failed to request download'
      })));
    }
  };

  const pollDownloadStatus = async (filePath, requestId) => {
    const maxAttempts = 30; // 30 attempts = 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const statusResponse = await ApiService.get(
          `/api/device/${deviceId}/download-request/${requestId}/status`
        );

        if (statusResponse) {
          setDownloadRequests(prev => new Map(prev.set(filePath, {
            ...statusResponse,
            status: statusResponse.request_status
          })));

          if (statusResponse.request_status === 'completed' && statusResponse.download_url) {
            // Step 3: Download the file
            downloadFileFromUrl(statusResponse.download_url, statusResponse.file_name);
            return; // Stop polling
          } else if (statusResponse.request_status === 'failed') {
            console.error('Download failed:', statusResponse);
            return; // Stop polling
          }
        }

        // Continue polling if still pending
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          // Timeout
          setDownloadRequests(prev => new Map(prev.set(filePath, {
            status: 'timeout',
            error: 'Download request timed out'
          })));
        }
      } catch (err) {
        console.error('Error polling download status:', err);
        setDownloadRequests(prev => new Map(prev.set(filePath, {
          status: 'error',
          error: 'Failed to check download status'
        })));
      }
    };

    // Start polling
    poll();
  };

  const downloadFileFromUrl = (downloadUrl, fileName) => {
    try {
      // Create download link
      const link = document.createElement('a');
      link.href = `${ApiService.baseURL}${downloadUrl}`;
      link.download = fileName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Update status to downloaded
      setDownloadRequests(prev => new Map(prev.set(fileName, {
        status: 'downloaded',
        download_url: downloadUrl
      })));
    } catch (err) {
      console.error('Error downloading file:', err);
      setDownloadRequests(prev => new Map(prev.set(fileName, {
        status: 'error',
        error: 'Failed to download file'
      })));
    }
  };

  const renderDownloadButton = (item) => {
    const downloadStatus = downloadRequests.get(item.path);
    
    if (!downloadStatus) {
      // No download request yet
      return (
        <button
          className="download-button"
          onClick={(e) => {
            e.stopPropagation();
            handleFileDownload(item);
          }}
          title="Download file"
        >
          ⬇️
        </button>
      );
    }

    switch (downloadStatus.status) {
      case 'pending':
        return (
          <span className="download-status" title="Download requested, waiting for device...">
            ⏳
          </span>
        );
      case 'downloading':
        return (
          <span className="download-status" title="Downloading from device...">
            📥
          </span>
        );
      case 'completed':
        return (
          <span className="download-status" title="Download completed">
            ✅
          </span>
        );
      case 'downloaded':
        return (
          <span className="download-status" title="File downloaded">
            ✅
          </span>
        );
      case 'failed':
        return (
          <button
            className="download-button error"
            onClick={(e) => {
              e.stopPropagation();
              handleFileDownload(item);
            }}
            title={`Download failed: ${downloadStatus.error || 'Unknown error'}`}
          >
            ❌
          </button>
        );
      case 'timeout':
        return (
          <button
            className="download-button error"
            onClick={(e) => {
              e.stopPropagation();
              handleFileDownload(item);
            }}
            title="Download timed out, click to retry"
          >
            ⏰
          </button>
        );
      case 'error':
        return (
          <button
            className="download-button error"
            onClick={(e) => {
              e.stopPropagation();
              handleFileDownload(item);
            }}
            title={`Error: ${downloadStatus.error || 'Unknown error'}`}
          >
            ❌
          </button>
        );
      default:
        return (
          <button
            className="download-button"
            onClick={(e) => {
              e.stopPropagation();
              handleFileDownload(item);
            }}
            title="Download file"
          >
            ⬇️
          </button>
        );
    }
  };

  const handleItemPreview = (item) => {
    if (!item.is_directory) {
      setPreviewItem(item);
      setShowPreview(true);
    }
  };

  const getFileIcon = (item) => {
    if (item.is_directory) {
      return '📁';
    }
    
    const extension = item.file_extension?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) {
      return '🖼️';
    } else if (['mp4', 'avi', 'mov', 'mkv', '3gp'].includes(extension)) {
      return '🎥';
    } else if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(extension)) {
      return '🎵';
    } else if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(extension)) {
      return '📄';
    } else if (['apk', 'zip', 'rar', '7z'].includes(extension)) {
      return '📦';
    } else {
      return '📄';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  const getDisplayItems = () => {
    return isSearching ? searchResults : currentItems;
  };

  const getBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length === 0) {
      return [{ name: 'Root', path: '/sdcard' }];
    }
    // Root is the first segment of the path (e.g., /sdcard or /storage or /storage/emulated/0)
    let breadcrumbPath = '/' + parts[0];
    const breadcrumbs = [{ name: 'Root', path: breadcrumbPath }];
    for (let i = 1; i < parts.length; i++) {
      breadcrumbPath += '/' + parts[i];
      breadcrumbs.push({ name: parts[i], path: breadcrumbPath });
    }
    return breadcrumbs;
  };

  // Load initial data
  useEffect(() => {
    loadFileSystemTree();
  }, [deviceId]);

  // Live updates polling
  useEffect(() => {
    if (!isLiveMode) return;

    const interval = setInterval(() => {
      if (searchQuery) {
        performSearch(searchQuery, 1);
      } else {
        loadCurrentFolder();
      }
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [isLiveMode, searchQuery, currentPath, filters]);

  if (loading) {
    return (
      <div className="external-storage-browser">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading file system...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="external-storage-browser">
        <div className="error-container">
          <h3>Error</h3>
          <p>{error}</p>
          <div className="error-actions">
            <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
              ← Back to Device Details
            </button>
            <button onClick={loadFileSystemTree} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="external-storage-browser">
      {/* Header */}
      <div className="browser-header">
        <div className="header-top">
          <button onClick={() => navigate(`/device/${deviceId}`)} className="back-button">
            ← Back to Device Details
          </button>
          <h2>📁 External Storage Browser</h2>
          <div className="header-controls">
            <label className="live-mode-toggle">
              <input
                type="checkbox"
                checked={isLiveMode}
                onChange={(e) => setIsLiveMode(e.target.checked)}
              />
              Live Updates
            </label>
            {lastUpdate && (
              <span className="last-update">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Metadata */}
        {metadata && (
          <div className="metadata-bar">
            <div className="metadata-item">
              <span className="metadata-label">Total Files:</span>
              <span className="metadata-value">{metadata.total_files.toLocaleString()}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Total Folders:</span>
              <span className="metadata-value">{metadata.total_folders.toLocaleString()}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Total Size:</span>
              <span className="metadata-value">{metadata.total_size_formatted}</span>
            </div>
            <div className="metadata-item">
              <span className="metadata-label">Last Scan:</span>
              <span className="metadata-value">{formatDate(metadata.timestamp)}</span>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="search-filters">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-input"
            />
            {isSearching && <div className="search-spinner"></div>}
          </div>

          <div className="filters">
            <select
              value={filters.file_type}
              onChange={(e) => handleFilterChange({ file_type: e.target.value })}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="directories">Folders Only</option>
              <option value="files">Files Only</option>
              <option value="Image">Images</option>
              <option value="Video">Videos</option>
              <option value="Audio">Audio</option>
              <option value="Document">Documents</option>
              <option value="Archive">Archives</option>
            </select>

            <select
              value={filters.sort_by}
              onChange={(e) => handleFilterChange({ sort_by: e.target.value })}
              className="filter-select"
            >
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
              <option value="date">Sort by Date</option>
              <option value="type">Sort by Type</option>
            </select>

            <select
              value={filters.sort_order}
              onChange={(e) => handleFilterChange({ sort_order: e.target.value })}
              className="filter-select"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          {getBreadcrumbs().map((crumb, index) => (
            <React.Fragment key={crumb.path}>
              {index > 0 && <span className="breadcrumb-separator">/</span>}
              <button
                className={`breadcrumb-item ${crumb.path === currentPath ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPath(crumb.path);
                  setSearchQuery('');
                  setSearchResults([]);
                  setIsSearching(false);
                  loadCurrentFolder(1);
                }}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* File List */}
      <div className="file-list-container">
        <div className="file-list">
          {getDisplayItems().length === 0 ? (
            <div className="empty-state">
              <p>{isSearching ? 'No files found matching your search.' : 'This folder is empty.'}</p>
            </div>
          ) : (
            getDisplayItems().map((item) => (
              <div
                key={item.path}
                className={`file-item ${item.is_directory ? 'directory' : 'file'} ${selectedItems.has(item.path) ? 'selected' : ''}`}
                onClick={() => handleItemPreview(item)}
                onDoubleClick={() => handleFolderClick(item)}
              >
                <div className="file-icon">
                  {getFileIcon(item)}
                </div>
                <div className="file-info">
                  <div className="file-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="file-details">
                    <span className="file-size">{item.size_formatted}</span>
                    <span className="file-date">{formatDate(item.last_modified)}</span>
                    <span className="file-type">{item.file_type}</span>
                  </div>
                </div>
                <div className="file-actions">
                  {!item.is_directory && renderDownloadButton(item)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="pagination">
            <button
              className="pagination-button"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.has_prev}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {pagination.page} of {pagination.pages} ({pagination.total} items)
            </span>
            <button
              className="pagination-button"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.has_next}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {showPreview && previewItem && (
        <div className="preview-modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{previewItem.name}</h3>
              <button
                className="close-button"
                onClick={() => setShowPreview(false)}
              >
                ✕
              </button>
            </div>
            <div className="preview-content">
              <div className="preview-icon">
                {getFileIcon(previewItem)}
              </div>
              <div className="preview-details">
                <div className="preview-detail">
                  <span className="detail-label">Path:</span>
                  <span className="detail-value">{previewItem.path}</span>
                </div>
                <div className="preview-detail">
                  <span className="detail-label">Size:</span>
                  <span className="detail-value">{previewItem.size_formatted}</span>
                </div>
                <div className="preview-detail">
                  <span className="detail-label">Type:</span>
                  <span className="detail-value">{previewItem.file_type}</span>
                </div>
                <div className="preview-detail">
                  <span className="detail-label">Modified:</span>
                  <span className="detail-value">{formatDate(previewItem.last_modified)}</span>
                </div>
                <div className="preview-detail">
                  <span className="detail-label">Permissions:</span>
                  <span className="detail-value">{previewItem.permissions}</span>
                </div>
                {previewItem.file_hash && (
                  <div className="preview-detail">
                    <span className="detail-label">Hash:</span>
                    <span className="detail-value">{previewItem.file_hash}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="preview-actions">
              <button
                className="download-button"
                onClick={() => {
                  handleFileDownload(previewItem);
                  setShowPreview(false);
                }}
              >
                Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExternalStorageBrowser;
