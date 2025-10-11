/**
 * Notification System for BUAS RBAC System
 * Toast notifications for user feedback following guide specifications
 */

import React, { useState, useEffect, createContext, useContext } from 'react';
import './NotificationSystem.css';

// Notification context
const NotificationContext = createContext();

// Notification types following guide specifications
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Notification provider component
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = (message, type = NOTIFICATION_TYPES.INFO, duration = 5000, persistent = false) => {
    const id = Date.now() + Math.random();
    const notification = {
      id,
      message,
      type,
      duration,
      persistent,
      timestamp: new Date()
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-remove notification unless it's persistent
    if (!persistent && duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // Helper methods for different notification types
  const success = (message, duration) => addNotification(message, NOTIFICATION_TYPES.SUCCESS, duration);
  const error = (message, duration = 8000) => addNotification(message, NOTIFICATION_TYPES.ERROR, duration);
  const warning = (message, duration = 6000) => addNotification(message, NOTIFICATION_TYPES.WARNING, duration);
  const info = (message, duration) => addNotification(message, NOTIFICATION_TYPES.INFO, duration);

  const contextValue = {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    success,
    error,
    warning,
    info
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
};

// Hook to use notifications
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

// Individual notification component
const NotificationItem = ({ notification, onRemove }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(notification.id), 300);
  };

  const getIcon = () => {
    switch (notification.type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return '✅';
      case NOTIFICATION_TYPES.ERROR:
        return '❌';
      case NOTIFICATION_TYPES.WARNING:
        return '⚠️';
      case NOTIFICATION_TYPES.INFO:
      default:
        return 'ℹ️';
    }
  };

  const classes = [
    'notification-item',
    `notification-${notification.type}`,
    isVisible ? 'notification-visible' : '',
    isExiting ? 'notification-exiting' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="notification-content">
        <span className="notification-icon">{getIcon()}</span>
        <span className="notification-message">{notification.message}</span>
        <button 
          className="notification-close"
          onClick={handleRemove}
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
      
      {/* Progress bar for timed notifications */}
      {!notification.persistent && notification.duration > 0 && (
        <div 
          className="notification-progress"
          style={{ 
            animationDuration: `${notification.duration}ms`,
            animationPlayState: isExiting ? 'paused' : 'running'
          }}
        />
      )}
    </div>
  );
};

// Notification container
const NotificationContainer = () => {
  const { notifications, removeNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={removeNotification}
        />
      ))}
    </div>
  );
};

// Higher-order component for automatic error handling
export const withNotifications = (WrappedComponent) => {
  return (props) => {
    const notifications = useNotifications();
    
    const enhancedProps = {
      ...props,
      notifications,
      // Helper to show success/error messages for API responses
      handleApiResponse: (response, successMessage) => {
        if (response.success) {
          notifications.success(successMessage || 'Operation completed successfully');
        } else {
          notifications.error(response.error || 'An error occurred');
        }
      }
    };

    return <WrappedComponent {...enhancedProps} />;
  };
};

// Quick notification helpers for specific RBAC scenarios
export const rbacNotifications = {
  // Authentication notifications
  loginSuccess: (notifications, username) => 
    notifications.success(`Welcome back, ${username}!`),
  
  loginFailed: (notifications, attemptsLeft) => 
    notifications.error(
      attemptsLeft 
        ? `Invalid credentials. ${attemptsLeft} attempts remaining.`
        : 'Invalid credentials. Please try again.'
    ),
  
  accountLocked: (notifications) => 
    notifications.error('Account locked due to too many failed attempts. Contact your administrator.', 0, true),
  
  passwordChanged: (notifications) => 
    notifications.success('Password changed successfully'),
  
  sessionExpired: (notifications) => 
    notifications.warning('Your session has expired. Please log in again.'),
  
  // User management notifications
  userCreated: (notifications, username, tempPassword) => 
    notifications.success(
      `User ${username} created successfully. Temporary password: ${tempPassword}`,
      10000
    ),
  
  userDeactivated: (notifications, username) => 
    notifications.success(`User ${username} has been deactivated`),
  
  devicesAssigned: (notifications, username, deviceCount) => 
    notifications.success(`${deviceCount} devices assigned to ${username}`),
  
  // Permission notifications
  accessDenied: (notifications, resource) => 
    notifications.warning(`Access denied to ${resource}. Check with your administrator.`),
  
  insufficientPermissions: (notifications, action) => 
    notifications.warning(`You don't have permission to ${action}`),
  
  // Recording notifications
  recordingStarted: (notifications, deviceId) => 
    notifications.success(`Recording started on device ${deviceId}`),
  
  recordingStopped: (notifications, deviceId) => 
    notifications.success(`Recording stopped on device ${deviceId}`),
  
  batchCommandSent: (notifications, deviceCount, command) => 
    notifications.success(`${command} command sent to ${deviceCount} devices`),
  
  // Data access notifications
  dataExported: (notifications, type) => 
    notifications.success(`${type} data exported successfully`),
  
  deviceOffline: (notifications, deviceId) => 
    notifications.warning(`Device ${deviceId} appears to be offline`),
  
  // System notifications
  systemMaintenance: (notifications) => 
    notifications.info('System maintenance scheduled. Some features may be unavailable.', 0, true),
  
  auditLogAccessed: (notifications) => 
    notifications.info('Audit log access recorded for compliance'),
  
  // Error notifications
  networkError: (notifications) => 
    notifications.error('Network connection error. Please check your connection.'),
  
  serverError: (notifications) => 
    notifications.error('Server error occurred. Please try again later.'),
  
  validationError: (notifications, field) => 
    notifications.error(`Validation error: ${field}`)
};

export default NotificationProvider;
