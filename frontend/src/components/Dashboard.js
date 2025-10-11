import React, { useState, useEffect } from 'react';
import StatusBar from './StatusBar';
import UserList from './UserList';
import ConnectionStatus from './ConnectionStatus';
import DashboardMap from './DashboardMap';
import BatchRecordingControls from './BatchRecordingControls';
import UserManagement from './UserManagement';
import AuditLogs from './AuditLogs';
import AnalystDashboard from './AnalystDashboard';
import OperatorDashboard from './OperatorDashboard';
import SuperUserDashboard from './SuperUserDashboard';
import ApiService from '../services/api';
import authService from '../services/authService';
import './Dashboard.css';
import './RoleDashboards.css';

const Dashboard = ({ user, onLogout }) => {
  // State Management
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('devices'); // 'devices', 'map', or 'users'
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [currentUser, setCurrentUser] = useState(user); // Local state for user data

  // Define functions first to avoid hoisting issues
  const fetchDashboardData = async () => {
    try {
      // First check if server is healthy
      try {
        await ApiService.getHealthCheck();
      } catch (healthError) {
        console.warn('Health check failed, but attempting dashboard data fetch...');
      }
      
      const data = await ApiService.getDashboardData();
      setDashboardData(data);
      setConnectionStatus(data.connection_status || 'connected');
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err.message);
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  // Real-time Polling with 2-second intervals
  useEffect(() => {
    let pollInterval;
    
    if (isPolling) {
      // Initial fetch
      fetchDashboardData();
      
      // Set up polling
      pollInterval = setInterval(fetchDashboardData, 2000);
    }
    
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isPolling]);

  // Ensure user data is in sync - refresh if user prop is null but authService has user
  useEffect(() => {
    if (!user && authService.isAuthenticated()) {
      // Force parent to update user data
      const serviceUser = authService.getCurrentUser();
      if (serviceUser) {
        setCurrentUser(serviceUser); // Use service user as fallback
      }
    } else {
      setCurrentUser(user); // Use prop user when available
    }
  }, [user]);

  // Listen for auth changes to update user data in real time
  useEffect(() => {
    const handleAuthChange = (userData) => {
      setCurrentUser(userData);
    };
    
    authService.addAuthListener(handleAuthChange);
    
    return () => {
      authService.removeAuthListener(handleAuthChange);
    };
  }, []);

  // Handle user actions
  const togglePolling = () => {
    setIsPolling(!isPolling);
  };

  const handleLogout = async () => {
    await authService.logout();
    if (onLogout) {
      onLogout();
    }
  };

  const handleChangePassword = () => {
    window.location.href = '/change-password';
  };

  const toggleUserMenu = () => {
    setShowUserMenu(!showUserMenu);
  };

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const getRoleBadgeClass = (role) => {
    return `role-badge ${role.replace('_', '-')}`;
  };

  // Render role-specific dashboard content
  const renderDashboardContent = () => {
    const role = currentUser?.role;
    
    switch (role) {
      case 'analyst':
        return (
          <AnalystDashboard
            user={currentUser}
            dashboardData={dashboardData}
            loading={loading}
            selectedUser={selectedUser}
            onUserSelect={setSelectedUser}
          />
        );
        
      case 'operator':
        return (
          <OperatorDashboard
            user={currentUser}
            dashboardData={dashboardData}
            loading={loading}
            selectedUser={selectedUser}
            onUserSelect={setSelectedUser}
            isPolling={isPolling}
          />
        );
        
      case 'super_user':
        return (
          <SuperUserDashboard
            user={currentUser}
            dashboardData={dashboardData}
            loading={loading}
            selectedUser={selectedUser}
            onUserSelect={setSelectedUser}
            isPolling={isPolling}
          />
        );
        
      case 'super_super_admin':
      default:
        // Default/Super Super Admin view - full access
        return (
          <div className="super-admin-content">
            {/* Tab Navigation - Full access for Super Super Admin */}
            <div className="dashboard-tabs">
              <button 
                className={`tab-button ${activeTab === 'devices' ? 'active' : ''}`}
                onClick={() => setActiveTab('devices')}
              >
                📱 Device List
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
              {(currentUser?.role === 'super_user' || currentUser?.role === 'super_super_admin') && (
                <button 
                  className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audit')}
                >
                  📋 Audit Logs
                </button>
              )}
            </div>

            {/* Tab Content */}
            {activeTab === 'devices' && (
              <>
                {/* Batch Recording Controls */}
                <BatchRecordingControls 
                  devices={dashboardData?.users || []}
                  disabled={loading || !isPolling}
                />

                <UserList 
                  users={dashboardData?.users || []}
                  loading={loading}
                  selectedUser={selectedUser}
                  onUserSelect={setSelectedUser}
                />
              </>
            )}

            {activeTab === 'map' && (
              <DashboardMap />
            )}

            {activeTab === 'users' && (
              <UserManagement />
            )}

            {activeTab === 'audit' && (
              <AuditLogs user={currentUser} />
            )}
          </div>
        );
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="dashboard dark-theme">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading BUAS Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard dark-theme">
      {/* Dashboard Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <h1>🦇 BUAS Dashboard</h1>
          <div className="header-right">
            <div className="dashboard-controls">
              <button 
                className={`polling-toggle ${isPolling ? 'active' : ''}`}
                onClick={togglePolling}
              >
                {isPolling ? '⏸️' : '▶️'} 
                {isPolling ? 'Pause Updates' : 'Resume Updates'}
              </button>
              <div className="polling-indicator">
                <span className={`indicator-dot ${isPolling ? 'active' : ''}`}></span>
                <span>Live Updates</span>
              </div>
            </div>
            
            {/* User Menu */}
            <div className="user-menu">
              <button className="user-menu-toggle" onClick={toggleUserMenu}>
                <span className="user-info">
                  <span className="username">{currentUser?.username || 'User'}</span>
                  <span className={getRoleBadgeClass(currentUser?.role || 'operator')}>
                    {currentUser?.role?.replace('_', ' ') || 'Loading...'}
                  </span>
                </span>
                <span className="menu-arrow">{showUserMenu ? '▲' : '▼'}</span>
              </button>
              
              {showUserMenu && (
                <div className="user-menu-dropdown">
                  <div className="user-menu-header">
                    <div className="user-details">
                      <strong>{currentUser?.username || 'User'}</strong>
                      <small>{currentUser?.agency_name || 'Briech UAS'}</small>
                    </div>
                  </div>
                  <button className="user-menu-item" onClick={handleChangePassword}>
                    🔒 Change Password
                  </button>
                  {(currentUser?.role === 'super_super_admin' || 
                    currentUser?.role === 'super_user') && (
                    <button className="user-menu-item" onClick={() => {
                      setActiveTab('users');
                      setShowUserMenu(false);
                    }}>
                      👥 User Management
                    </button>
                  )}
                  <hr className="menu-divider" />
                  <button className="user-menu-item danger" onClick={handleLogout}>
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <StatusBar 
        data={dashboardData}
        connectionStatus={connectionStatus}
        lastUpdated={lastUpdated}
        error={error}
      />

      {/* Main Content */}
      <main className="dashboard-content">
        <div className="dashboard-main">
          {/* Connection Status */}
          <ConnectionStatus 
            status={connectionStatus}
            lastUpdated={lastUpdated}
            isPolling={isPolling}
          />

          {/* Role-specific Dashboard Content */}
          {renderDashboardContent()}
        </div>
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <div className="footer-content">
          <p>BUAS Dashboard v1.0.0 | Last Updated: {lastUpdated?.toLocaleTimeString()}</p>
          <p>Connected Users: {dashboardData?.total_users || 0} | Active Sessions: {dashboardData?.active_sessions_count || 0}</p>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;
