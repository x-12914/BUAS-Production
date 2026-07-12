/**
 * User Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 *
 * Modal for creating new users
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import userService from '../services/userService';
import authService from '../services/authService';

const UserModal = ({ isOpen, onClose, onSubmit, title = "Create New User" }) => {
    const [formData, setFormData] = useState({
        username: '',
        role: ''
    });
    const [availableRoles, setAvailableRoles] = useState([]);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [usernameValidation, setUsernameValidation] = useState({ valid: true, message: '' });

    useEffect(() => {
        if (isOpen) {
            loadAvailableRoles();
            // Reset form when modal opens
            setFormData({ username: '', role: '' });
            setErrors({});
            setUsernameValidation({ valid: true, message: '' });
        }
    }, [isOpen]);

    const loadAvailableRoles = async () => {
        try {
            const result = await userService.getAvailableRoles();
            if (result.success) {
                setAvailableRoles(result.roles);
                // Auto-select first role if only one available
                if (result.roles.length === 1) {
                    setFormData(prev => ({ ...prev, role: result.roles[0].value }));
                }
            }
        } catch (error) {
            console.error('Failed to load available roles:', error);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));

        // Clear field error when user starts typing
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }

        // Validate username in real-time
        if (field === 'username') {
            const validation = userService.validateUsername(value);
            setUsernameValidation(validation);
        }
    };

    const validateForm = () => {
        const newErrors = {};

        // Username validation
        if (!formData.username.trim()) {
            newErrors.username = 'Username is required';
        } else if (!usernameValidation.valid) {
            newErrors.username = usernameValidation.message;
        }

        // Role validation
        if (!formData.role) {
            newErrors.role = 'Role is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setLoading(true);

        try {
            await onSubmit(formData);
        } catch (error) {
            console.error('Submit error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading) return; // Prevent closing while submitting
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
            <div className="bg-surface-overlay border border-surface-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                    <h2 className="text-lg font-display font-semibold text-content">{title}</h2>
                    <button
                        className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                        onClick={handleClose}
                        disabled={loading}
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Body */}
                    <div className="px-6 py-4 space-y-4">
                        <div className="space-y-1">
                            <label htmlFor="username" className="text-sm font-medium text-content-secondary">
                                Username <span className="text-danger">*</span>
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={formData.username}
                                onChange={(e) => handleInputChange('username', e.target.value)}
                                placeholder="Enter username"
                                disabled={loading}
                                className={`w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 ${errors.username ? 'border-danger/50' : 'border-surface-border'}`}
                            />
                            {errors.username && (
                                <p className="text-xs text-danger mt-1">{errors.username}</p>
                            )}
                            {formData.username && !usernameValidation.valid && (
                                <p className="text-xs text-warning mt-1">{usernameValidation.message}</p>
                            )}
                            {formData.username && usernameValidation.valid && usernameValidation.message && (
                                <p className="text-xs text-success mt-1">{usernameValidation.message}</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="role" className="text-sm font-medium text-content-secondary">
                                Role <span className="text-danger">*</span>
                            </label>
                            <select
                                id="role"
                                value={formData.role}
                                onChange={(e) => handleInputChange('role', e.target.value)}
                                disabled={loading}
                                className={`w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 ${errors.role ? 'border-danger/50' : 'border-surface-border'}`}
                            >
                                <option value="">Select a role</option>
                                {availableRoles.map(role => (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>
                            {errors.role && (
                                <p className="text-xs text-danger mt-1">{errors.role}</p>
                            )}

                            {/* Role description */}
                            {formData.role && (
                                <p className="text-xs text-content-muted mt-1">
                                    {availableRoles.find(r => r.value === formData.role)?.description}
                                </p>
                            )}
                        </div>

                        <div className="bg-surface-raised border border-surface-border rounded-lg p-3">
                            <h4 className="text-sm font-medium text-content-secondary mb-2">Password Information</h4>
                            <ul className="text-xs text-content-muted space-y-1 list-disc list-inside">
                                <li>A temporary password will be generated automatically</li>
                                <li>The user must change their password on first login</li>
                                <li>Communicate the temporary password securely to the user</li>
                            </ul>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
                        <button
                            type="button"
                            className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={loading || !usernameValidation.valid}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                    Creating...
                                </span>
                            ) : (
                                'Create User'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserModal;
