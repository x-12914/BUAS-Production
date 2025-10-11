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
import UserList from './UserList';
import DashboardMap from './DashboardMap';
import BatchRecordingControls from './BatchRecordingControls';
import UserManagement from './UserManagement';
import AuditLogs from './AuditLogs';
import './Dashboard.css';

const SuperUserDashboard = ({ user, dashboardData, loading, selectedUser, onUserSelect, isPolling }) => {
  const [activeTab, setActiveTab] = useState('devices');

  return (
    <div className="super-user-dashboard">
      {/* Super User-specific header - removed redundant "Super User View" text */}

      {/* Tab Navigation - Extended for Super Users */}
      <div className="dashboard-tabs">
        <button 
          className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => setActiveTab('devices')}
        >
          📱 Device Management
        </button>
        <button 
          className={`tab-button ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Location Map
        </button>
        <button 
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 User Management
        </button>
        <button 
          className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📋 Audit Logs
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'devices' && (
        <div className="super-user-devices">
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
        <div className="super-user-map">
          <DashboardMap 
            devices={dashboardData?.users || []}
            superUserMode={true}
          />
        </div>
      )}

      {activeTab === 'users' && (
        <div className="super-user-management">
          <div className="management-info">
            <div className="info-banner">
              <span className="icon">👥</span>
              <span>Manage Analysts and Operators in your agency</span>
            </div>
          </div>
          <UserManagement 
            restrictedMode={true}  // Cannot create other super users
            allowedRoles={['analyst', 'operator']}
          />
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="super-user-audit">
          <div className="audit-info">
            <div className="info-banner">
              <span className="icon">📋</span>
              <span>Security audit logs and compliance monitoring</span>
            </div>
          </div>
          <AuditLogs user={user} />
        </div>
      )}
    </div>
  );
};

export default SuperUserDashboard;
