// Login Component for BUAS RBAC System
// Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 3

import React, { useState, useEffect } from 'react';
import authService from '../services/authService';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        remember: false
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [attemptsLeft, setAttemptsLeft] = useState(null);
    const [mustChangePassword, setMustChangePassword] = useState(false);
    
    // Check if already authenticated on component mount
    useEffect(() => {
        const checkExistingAuth = async () => {
            try {
                const isAuth = await authService.checkAuth();
                if (isAuth) {
                    onLoginSuccess();
                }
            } catch (error) {
                console.log('Not authenticated:', error);
            }
        };
        
        checkExistingAuth();
    }, [onLoginSuccess]);
    
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        
        // Clear error when user starts typing
        if (error) {
            setError('');
        }
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.username.trim() || !formData.password) {
            setError('Please enter both username and password');
            return;
        }
        
        setIsLoading(true);
        setError('');
        setAttemptsLeft(null);
        
        try {
            const result = await authService.login(
                formData.username.trim(),
                formData.password,
                formData.remember
            );
            
            if (result.success) {
                if (result.mustChangePassword) {
                    setMustChangePassword(true);
                } else {
                    onLoginSuccess();
                }
            } else {
                setError(result.error || 'Login failed');
                if (result.attemptsLeft !== undefined) {
                    setAttemptsLeft(result.attemptsLeft);
                }
            }
        } catch (error) {
            setError('Network error. Please check your connection.');
            console.error('Login error:', error);
        } finally {
            setIsLoading(false);
        }
    };
    
    const getErrorMessage = () => {
        if (!error) return null;
        
        return (
            <div className="login-error">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                    <div className="attempts-warning">
                        {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                    </div>
                )}
                {attemptsLeft === 0 && (
                    <div className="lockout-warning">
                        Account locked. Contact administrator.
                    </div>
                )}
            </div>
        );
    };
    
    const getMustChangePasswordMessage = () => {
        if (!mustChangePassword) return null;
        
        return (
            <div className="login-warning">
                <span className="warning-icon">🔒</span>
                <span>You must change your password after login</span>
                <button 
                    className="continue-button"
                    onClick={onLoginSuccess}
                >
                    Continue to Change Password
                </button>
            </div>
        );
    };
    
    return (
        <div className="login-page">
            {/* Background */}
            <div className="login-background">
                <div className="background-pattern"></div>
            </div>
            
            {/* Login Container */}
            <div className="login-container">
                {/* BUAS Branding */}
                <div className="login-header">
                    <div className="login-logo">
                        <div className="logo-circle">
                            <span className="logo-text">BUAS</span>
                        </div>
                    </div>
                    <h1 className="login-title">BUAS Command Center</h1>
                    <p className="login-subtitle">Briech UAS System</p>
                </div>
                
                {/* Login Form */}
                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username" className="sr-only">Username</label>
                        <div className="input-container">
                            <span className="input-icon">👤</span>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                placeholder="Username"
                                value={formData.username}
                                onChange={handleInputChange}
                                autoComplete="username"
                                required
                                className="login-input"
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    
                    <div className="form-group">
                        <label htmlFor="password" className="sr-only">Password</label>
                        <div className="input-container">
                            <span className="input-icon">🔒</span>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleInputChange}
                                autoComplete="current-password"
                                required
                                className="login-input"
                                disabled={isLoading}
                            />
                        </div>
                    </div>
                    
                    <div className="form-options">
                        <label className="remember-me">
                            <input
                                type="checkbox"
                                name="remember"
                                checked={formData.remember}
                                onChange={handleInputChange}
                                disabled={isLoading}
                            />
                            <span className="checkmark"></span>
                            <span>Remember me for 7 days</span>
                        </label>
                    </div>
                    
                    <button 
                        type="submit" 
                        className={`login-button ${isLoading ? 'loading' : ''}`}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="loading-spinner"></span>
                                Signing In...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                    
                    {/* Error Messages */}
                    {getErrorMessage()}
                    
                    {/* Must Change Password Message */}
                    {getMustChangePasswordMessage()}
                </form>
                
                {/* Footer */}
                <div className="login-footer">
                    <p className="login-help">
                        Contact your administrator for password assistance
                    </p>
                    <p className="login-copyright">
                        © 2025 BUAS - All Rights Reserved
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
