/**
 * Analyst Dashboard Component
 * BUAS RBAC Implementation - Segment 7: Dashboard Role Modifications
 * 
 * Restricted view for Analyst role:
 * - Only shows assigned devices
 * - Cannot control recordings
 * - Has access to audio/location data for assigned devices only
 * - No user management access
 */

import React, { useState } from 'react';
import UserList from './UserList';
import DashboardMap from './DashboardMap';
import ApiService from '../services/api';
import './Dashboard.css';

const AnalystDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect }) => {
  const [activeTab, setActiveTab] = useState('devices');

  // Since backend filtering is now implemented, use dashboardData.users directly
  // The backend filter_devices_by_access function handles analyst device filtering
  const assignedDevices = dashboardData?.users || [];

  return (
    <div className="analyst-dashboard">
      {/* Analyst-specific header - removed redundant "Analyst View" text */}

      {/* Tab Navigation - Limited for Analysts */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          📱 My Assigned Devices
        </button>
        <button 
          className={`tab-button ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Location Map (Assigned)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="analyst-devices">
          {assignedDevices.length === 0 && !loading ? (
            <div className="no-assignments">
              <div className="no-assignments-icon">📝</div>
              <h3>No Devices Assigned</h3>
              <p>You currently have no devices assigned to you.</p>
              <p>Contact your supervisor to request device assignments.</p>
            </div>
          ) : (
            <>
              {/* Note: No batch recording controls for analysts */}
              <UserList 
                users={assignedDevices}
                loading={loading}
                selectedUser={selectedUser}
                onUserSelect={onUserSelect}
                roleRestrictions={{
                  hideRecordingControls: true,
                  showAssignmentInfo: true,
                  restrictedAccess: true
                }}
              />
            </>
          )}
        </div>
      )}

      {activeTab === 'map' && (
        <div className="analyst-map">
          <div className="map-info">
            <div className="info-banner">
              <span className="icon">🔍</span>
              <span>Showing location data for your assigned devices only</span>
            </div>
          </div>
          <DashboardMap 
            devices={assignedDevices}
            restrictedView={true}
          />
        </div>
      )}
    </div>
  );
};

export default AnalystDashboard;
