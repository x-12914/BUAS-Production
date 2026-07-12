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
import { Info } from 'lucide-react';
import UserList from './UserList';
import DashboardMap from './DashboardMap';
import ApiService from '../services/api';

const AnalystDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect }) => {
  const [activeTab, setActiveTab] = useState('devices');

  // Since backend filtering is now implemented, use dashboardData.users directly
  // The backend filter_devices_by_access function handles analyst device filtering
  const assignedDevices = dashboardData?.users || [];

  return (
    <div className="space-y-6">
      {/* Tab Navigation - Limited for Analysts */}
      <div className="flex items-center gap-1 p-1 bg-surface-raised rounded-xl border border-surface-border mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'devices' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('devices')}
        >
          My Assigned Devices
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'map' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('map')}
        >
          Location Map (Assigned)
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          {assignedDevices.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-semibold text-content mb-2">No Devices Assigned</h3>
              <p className="text-content-secondary text-sm">You currently have no devices assigned to you.</p>
              <p className="text-content-secondary text-sm">Contact your supervisor to request device assignments.</p>
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
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-info-muted text-info text-sm mb-4">
            <Info size={16} />
            <span>Showing location data for your assigned devices only</span>
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
