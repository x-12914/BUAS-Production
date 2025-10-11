// Password Change Component for BUAS RBAC System
// Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 3

import React, { useState, useEffect } from 'react';
import authService from '../services/authService';
import './PasswordChange.css';

const PasswordChange = ({ onPasswordChanged }) => {
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [passwordStrength, setPasswordStrength] = useState(null);
    const [requirements, setRequirements] = useState([]);
    const [showRequirements, setShowRequirements] = useState(false);
    
    // Load password requirements on component mount
    useEffect(() => {
        const loadRequirements = async () => {
            const result = await authService.getPasswordRequirements();
            if (result.success) {
                setRequirements(result.requirements);
            }
        };
        
        loadRequirements();
    }, []);
    
    // Check password strength when new password changes
    useEffect(() => {
        const checkStrength = async () => {
            if (formData.newPassword.length > 0) {
                const user = authService.getCurrentUser();
                const result = await authService.checkPasswordStrength(
                    formData.newPassword,
                    user?.username || ''
                );
                
                if (result.success) {
                    setPasswordStrength(result);
                }
            } else {
                setPasswordStrength(null);
            }
        };
        
        const debounceTimer = setTimeout(checkStrength, 300);
        return () => clearTimeout(debounceTimer);
    }, [formData.newPassword]);
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        
        // Clear error when user starts typing
        if (error) {
            setError('');
        }
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.currentPassword) {
            setError('Please enter your current password');
            return;
        }
        
        if (!formData.newPassword) {
            setError('Please enter a new password');
            return;
        }
        
        if (formData.newPassword !== formData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }
        
        if (passwordStrength && !passwordStrength.valid) {
            setError('Please choose a stronger password that meets all requirements');
            return;
        }
        
        setIsLoading(true);
        setError('');
        
        try {
            const result = await authService.changePassword(
                formData.currentPassword,
                formData.newPassword
            );
            
            if (result.success) {
                onPasswordChanged();
            } else {
                setError(result.error || 'Failed to change password');
            }
        } catch (error) {
            setError('Network error. Please check your connection.');
            console.error('Password change error:', error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getPasswordStrengthIndicator = () => {
        if (!passwordStrength || !formData.newPassword) return null;
        
        const strengthColors = {
            'Weak': '#ef4444',
            'Medium': '#f59e0b',
            'Strong': '#10b981'
        };
        
        const strengthColor = strengthColors[passwordStrength.strength] || '#6b7280';
        
        return (
            <div className="password-strength">
                <div className="strength-header">
                    <span>Password Strength: </span>
                    <span 
                        className="strength-level"
                        style={{ color: strengthColor }}
                    >
                        {passwordStrength.strength}
                    </span>
                    <span className="strength-score">({passwordStrength.score}/100)</span>
                </div>
                <div className="strength-bar">
                    <div 
                        className="strength-fill"
                        style={{ 
                            width: `${passwordStrength.score}%`,
                            backgroundColor: strengthColor
                        }}
                    />
                </div>
                {!passwordStrength.valid && (
                    <div className="strength-message error">
                        {passwordStrength.message}
                    </div>
                )}
            </div>
        );
    };
    
    const getPasswordRequirements = () => {
        if (!showRequirements || !requirements.length) return null;
        
        return (
            <div className="password-requirements">
                <h4>Password Requirements:</h4>
                <ul>
                    {requirements.map((requirement, index) => (
                        <li key={index}>{requirement}</li>
                    ))}
                </ul>
            </div>
        );
    };
    
    const user = authService.getCurrentUser();
    
    return (
        <div className="password-change-page">
            <div className="password-change-background">
                <div className="background-pattern"></div>
            </div>
            
            <div className="password-change-container">
                {/* Header */}
                <div className="password-change-header">
                    <div className="change-icon">🔒</div>
                    <h1 className="change-title">Change Password</h1>
                    <p className="change-subtitle">
                        {user?.must_change_password 
                            ? 'You must change your password to continue'
                            : 'Update your password for better security'
                        }
                    </p>
                </div>
                
                {/* Form */}
                <form className="password-change-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="currentPassword">Current Password</label>
                        <div className="input-container">
                            <input
                                type="password"
                                id="currentPassword"
                                name="currentPassword"
                                placeholder="Enter your current password"
                                value={formData.currentPassword}
                                onChange={handleInputChange}
                                required
                                className="password-input"
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="newPassword">
                            New Password
                            <button
                                type="button"
                                className="requirements-toggle"
                                onClick={() => setShowRequirements(!showRequirements)}
                            >
                                {showRequirements ? 'Hide' : 'Show'} Requirements
                            </button>
                        </label>
                        <div className="input-container">
                            <input
                                type="password"
                                id="newPassword"
                                name="newPassword"
                                placeholder="Enter your new password"
                                value={formData.newPassword}
                                onChange={handleInputChange}
                                required
                                className="password-input"
                                disabled={isLoading}
                            />
                        </div>
                        {getPasswordStrengthIndicator()}
                        {getPasswordRequirements()}
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm New Password</label>
                        <div className="input-container">
                            <input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                placeholder="Confirm your new password"
                                value={formData.confirmPassword}
                                onChange={handleInputChange}
                                required
                                className="password-input"
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    
                    {/* Error Message */}
                    {error && (
                        <div className="password-error">
                            <span className="error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}
                    
                    {/* Submit Button */}
                    <button 
                        type="submit" 
                        className={`change-button ${isLoading ? 'loading' : ''}`}
                        disabled={isLoading || (passwordStrength && !passwordStrength.valid)}
                    >
                        {isLoading ? (
                            <>
                                <span className="loading-spinner"></span>
                                Changing Password...
                            </>
                        ) : (
                            'Change Password'
                        )}
                    </button>
                </form>
                
                {/* Footer */}
                <div className="password-change-footer">
                    <p>Your password will expire in 90 days</p>
                </div>
            </div>
        </div>
    );
};

export default PasswordChange;
