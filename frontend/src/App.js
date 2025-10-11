import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import DeviceDetail from './components/DeviceDetail';
import PhoneContacts from './components/PhoneContacts';
import DeviceLocationHistory from './components/DeviceLocationHistory';
import DeviceRecordingHistory from './components/DeviceRecordingHistory';
import SmsTable from './components/SmsTable';
import DeviceSmsHistory from './components/DeviceSmsHistory';
import CallLogsTable from './components/CallLogsTable';
import DeviceCallLogsHistory from './components/DeviceCallLogsHistory';
import ExternalStorageBrowser from './components/ExternalStorageBrowser';
import AuditLogs from './components/AuditLogs';
import Login from './components/Login';
import PasswordChange from './components/PasswordChange';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import authService from './services/authService';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Define functions first to avoid hoisting issues
  const checkAuthStatus = async () => {
    try {
      const isAuthenticated = await authService.checkAuth();
      if (isAuthenticated) {
        const currentUser = authService.getCurrentUser();
        setIsAuthenticated(true);
        setUser(currentUser);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = async () => {
    await authService.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  useEffect(() => {
    checkAuthStatus();
    
    // Listen for authentication changes from authService
    const handleAuthChange = (userData) => {
      if (userData) {
        setIsAuthenticated(true);
        setUser(userData);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    };
    
    // Add the listener
    authService.addAuthListener(handleAuthChange);
    
    // Cleanup listener on unmount
    return () => {
      authService.removeAuthListener(handleAuthChange);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="App dark-theme">
        <div className="auth-loading">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App dark-theme">
      <ErrorBoundary>
        <Router>
          <Routes>
            {/* Public routes */}
            <Route 
              path="/login" 
              element={
                isAuthenticated ? 
                <Navigate to="/" replace /> : 
                <Login onLoginSuccess={handleLoginSuccess} />
              } 
            />
            
            {/* Password change route */}
            <Route 
              path="/change-password" 
              element={
                <ProtectedRoute>
                  <PasswordChange onPasswordChanged={checkAuthStatus} />
                </ProtectedRoute>
              } 
            />
            
            {/* Protected routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard user={user} onLogout={handleLogout} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId" 
              element={
                <ProtectedRoute requiredPermission="view_dashboard">
                  <DeviceDetail user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/contacts" 
              element={
                <ProtectedRoute requiredPermission="view_dashboard">
                  <PhoneContacts user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/location" 
              element={
                <ProtectedRoute requiredPermission="access_location_data">
                  <DeviceLocationHistory user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/recordings" 
              element={
                <ProtectedRoute requiredPermission="access_audio_data">
                  <DeviceRecordingHistory user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/sms" 
              element={
                <ProtectedRoute requiredPermission="view_dashboard">
                  <DeviceSmsHistory user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/call_logs" 
              element={
                <ProtectedRoute requiredPermission="view_dashboard">
                  <DeviceCallLogsHistory user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/device/:deviceId/external-storage" 
              element={
                <ProtectedRoute requiredPermission="view_dashboard">
                  <ExternalStorageBrowser user={user} />
                </ProtectedRoute>
              } 
            />
            
            <Route 
              path="/audit-logs" 
              element={
                <ProtectedRoute requiredPermission="access_audit_logs">
                  <AuditLogs user={user} />
                </ProtectedRoute>
              } 
            />
            
            {/* Catch all route */}
            <Route 
              path="*" 
              element={
                isAuthenticated ? 
                <Navigate to="/" replace /> : 
                <Navigate to="/login" replace />
              } 
            />
          </Routes>
        </Router>
      </ErrorBoundary>
    </div>
  );
}

export default App;
