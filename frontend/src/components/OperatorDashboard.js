/**
 * Operator Dashboard Component
 * BUAS RBAC Implementation - Segment 7: Dashboard Role Modifications
 * 
 * Limited view for Operator role:
 * - Can see all devices
 * - Can control recordings
 * - NO access to audio data
 * - NO access to location data
 * - NO user management access
 */

import React, { useState, useEffect } from 'react';
import UserList from './UserList';
import BatchRecordingControls from './BatchRecordingControls';
import ApiService from '../services/api';
import './Dashboard.css';

const OperatorDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect, isPolling }) => {
  const [activeTab, setActiveTab] = useState('devices');

  return (
    <div className="operator-dashboard">
      {/* Operator-specific header - removed redundant "Operator View" text */}

      {/* Tab Navigation - Limited for Operators */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          📱 Device Control
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="operator-devices">
          {/* Batch Recording Controls - Full access for operators */}
          <BatchRecordingControls 
            devices={dashboardData?.users || []}
            disabled={loading || !isPolling}
            operatorMode={true}
          />

          <UserList 
            users={dashboardData?.users || []}
            loading={loading}
            selectedUser={selectedUser}
            onUserSelect={onUserSelect}
            roleRestrictions={{
              hideAudioAccess: true,
              hideLocationAccess: true,
              hideDeviceDetails: true,
              showRecordingControls: true,
              operatorMode: true
            }}
          />
        </div>
      )}
    </div>
  );
};

export default OperatorDashboard;
