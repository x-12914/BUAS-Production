// Password Change Component for BUAS RBAC System
// Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 3

import React, { useState, useEffect } from 'react';
import authService from '../services/authService';
import { Lock, AlertTriangle } from 'lucide-react';

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
            <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-content-secondary">Password Strength:</span>
                    <span
                        className="font-medium"
                        style={{ color: strengthColor }}
                    >
                        {passwordStrength.strength}
                    </span>
                    <span className="text-content-muted">({passwordStrength.score}/100)</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
                    <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                            width: `${passwordStrength.score}%`,
                            backgroundColor: strengthColor
                        }}
                    />
                </div>
                {!passwordStrength.valid && (
                    <div className="text-xs text-danger">
                        {passwordStrength.message}
                    </div>
                )}
            </div>
        );
    };

    const getPasswordRequirements = () => {
        if (!showRequirements || !requirements.length) return null;

        return (
            <div className="mt-3 rounded-lg border border-surface-border bg-surface p-3">
                <h4 className="mb-2 text-xs font-semibold text-content-secondary">Password Requirements:</h4>
                <ul className="space-y-1 text-xs text-content-muted">
                    {requirements.map((requirement, index) => (
                        <li key={index} className="flex items-start gap-1.5">
                            <span className="mt-0.5 block h-1 w-1 shrink-0 rounded-full bg-content-muted"></span>
                            {requirement}
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const user = authService.getCurrentUser();

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface p-4">
            <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-raised p-8 shadow-2xl">
                {/* Header */}
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-surface">
                        <Lock size={24} className="text-accent" />
                    </div>
                    <h1 className="font-display text-2xl font-bold text-content">Change Password</h1>
                    <p className="mt-1 text-sm text-content-secondary">
                        {user?.must_change_password
                            ? 'You must change your password to continue'
                            : 'Update your password for better security'
                        }
                    </p>
                </div>

                {/* Form */}
                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="currentPassword" className="mb-1.5 block text-sm font-medium text-content-secondary">
                            Current Password
                        </label>
                        <input
                            type="password"
                            id="currentPassword"
                            name="currentPassword"
                            placeholder="Enter your current password"
                            value={formData.currentPassword}
                            onChange={handleInputChange}
                            required
                            className="w-full rounded-lg border border-surface-border bg-surface px-4 py-3 text-content placeholder-content-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                            disabled={isLoading}
                        />
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="newPassword" className="text-sm font-medium text-content-secondary">
                                New Password
                            </label>
                            <button
                                type="button"
                                className="text-xs text-accent transition-colors hover:text-accent-hover"
                                onClick={() => setShowRequirements(!showRequirements)}
                            >
                                {showRequirements ? 'Hide' : 'Show'} Requirements
                            </button>
                        </div>
                        <input
                            type="password"
                            id="newPassword"
                            name="newPassword"
                            placeholder="Enter your new password"
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            required
                            className="w-full rounded-lg border border-surface-border bg-surface px-4 py-3 text-content placeholder-content-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                            disabled={isLoading}
                        />
                        {getPasswordStrengthIndicator()}
                        {getPasswordRequirements()}
                    </div>

                    <div>
                        <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-content-secondary">
                            Confirm New Password
                        </label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            placeholder="Confirm your new password"
                            value={formData.confirmPassword}
                            onChange={handleInputChange}
                            required
                            className="w-full rounded-lg border border-surface-border bg-surface px-4 py-3 text-content placeholder-content-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                            disabled={isLoading}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                            <AlertTriangle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                        disabled={isLoading || (passwordStrength && !passwordStrength.valid)}
                    >
                        {isLoading ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                                Changing Password...
                            </>
                        ) : (
                            'Change Password'
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div className="mt-6 text-center text-xs text-content-muted">
                    <p>Your password will expire in 90 days</p>
                </div>
            </div>
        </div>
    );
};

export default PasswordChange;
