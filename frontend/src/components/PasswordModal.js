/**
 * Password Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 *
 * Modal for confirming password resets
 */

import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
            <div className="bg-surface-overlay border border-surface-border rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                    <h2 className="text-lg font-display font-semibold text-content">Reset Password</h2>
                    <button
                        className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                        onClick={handleClose}
                        disabled={loading}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-4 space-y-4">
                    <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
                            <AlertTriangle size={24} className="text-warning" />
                        </div>
                    </div>

                    <div className="text-center space-y-2">
                        <h4 className="text-sm font-medium text-content">Are you sure you want to reset the password for:</h4>
                        <div className="bg-surface-raised border border-surface-border rounded-lg px-4 py-3">
                            <div className="text-sm font-semibold text-content">{user.username}</div>
                            <div className="text-xs text-content-muted mt-0.5">{user.role}</div>
                        </div>
                    </div>

                    <div className="bg-surface-raised border border-surface-border rounded-lg p-3">
                        <h5 className="text-xs font-medium text-content-secondary mb-2">What happens when you reset the password:</h5>
                        <ul className="text-xs text-content-muted space-y-1 list-disc list-inside">
                            <li>A new temporary password will be generated</li>
                            <li>The user's current password will be invalidated</li>
                            <li>Any account lockouts will be cleared</li>
                            <li>The user must change their password on next login</li>
                            <li>You must communicate the new password securely to the user</li>
                        </ul>
                    </div>

                    <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
                        <p className="text-xs text-content-secondary">
                            <span className="font-semibold text-danger">Security Notice:</span> The temporary password will be displayed only once.
                            Make sure to communicate it securely to the user through a trusted channel.
                        </p>
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
                        type="button"
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleConfirm}
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-4 border-2 border-danger/30 border-t-danger rounded-full animate-spin"></span>
                                Resetting...
                            </span>
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
