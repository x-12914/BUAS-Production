/**
 * Comprehensive Form Validation Utilities for BUAS RBAC System
 * Following guide validation requirements and password policy
 */

import { VALIDATION_MESSAGES } from './errorMessages';

// Validation rules following guide specifications
export const ValidationRules = {
  // Username validation (guide: 3-20 chars, letters/numbers/underscore)
  username: {
    required: true,
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_]+$/,
    errorMessage: VALIDATION_MESSAGES.username.pattern
  },
  
  // Password validation (guide: 12+ chars, uppercase, lowercase, numbers, special)
  password: {
    required: true,
    minLength: 12,
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?])[A-Za-z\d!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/,
    errorMessage: VALIDATION_MESSAGES.password.pattern
  },
  
  // Role validation (guide: specific role hierarchy)
  role: {
    required: true,
    options: ['super_super_admin', 'super_user', 'analyst', 'operator'],
    errorMessage: VALIDATION_MESSAGES.role.invalid
  },
  
  // Device ID validation
  deviceId: {
    required: true,
    pattern: /^[a-zA-Z0-9_-]+$/,
    minLength: 1,
    maxLength: 50,
    errorMessage: VALIDATION_MESSAGES.deviceId.pattern
  },
  
  // Agency ID validation
  agencyId: {
    required: true,
    type: 'number',
    min: 1,
    errorMessage: 'Please select a valid agency.'
  },
  
  // Duration validation (for recordings)
  duration: {
    required: true,
    type: 'number',
    min: 1,
    max: 3600, // Max 1 hour
    errorMessage: 'Duration must be between 1 and 3600 seconds.'
  }
};

/**
 * Validate a single field against its rules
 */
export const validateField = (fieldName, value, rules = ValidationRules[fieldName]) => {
  if (!rules) return { isValid: true, errors: [] };
  
  const errors = [];
  
  // Required validation
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    errors.push(VALIDATION_MESSAGES[fieldName]?.required || 'This field is required.');
    return { isValid: false, errors }; // Stop here if required field is empty
  }
  
  // Skip other validations if field is empty and not required
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return { isValid: true, errors: [] };
  }
  
  // Type validation
  if (rules.type === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      errors.push('Must be a valid number.');
    } else {
      value = numValue; // Use numeric value for further validation
    }
  }
  
  // Length validations
  if (rules.minLength && value.length < rules.minLength) {
    errors.push(VALIDATION_MESSAGES[fieldName]?.minLength || 
      `Must be at least ${rules.minLength} characters long.`);
  }
  
  if (rules.maxLength && value.length > rules.maxLength) {
    errors.push(VALIDATION_MESSAGES[fieldName]?.maxLength || 
      `Must be no more than ${rules.maxLength} characters long.`);
  }
  
  // Numeric range validations
  if (rules.min !== undefined && value < rules.min) {
    errors.push(`Must be at least ${rules.min}.`);
  }
  
  if (rules.max !== undefined && value > rules.max) {
    errors.push(`Must be no more than ${rules.max}.`);
  }
  
  // Pattern validation
  if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
    errors.push(rules.errorMessage || 'Invalid format.');
  }
  
  // Options validation
  if (rules.options && !rules.options.includes(value)) {
    errors.push(rules.errorMessage || 'Please select a valid option.');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate entire form object
 */
export const validateForm = (formData, validationRules = ValidationRules) => {
  const errors = {};
  let isValid = true;
  
  // Get all fields that need validation
  const fieldsToValidate = Object.keys(validationRules);
  
  // Also check any additional fields in formData
  const formFields = Object.keys(formData);
  const allFields = [...new Set([...fieldsToValidate, ...formFields])];
  
  allFields.forEach(fieldName => {
    if (validationRules[fieldName]) {
      const fieldValidation = validateField(fieldName, formData[fieldName], validationRules[fieldName]);
      if (!fieldValidation.isValid) {
        errors[fieldName] = fieldValidation.errors;
        isValid = false;
      }
    }
  });
  
  return { isValid, errors };
};

/**
 * Password strength calculator following guide requirements
 */
export const getPasswordStrength = (password) => {
  if (!password) return { strength: 0, label: 'No password', color: '#666', percentage: 0 };
  
  let score = 0;
  const checks = {
    length: password.length >= 12,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    numbers: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password),
    longLength: password.length >= 16 // Bonus for extra length
  };
  
  // Calculate score based on checks
  score = Object.values(checks).filter(Boolean).length;
  
  // Penalty for common patterns
  if (password.includes('123') || password.includes('abc') || password.includes('password')) {
    score = Math.max(0, score - 1);
  }
  
  const strengths = [
    { strength: 0, label: 'Very Weak', color: '#ef5350', percentage: 0 },
    { strength: 1, label: 'Weak', color: '#ff7043', percentage: 17 },
    { strength: 2, label: 'Fair', color: '#ff9800', percentage: 33 },
    { strength: 3, label: 'Good', color: '#ffc107', percentage: 50 },
    { strength: 4, label: 'Strong', color: '#8bc34a', percentage: 67 },
    { strength: 5, label: 'Very Strong', color: '#4caf50', percentage: 83 },
    { strength: 6, label: 'Excellent', color: '#2e7d32', percentage: 100 }
  ];
  
  return strengths[Math.min(score, 6)];
};

/**
 * Role-based validation (following guide hierarchy)
 */
export const validateRoleCreation = (creatorRole, targetRole) => {
  const roleHierarchy = {
    'super_super_admin': ['super_super_admin', 'super_user', 'analyst', 'operator'],
    'super_user': ['analyst', 'operator'],
    'analyst': [],
    'operator': []
  };
  
  const allowedRoles = roleHierarchy[creatorRole] || [];
  
  if (!allowedRoles.includes(targetRole)) {
    return {
      isValid: false,
      error: `${creatorRole} cannot create ${targetRole} accounts.`
    };
  }
  
  return { isValid: true };
};

/**
 * Device assignment validation
 */
export const validateDeviceAssignment = (userRole, deviceIds) => {
  if (userRole !== 'analyst') {
    return {
      isValid: false,
      error: 'Device assignment is only applicable to analysts.'
    };
  }
  
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
    return {
      isValid: false,
      error: 'At least one device must be assigned.'
    };
  }
  
  // Validate each device ID
  for (const deviceId of deviceIds) {
    const validation = validateField('deviceId', deviceId);
    if (!validation.isValid) {
      return {
        isValid: false,
        error: `Invalid device ID "${deviceId}": ${validation.errors.join(', ')}`
      };
    }
  }
  
  return { isValid: true };
};

/**
 * Real-time validation hook for React components
 */
export const useFormValidation = (initialState, validationRules) => {
  const [values, setValues] = React.useState(initialState);
  const [errors, setErrors] = React.useState({});
  const [touched, setTouched] = React.useState({});
  
  const validateAndSetErrors = (fieldName, value) => {
    const validation = validateField(fieldName, value, validationRules[fieldName]);
    setErrors(prev => ({
      ...prev,
      [fieldName]: validation.isValid ? undefined : validation.errors
    }));
    return validation.isValid;
  };
  
  const handleChange = (fieldName, value) => {
    setValues(prev => ({ ...prev, [fieldName]: value }));
    
    // Validate if field has been touched
    if (touched[fieldName]) {
      validateAndSetErrors(fieldName, value);
    }
  };
  
  const handleBlur = (fieldName) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    validateAndSetErrors(fieldName, values[fieldName]);
  };
  
  const validateAll = () => {
    const validation = validateForm(values, validationRules);
    setErrors(validation.errors);
    
    // Mark all fields as touched
    const allTouched = {};
    Object.keys(validationRules).forEach(field => {
      allTouched[field] = true;
    });
    setTouched(allTouched);
    
    return validation.isValid;
  };
  
  const reset = () => {
    setValues(initialState);
    setErrors({});
    setTouched({});
  };
  
  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    validateAll,
    reset,
    isValid: Object.keys(errors).length === 0
  };
};

/**
 * Custom validation for specific BUAS requirements
 */
export const customValidations = {
  // Ensure username doesn't contain sensitive terms
  usernameSecurityCheck: (username) => {
    const forbidden = ['admin', 'test', 'demo', 'guest', 'root', 'system'];
    const lower = username.toLowerCase();
    
    for (const term of forbidden) {
      if (lower.includes(term) && username !== 'superadmin') {
        return {
          isValid: false,
          error: `Username cannot contain "${term}".`
        };
      }
    }
    
    return { isValid: true };
  },
  
  // Check if device assignment is reasonable
  deviceAssignmentLimit: (deviceIds) => {
    if (deviceIds.length > 50) {
      return {
        isValid: false,
        error: 'Cannot assign more than 50 devices to a single analyst.'
      };
    }
    
    return { isValid: true };
  },
  
  // Validate recording duration is reasonable
  recordingDurationCheck: (duration, userRole) => {
    const maxDurations = {
      'operator': 1800,     // 30 minutes
      'super_user': 3600,   // 1 hour
      'super_super_admin': 7200 // 2 hours
    };
    
    const maxAllowed = maxDurations[userRole] || 300; // 5 minutes default
    
    if (duration > maxAllowed) {
      return {
        isValid: false,
        error: `Maximum recording duration for ${userRole} is ${maxAllowed} seconds.`
      };
    }
    
    return { isValid: true };
  }
};

export default {
  ValidationRules,
  validateField,
  validateForm,
  getPasswordStrength,
  validateRoleCreation,
  validateDeviceAssignment,
  useFormValidation,
  customValidations
};
