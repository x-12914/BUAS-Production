/**
 * Loading Spinner Component for BUAS RBAC System
 * Provides professional loading states as specified in Segment 9 polish requirements
 */

import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
  size = 'medium', 
  message = 'Loading...', 
  type = 'spinner',
  overlay = false 
}) => {
  const spinnerClasses = `loading-spinner-container ${size} ${overlay ? 'overlay' : ''}`;
  
  const renderSpinner = () => {
    switch (type) {
      case 'dots':
        return (
          <div className="loading-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        );
      case 'pulse':
        return <div className="loading-pulse"></div>;
      default:
        return (
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
          </div>
        );
    }
  };

  return (
    <div className={spinnerClasses}>
      <div className="loading-content">
        {renderSpinner()}
        {message && <p className="loading-message">{message}</p>}
      </div>
    </div>
  );
};

export default LoadingSpinner;
