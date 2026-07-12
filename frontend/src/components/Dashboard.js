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
import { Pause, Play, Lock, Users, LogOut } from 'lucide-react';

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
          <div>
            {/* Tab Navigation - Full access for Super Super Admin */}
            <div className="flex items-center gap-2 mb-6">
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'devices' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'}`}
                onClick={() => setActiveTab('devices')}
              >
                DEVICE LIST
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'map' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'}`}
                onClick={() => setActiveTab('map')}
              >
                LOCATION MAP
              </button>
              <button
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'users' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'}`}
                onClick={() => setActiveTab('users')}
              >
                USER MANAGEMENT
              </button>
              {(currentUser?.role === 'super_user' || currentUser?.role === 'super_super_admin') && (
                <button
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'audit' ? 'bg-accent text-white' : 'text-content-secondary hover:text-content hover:bg-surface-hover'}`}
                  onClick={() => setActiveTab('audit')}
                >
                  AUDIT LOGS
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
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-surface-border border-t-accent rounded-full"></div>
        <p className="mt-4 text-sm text-content-secondary">Loading BUAS Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Dashboard Header */}
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-[12px] border-b border-surface-border">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-display font-bold text-white tracking-wide">BUAS</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${isPolling ? 'bg-accent/10 border-accent/30 text-accent' : 'border-surface-border text-content-secondary hover:bg-surface-hover'}`}
                onClick={togglePolling}
              >
                {isPolling ? <Pause size={14} className="inline mr-1.5" /> : <Play size={14} className="inline mr-1.5" />}
                {isPolling ? 'Pause Updates' : 'Resume Updates'}
              </button>
              <div className="flex items-center gap-2 text-xs text-content-secondary">
                <span className={`w-2 h-2 rounded-full ${isPolling ? 'bg-success animate-pulse-subtle' : 'bg-content-muted'}`}></span>
                <span>Live Updates</span>
              </div>
            </div>

            {/* User Menu */}
            <div className="user-menu relative">
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-hover transition-colors" onClick={toggleUserMenu}>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-content">{currentUser?.username || 'User'}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent-muted text-accent">
                    {currentUser?.role?.replace('_', ' ') || 'Loading...'}
                  </span>
                </span>
                <span className="text-xs text-content-muted">{showUserMenu ? '▲' : '▼'}</span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-surface-overlay border border-surface-border rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-4 py-2.5 border-b border-surface-border">
                    <div>
                      <strong className="text-sm text-content">{currentUser?.username || 'User'}</strong>
                      <small className="block text-xs text-content-muted mt-0.5">{currentUser?.agency_name || 'Briech UAS'}</small>
                    </div>
                  </div>
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-hover hover:text-content transition-colors" onClick={handleChangePassword}>
                    <Lock size={16} /> Change Password
                  </button>
                  {(currentUser?.role === 'super_super_admin' ||
                    currentUser?.role === 'super_user') && (
                    <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-hover hover:text-content transition-colors" onClick={() => {
                      setActiveTab('users');
                      setShowUserMenu(false);
                    }}>
                      <Users size={16} /> User Management
                    </button>
                  )}
                  <hr className="my-1 border-surface-border" />
                  <button className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors" onClick={handleLogout}>
                    <LogOut size={16} /> Logout
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
      <main className="flex-1 overflow-auto p-6 max-w-[1600px] mx-auto w-full">
        {/* Connection Status */}
        <ConnectionStatus
          status={connectionStatus}
          lastUpdated={lastUpdated}
          isPolling={isPolling}
        />

        {/* Role-specific Dashboard Content */}
        {renderDashboardContent()}
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border py-3 px-6 text-xs text-content-muted flex justify-between">
        <p>BUAS Dashboard v2.3.2 | Last Updated: {lastUpdated?.toLocaleTimeString()}</p>
        <p>Connected Users: {dashboardData?.total_users || 0}</p>
      </footer>
    </div>
  );
};

export default Dashboard;
