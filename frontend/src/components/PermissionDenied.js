/**
 * Permission Denied Component for BUAS RBAC System
 * User-friendly access denied pages following guide specifications
 */

import React from 'react';
import './PermissionDenied.css';

const PermissionDenied = ({ 
  userRole, 
  requiredPermission, 
  customMessage,
  showRoleInfo = true,
  onGoBack 
}) => {
  
  const getRoleBasedMessage = () => {
    switch (userRole) {
      case 'operator':
        return {
          title: 'Access Restricted for Operators',
          message: 'As an Operator, you can control recordings but cannot access audio data, location history, or user management features.',
          suggestions: [
            'You can start and stop recordings for all devices',
            'You can view device status and recording indicators',
            'Contact your supervisor if you need access to data analysis features'
          ]
        };
      
      case 'analyst':
        return {
          title: 'Access Limited to Assigned Devices',
          message: 'As an Analyst, you can only access devices that have been assigned to you by your supervisor.',
          suggestions: [
            'You can view audio and location data for your assigned devices',
            'You can export reports for your assigned devices',
            'Contact your supervisor to request access to additional devices',
            'You cannot control recordings or manage other users'
          ]
        };
      
      case 'super_user':
        return {
          title: 'Super User Access Restriction',
          message: 'This feature requires additional privileges.',
          suggestions: [
            'You have full control over agency users and data',
            'You can create Analysts and Operators',
            'Contact your system administrator for elevated permissions',
            'You cannot create other Super Users or access system-wide settings'
          ]
        };
      
      default:
        return {
          title: 'Access Denied',
          message: 'You do not have permission to access this resource.',
          suggestions: [
            'Contact your administrator for assistance',
            'Your current role may not have the required permissions'
          ]
        };
    }
  };

  const roleInfo = getRoleBasedMessage();
  const displayMessage = customMessage || roleInfo.message;

  return (
    <div className="permission-denied-container">
      <div className="permission-denied-content">
        {/* Icon */}
        <div className="permission-denied-icon">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
            <path d="M15 9l-6 6" stroke="currentColor" strokeWidth="2"/>
            <path d="M9 9l6 6" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </div>

        {/* Title */}
        <h2 className="permission-denied-title">
          {customMessage ? 'Access Denied' : roleInfo.title}
        </h2>

        {/* Message */}
        <p className="permission-denied-message">
          {displayMessage}
        </p>

        {/* Role-specific information */}
        {showRoleInfo && !customMessage && (
          <div className="permission-info">
            <h3>What you can do:</h3>
            <ul className="permission-suggestions">
              {roleInfo.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Required permission info */}
        {requiredPermission && (
          <div className="technical-info">
            <details>
              <summary>Technical Details</summary>
              <p><strong>Your Role:</strong> {userRole}</p>
              <p><strong>Required Permission:</strong> {requiredPermission}</p>
            </details>
          </div>
        )}

        {/* Actions */}
        <div className="permission-denied-actions">
          {onGoBack && (
            <button 
              className="btn-secondary"
              onClick={onGoBack}
            >
              ← Go Back
            </button>
          )}
          
          <button 
            className="btn-primary"
            onClick={() => window.location.href = '/dashboard'}
          >
            Return to Dashboard
          </button>
        </div>

        {/* Contact info */}
        <div className="contact-info">
          <p className="help-text">
            Need help? Contact your administrator or supervisor for assistance.
          </p>
        </div>
      </div>
    </div>
  );
};

// Specialized components for different scenarios
export const OperatorDataAccessDenied = () => (
  <PermissionDenied 
    userRole="operator"
    customMessage="Operators cannot access audio recordings or location data. Your role is focused on recording control operations."
  />
);

export const AnalystDeviceAccessDenied = ({ deviceId }) => (
  <PermissionDenied 
    userRole="analyst"
    customMessage={`Device "${deviceId}" is not assigned to you. You can only access data from devices assigned by your supervisor.`}
  />
);

export const UserManagementAccessDenied = ({ userRole }) => (
  <PermissionDenied 
    userRole={userRole}
    customMessage="User management is restricted to Super Users only."
  />
);

export const AuditLogAccessDenied = ({ userRole }) => (
  <PermissionDenied 
    userRole={userRole}
    customMessage="Audit logs can only be viewed by Super Users for security and compliance purposes."
  />
);

export default PermissionDenied;
