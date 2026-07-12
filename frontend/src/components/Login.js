// Login Component for BUAS RBAC System
// Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 3

import React, { useState, useEffect } from 'react';
import authService from '../services/authService';
import { User, Lock, AlertTriangle } from 'lucide-react';

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
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>{error}</span>
                </div>
                {attemptsLeft !== null && attemptsLeft > 0 && (
                    <div className="text-xs text-warning">
                        {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                    </div>
                )}
                {attemptsLeft === 0 && (
                    <div className="text-xs font-medium text-danger">
                        Account locked. Contact administrator.
                    </div>
                )}
            </div>
        );
    };

    const getMustChangePasswordMessage = () => {
        if (!mustChangePassword) return null;

        return (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning">
                <div className="flex items-center gap-2">
                    <Lock size={16} className="shrink-0" />
                    <span>You must change your password after login</span>
                </div>
                <button
                    className="w-full rounded-lg bg-warning px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-warning/90"
                    onClick={onLoginSuccess}
                >
                    Continue to Change Password
                </button>
            </div>
        );
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface p-4">
            {/* Login Container */}
            <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-raised p-8 shadow-2xl">
                {/* BUAS Branding */}
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-surface">
                        <span className="font-display text-lg font-bold text-accent">BUAS</span>
                    </div>
                    <h1 className="font-display text-2xl font-bold text-content">BUAS</h1>
                    <p className="mt-1 text-sm text-content-secondary">Briech UAS System</p>
                </div>

                {/* Login Form */}
                <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="username" className="sr-only">Username</label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted">
                                <User size={20} />
                            </span>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                placeholder="Username"
                                value={formData.username}
                                onChange={handleInputChange}
                                autoComplete="username"
                                required
                                className="w-full rounded-lg border border-surface-border bg-surface py-3 pl-10 pr-4 text-content placeholder-content-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="password" className="sr-only">Password</label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted">
                                <Lock size={20} />
                            </span>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleInputChange}
                                autoComplete="current-password"
                                required
                                className="w-full rounded-lg border border-surface-border bg-surface py-3 pl-10 pr-4 text-content placeholder-content-muted outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-content-secondary">
                            <input
                                type="checkbox"
                                name="remember"
                                checked={formData.remember}
                                onChange={handleInputChange}
                                disabled={isLoading}
                                className="h-4 w-4 rounded border-surface-border bg-surface text-accent focus:ring-accent"
                            />
                            <span>Remember me for 7 days</span>
                        </label>
                    </div>

                    <button
                        type="submit"
                        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
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
                <div className="mt-6 flex flex-col items-center gap-1 text-center text-xs text-content-muted">
                    <p>Contact your administrator for password assistance</p>
                    <p>2025 BUAS - All Rights Reserved</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
