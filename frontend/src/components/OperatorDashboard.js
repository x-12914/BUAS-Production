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

const OperatorDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect, isPolling }) => {
  const [activeTab, setActiveTab] = useState('devices');

  return (
    <div className="space-y-6">
      {/* Tab Navigation - Limited for Operators */}
      <div className="flex items-center gap-1 p-1 bg-surface-raised rounded-xl border border-surface-border mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'devices' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('devices')}
        >
          Device Control
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
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
