/**
 * Standardized Error Messages for BUAS RBAC System
 * Ensures consistent user experience across all components
 * Following Segment 9 polish requirements from implementation guide
 */

// Error message constants following guide specifications
export const ERROR_MESSAGES = {
  // Authentication errors (as specified in guide)
  INVALID_CREDENTIALS: 'Invalid username or password. Please try again.',
  ACCOUNT_LOCKED: 'Account has been locked due to too many failed login attempts. Please contact your administrator.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  PERMISSION_DENIED: 'You do not have permission to access this resource.',
  
  // User management errors (following guide hierarchy)
  USERNAME_TAKEN: 'This username is already taken. Please choose a different one.',
  INVALID_USERNAME: 'Username must be 3-20 characters long and contain only letters, numbers, and underscores.',
  WEAK_PASSWORD: 'Password must be at least 12 characters long and contain uppercase, lowercase, numbers, and special characters.',
  PASSWORD_HISTORY: 'Cannot reuse recent passwords. Please choose a different password.',
  USER_NOT_FOUND: 'The specified user could not be found.',
  CANNOT_DELETE_SELF: 'You cannot delete your own account.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to manage this user.',
  ROLE_CREATION_DENIED: 'You are not authorized to create users with this role.',
  
  // Device errors (as per guide specifications)
  DEVICE_NOT_FOUND: 'The requested device could not be found.',
  DEVICE_ACCESS_DENIED: 'You do not have access to this device. Please contact your administrator if you need access.',
  DEVICE_OFFLINE: 'This device is currently offline and cannot be accessed.',
  RECORDING_FAILED: 'Failed to start recording. Please check device status and try again.',
  DEVICE_NOT_ASSIGNED: 'This device is not assigned to you. Contact your supervisor for access.',
  
  // Network and system errors
  NETWORK_ERROR: 'Network connection error. Please check your internet connection and try again.',
  SERVER_ERROR: 'Server error occurred. Please try again later or contact support.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable. Please try again later.',
  
  // Form validation errors
  REQUIRED_FIELD: 'This field is required.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_PHONE: 'Please enter a valid phone number.',
  PASSWORDS_DONT_MATCH: 'Passwords do not match.',
  INVALID_DATE: 'Please enter a valid date.',
  FIELD_TOO_LONG: 'This field is too long.',
  FIELD_TOO_SHORT: 'This field is too short.',
  
  // File upload errors
  FILE_TOO_LARGE: 'File size is too large. Maximum size is 10MB.',
  INVALID_FILE_TYPE: 'Invalid file type. Please upload a supported format.',
  UPLOAD_FAILED: 'File upload failed. Please try again.',
  
  // Audit and security errors
  AUDIT_ACCESS_DENIED: 'You do not have permission to view audit logs.',
  EXPORT_FAILED: 'Data export failed. Please try again.',
  SECURITY_VIOLATION: 'Security policy violation detected.',
  
  // General errors
  UNEXPECTED_ERROR: 'An unexpected error occurred. Please try again or contact support.',
  MAINTENANCE_MODE: 'System is currently under maintenance. Please try again later.',
  FEATURE_DISABLED: 'This feature is currently disabled.',
};

// Success messages following guide specifications
export const SUCCESS_MESSAGES = {
  // Authentication success
  LOGIN_SUCCESS: 'Successfully logged in. Welcome back!',
  LOGOUT_SUCCESS: 'Successfully logged out.',
  PASSWORD_CHANGED: 'Password changed successfully.',
  
  // User management success (following guide hierarchy)
  USER_CREATED: 'User account created successfully.',
  USER_UPDATED: 'User information updated successfully.',
  USER_DEACTIVATED: 'User account deactivated successfully.',
  USER_REACTIVATED: 'User account reactivated successfully.',
  DEVICES_ASSIGNED: 'Devices assigned successfully.',
  PASSWORD_RESET: 'Password reset successfully.',
  
  // Device and recording success
  RECORDING_STARTED: 'Recording started successfully.',
  RECORDING_STOPPED: 'Recording stopped successfully.',
  DEVICE_REGISTERED: 'Device registered successfully.',
  BATCH_COMMAND_SENT: 'Batch command sent to all selected devices.',
  
  // Data and export success
  DATA_EXPORTED: 'Data exported successfully.',
  REPORT_GENERATED: 'Report generated successfully.',
  
  // General success
  CHANGES_SAVED: 'Changes saved successfully.',
  OPERATION_COMPLETED: 'Operation completed successfully.',
};

// Warning messages
export const WARNING_MESSAGES = {
  PASSWORD_EXPIRING: 'Your password will expire soon. Please change it.',
  UNSAVED_CHANGES: 'You have unsaved changes. Are you sure you want to leave?',
  DEVICE_OFFLINE: 'This device appears to be offline.',
  LIMITED_ACCESS: 'You have limited access to this resource.',
  BETA_FEATURE: 'This is a beta feature. Use with caution.',
};

/**
 * Get appropriate error message for HTTP status codes
 * Following guide error handling specifications
 */
export const getErrorMessageForStatus = (status, defaultMessage = ERROR_MESSAGES.UNEXPECTED_ERROR) => {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return ERROR_MESSAGES.UNAUTHORIZED;
    case 403:
      return ERROR_MESSAGES.PERMISSION_DENIED;
    case 404:
      return 'The requested resource could not be found.';
    case 409:
      return 'Conflict detected. The resource may have been modified by another user.';
    case 422:
      return 'Invalid data provided. Please check your input.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
      return ERROR_MESSAGES.SERVER_ERROR;
    case 503:
      return ERROR_MESSAGES.SERVICE_UNAVAILABLE;
    default:
      return defaultMessage;
  }
};

/**
 * Format error messages consistently
 * Handles various error object formats
 */
export const formatErrorMessage = (error, fallbackMessage = ERROR_MESSAGES.UNEXPECTED_ERROR) => {
  // Handle string errors
  if (typeof error === 'string') {
    return error;
  }
  
  // Handle API response errors
  if (error?.response?.data?.error) {
    return error.response.data.error;
  }
  
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  // Handle HTTP status errors
  if (error?.response?.status) {
    return getErrorMessageForStatus(error.response.status, fallbackMessage);
  }
  
  // Handle network errors
  if (error?.message) {
    if (error.message.includes('Network Error') || error.message.includes('ERR_NETWORK')) {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }
    if (error.message.includes('timeout')) {
      return ERROR_MESSAGES.TIMEOUT_ERROR;
    }
    return error.message;
  }
  
  return fallbackMessage;
};

/**
 * Get user-friendly error message based on error type and user role
 * Following guide role-based messaging
 */
export const getRoleBasedErrorMessage = (error, userRole) => {
  const baseMessage = formatErrorMessage(error);
  
  // Add role-specific context for certain errors
  if (baseMessage.includes('permission') || baseMessage.includes('authorized')) {
    switch (userRole) {
      case 'operator':
        return `${baseMessage} Operators can control recordings but cannot access audio data or user management.`;
      case 'analyst':
        return `${baseMessage} Analysts can only access assigned devices and their data.`;
      case 'super_user':
        return `${baseMessage} Contact the Super Super Admin for elevated permissions.`;
      default:
        return baseMessage;
    }
  }
  
  return baseMessage;
};

/**
 * Error severity levels for proper display styling
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Get error severity based on error type
 */
export const getErrorSeverity = (error) => {
  const message = formatErrorMessage(error).toLowerCase();
  
  if (message.includes('critical') || message.includes('security') || message.includes('locked')) {
    return ERROR_SEVERITY.CRITICAL;
  }
  
  if (message.includes('failed') || message.includes('error') || message.includes('denied')) {
    return ERROR_SEVERITY.HIGH;
  }
  
  if (message.includes('warning') || message.includes('expired') || message.includes('offline')) {
    return ERROR_SEVERITY.MEDIUM;
  }
  
  return ERROR_SEVERITY.LOW;
};

/**
 * Validation error messages for forms
 * Following guide validation requirements
 */
export const VALIDATION_MESSAGES = {
  username: {
    required: 'Username is required.',
    minLength: 'Username must be at least 3 characters long.',
    maxLength: 'Username must be no more than 20 characters long.',
    pattern: 'Username can only contain letters, numbers, and underscores.',
    taken: 'This username is already taken.'
  },
  password: {
    required: 'Password is required.',
    minLength: 'Password must be at least 12 characters long.',
    pattern: 'Password must contain uppercase, lowercase, numbers, and special characters.',
    match: 'Passwords do not match.',
    history: 'Cannot reuse recent passwords.'
  },
  role: {
    required: 'Please select a role.',
    invalid: 'Invalid role selected.',
    unauthorized: 'You are not authorized to assign this role.'
  },
  deviceId: {
    required: 'Device ID is required.',
    pattern: 'Device ID can only contain letters, numbers, hyphens, and underscores.',
    notFound: 'Device not found.'
  }
};

export default {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  WARNING_MESSAGES,
  formatErrorMessage,
  getErrorMessageForStatus,
  getRoleBasedErrorMessage,
  getErrorSeverity,
  ERROR_SEVERITY,
  VALIDATION_MESSAGES
};
