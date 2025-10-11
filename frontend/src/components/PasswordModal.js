/**
 * Password Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 * 
 * Modal for confirming password resets
 */

import React, { useState } from 'react';
import './PasswordModal.css';

const PasswordModal = ({ isOpen, onClose, onConfirm, user }) => {
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await onConfirm();
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading) return;
        onClose();
    };

    if (!isOpen || !user) return null;

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content password-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Reset Password</h3>
                    <button 
                        className="modal-close-btn" 
                        onClick={handleClose}
                        disabled={loading}
                    >
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    <div className="warning-icon">⚠️</div>
                    
                    <div className="confirmation-message">
                        <h4>Are you sure you want to reset the password for:</h4>
                        <div className="user-details">
                            <div className="user-name">{user.username}</div>
                            <div className="user-role">{user.role}</div>
                        </div>
                    </div>

                    <div className="password-reset-info">
                        <h5>What happens when you reset the password:</h5>
                        <ul>
                            <li>A new temporary password will be generated</li>
                            <li>The user's current password will be invalidated</li>
                            <li>Any account lockouts will be cleared</li>
                            <li>The user must change their password on next login</li>
                            <li>You must communicate the new password securely to the user</li>
                        </ul>
                    </div>

                    <div className="security-warning">
                        <strong>Security Notice:</strong> The temporary password will be displayed only once. 
                        Make sure to communicate it securely to the user through a trusted channel.
                    </div>
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
                        type="button"
                        className="btn btn-danger"
                        onClick={handleConfirm}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <span className="spinner"></span>
                                Resetting...
                            </>
                        ) : (
                            'Reset Password'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordModal;
