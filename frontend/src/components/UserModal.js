/**
 * User Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 * 
 * Modal for creating new users
 */

import React, { useState, useEffect } from 'react';
import userService from '../services/userService';
import authService from '../services/authService';
import './UserModal.css';

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
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button 
                        className="modal-close-btn" 
                        onClick={handleClose}
                        disabled={loading}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="user-form">
                    <div className="form-group">
                        <label htmlFor="username">
                            Username <span className="required">*</span>
                        </label>
                        <input
                            id="username"
                            type="text"
                            value={formData.username}
                            onChange={(e) => handleInputChange('username', e.target.value)}
                            placeholder="Enter username"
                            disabled={loading}
                            className={errors.username ? 'error' : ''}
                        />
                        {errors.username && (
                            <div className="field-error">{errors.username}</div>
                        )}
                        {formData.username && !usernameValidation.valid && (
                            <div className="field-warning">{usernameValidation.message}</div>
                        )}
                        {formData.username && usernameValidation.valid && usernameValidation.message && (
                            <div className="field-success">{usernameValidation.message}</div>
                        )}
                    </div>

                    <div className="form-group">
                        <label htmlFor="role">
                            Role <span className="required">*</span>
                        </label>
                        <select
                            id="role"
                            value={formData.role}
                            onChange={(e) => handleInputChange('role', e.target.value)}
                            disabled={loading}
                            className={errors.role ? 'error' : ''}
                        >
                            <option value="">Select a role</option>
                            {availableRoles.map(role => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>
                        {errors.role && (
                            <div className="field-error">{errors.role}</div>
                        )}
                        
                        {/* Role description */}
                        {formData.role && (
                            <div className="role-description">
                                {availableRoles.find(r => r.value === formData.role)?.description}
                            </div>
                        )}
                    </div>

                    <div className="password-info">
                        <h4>Password Information</h4>
                        <ul>
                            <li>A temporary password will be generated automatically</li>
                            <li>The user must change their password on first login</li>
                            <li>Communicate the temporary password securely to the user</li>
                        </ul>
                    </div>

                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={loading || !usernameValidation.valid}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner"></span>
                                    Creating...
                                </>
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
