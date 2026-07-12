/**
 * Super User Dashboard Component
 * BUAS RBAC Implementation - Segment 7: Dashboard Role Modifications
 *
 * Enhanced view for Super User role:
 * - Can see all devices in their agency
 * - Full recording control
 * - Full data access
 * - User management for analysts and operators
 * - Cannot create other super users
 */

import React, { useState } from 'react';
import { Info } from 'lucide-react';
import UserList from './UserList';
import DashboardMap from './DashboardMap';
import BatchRecordingControls from './BatchRecordingControls';
import UserManagement from './UserManagement';
import AuditLogs from './AuditLogs';

const SuperUserDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect, isPolling }) => {
  const [activeTab, setActiveTab] = useState('devices');

  return (
    <div className="space-y-6">
      {/* Tab Navigation - Extended for Super Users */}
      <div className="flex items-center gap-1 p-1 bg-surface-raised rounded-xl border border-surface-border mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'devices' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('devices')}
        >
          Device Management
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'map' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('map')}
        >
          Location Map
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'users' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('users')}
        >
          User Management
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'audit' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'
          }`}
          onClick={() => setActiveTab('audit')}
        >
          Audit Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="space-y-4">
          {/* Batch Recording Controls */}
          <BatchRecordingControls
            devices={dashboardData?.users || []}
            disabled={loading || !isPolling}
            superUserMode={true}
          />

          <UserList
            users={dashboardData?.users || []}
            loading={loading}
            selectedUser={selectedUser}
            onUserSelect={onUserSelect}
            roleRestrictions={{
              fullAccess: true,
              showManagementTools: true,
              superUserMode: true
            }}
          />
        </div>
      )}

      {activeTab === 'map' && (
        <div className="space-y-4">
          <DashboardMap
            devices={dashboardData?.users || []}
            superUserMode={true}
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-info-muted text-info text-sm mb-4">
            <Info size={16} />
            <span>Manage Analysts and Operators in your agency</span>
          </div>
          <UserManagement
            restrictedMode={true}  // Cannot create other super users
            allowedRoles={['analyst', 'operator']}
          />
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-info-muted text-info text-sm mb-4">
            <Info size={16} />
            <span>Security audit logs and compliance monitoring</span>
          </div>
          <AuditLogs user={user} />
        </div>
      )}
    </div>
  );
};

export default SuperUserDashboard;
