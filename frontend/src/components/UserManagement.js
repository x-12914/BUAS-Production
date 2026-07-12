/**
 * User Management Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 *
 * Main user management interface for Super Users
 */

import React, { useState, useEffect } from 'react';
import userService from '../services/userService';
import authService from '../services/authService';
import UserModal from './UserModal';
import DeviceAssignmentModal from './DeviceAssignmentModal';
import PasswordModal from './PasswordModal';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [filters, setFilters] = useState({
        role: '',
        status: 'active',
        search: ''
    });
    const [stats, setStats] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [modals, setModals] = useState({
        createUser: false,
        editUser: false,
        assignDevices: false,
        resetPassword: false
    });
    const [currentUser] = useState(() => authService.getCurrentUser());

    // Check if current user can manage users
    const canManageUsers = authService.hasPermission('manage_all_users') ||
                          authService.hasPermission('manage_agency_users');

    useEffect(() => {
        if (!canManageUsers) {
            setError('You do not have permission to manage users.');
            setLoading(false);
            return;
        }

        loadUsers();
        loadStats();
    }, [filters, canManageUsers]);

    const loadUsers = async () => {
        setLoading(true);
        setError('');

        try {
            const result = await userService.getUsers(filters);

            if (result.success) {
                setUsers(result.users);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to load users. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const result = await userService.getUserStats();
            if (result.success) {
                setStats(result.stats);
            }
        } catch (err) {
            console.error('Failed to load user stats:', err);
        }
    };

    const handleCreateUser = async (userData) => {
        try {
            const result = await userService.createUser(userData);

            if (result.success) {
                setSuccess(`User ${userData.username} created successfully. Temporary password: ${result.temporaryPassword}`);
                setModals(prev => ({ ...prev, createUser: false }));
                loadUsers();
                loadStats();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to create user. Please try again.');
        }
    };

    const handleResetPassword = async (userId) => {
        try {
            const result = await userService.resetUserPassword(userId);

            if (result.success) {
                setSuccess(`Password reset successfully. New temporary password: ${result.temporaryPassword}`);
                setModals(prev => ({ ...prev, resetPassword: false }));
                setSelectedUser(null);
                loadUsers();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to reset password. Please try again.');
        }
    };

    const handleDeactivateUser = async (userId, username) => {
        if (!window.confirm(`Are you sure you want to deactivate user "${username}"?`)) {
            return;
        }

        try {
            const result = await userService.deactivateUser(userId);

            if (result.success) {
                setSuccess(`User ${username} deactivated successfully.`);
                loadUsers();
                loadStats();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to deactivate user. Please try again.');
        }
    };

    const handleReactivateUser = async (userId, username) => {
        try {
            const result = await userService.reactivateUser(userId);

            if (result.success) {
                setSuccess(`User ${username} reactivated successfully.`);
                loadUsers();
                loadStats();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to reactivate user. Please try again.');
        }
    };

    const handleAssignDevices = async (userId, deviceIds) => {
        try {
            const result = await userService.assignDevices(userId, deviceIds);

            if (result.success) {
                setSuccess(result.message);
                setModals(prev => ({ ...prev, assignDevices: false }));
                setSelectedUser(null);
                loadUsers();
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to assign devices. Please try again.');
        }
    };

    const openModal = (modalName, user = null) => {
        setSelectedUser(user);
        setModals(prev => ({ ...prev, [modalName]: true }));
        setError('');
        setSuccess('');
    };

    const closeModal = (modalName) => {
        setModals(prev => ({ ...prev, [modalName]: false }));
        setSelectedUser(null);
    };

    const clearMessages = () => {
        setError('');
        setSuccess('');
    };

    const formatUserData = (user) => userService.formatUserForDisplay(user);

    // Permission checks for actions
    const canCreateRole = (role) => {
        if (role === 'super_user') {
            return authService.hasPermission('create_super_user');
        }
        return authService.hasPermission('create_analyst') || authService.hasPermission('create_operator');
    };

    const canManageUser = (user) => {
        if (currentUser.role === 'super_super_admin') {
            return true;
        }
        if (currentUser.role === 'super_user' && user.role !== 'super_super_admin') {
            return user.agency_id === currentUser.agency_id;
        }
        return false;
    };

    // Role badge classes
    const getRoleBadgeClasses = (role) => {
        const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
        switch (role) {
            case 'super_super_admin': return `${base} bg-danger-muted text-danger`;
            case 'super_user': return `${base} bg-accent-muted text-accent`;
            case 'analyst': return `${base} bg-info-muted text-info`;
            case 'operator': return `${base} bg-warning-muted text-warning`;
            default: return `${base} bg-surface-hover text-content-secondary`;
        }
    };

    if (!canManageUsers) {
        return (
            <div className="space-y-6">
                <div className="bg-danger-muted border border-danger/20 rounded-xl p-6 text-center">
                    <h3 className="text-lg font-semibold text-danger mb-2">Access Denied</h3>
                    <p className="text-sm text-content-secondary">You do not have permission to manage users.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-semibold text-content">User Management</h2>
                <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
                    onClick={() => openModal('createUser')}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Create New User
                </button>
            </div>

            {/* Statistics Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-surface-raised border border-surface-border rounded-xl p-4 text-center">
                        <div className="text-2xl font-display font-bold text-content">{stats.total_users}</div>
                        <div className="text-xs text-content-muted mt-1">Total Users</div>
                    </div>
                    <div className="bg-surface-raised border border-surface-border rounded-xl p-4 text-center">
                        <div className="text-2xl font-display font-bold text-content">{stats.active_users}</div>
                        <div className="text-xs text-content-muted mt-1">Active</div>
                    </div>
                    <div className="bg-surface-raised border border-surface-border rounded-xl p-4 text-center">
                        <div className="text-2xl font-display font-bold text-content">{stats.by_role?.analyst || 0}</div>
                        <div className="text-xs text-content-muted mt-1">Analysts</div>
                    </div>
                    <div className="bg-surface-raised border border-surface-border rounded-xl p-4 text-center">
                        <div className="text-2xl font-display font-bold text-content">{stats.by_role?.operator || 0}</div>
                        <div className="text-xs text-content-muted mt-1">Operators</div>
                    </div>
                </div>
            )}

            {/* Messages */}
            {error && (
                <div className="flex items-center justify-between bg-danger-muted border border-danger/20 rounded-lg px-4 py-3">
                    <span className="text-sm text-danger">{error}</span>
                    <button onClick={clearMessages} className="text-danger hover:text-danger/80 text-lg leading-none">&times;</button>
                </div>
            )}

            {success && (
                <div className="flex items-center justify-between bg-success-muted border border-success/20 rounded-lg px-4 py-3">
                    <span className="text-sm text-success">{success}</span>
                    <button onClick={clearMessages} className="text-success hover:text-success/80 text-lg leading-none">&times;</button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-muted">Role</label>
                        <select
                            value={filters.role}
                            onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
                        >
                            <option value="">All Roles</option>
                            {currentUser.role === 'super_super_admin' && (
                                <option value="super_user">Super Users</option>
                            )}
                            <option value="analyst">Analysts</option>
                            <option value="operator">Operators</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-muted">Status</label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="all">All</option>
                        </select>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-medium text-content-muted">Search</label>
                        <input
                            type="search"
                            placeholder="Search by username..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                            className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50"
                        />
                    </div>

                    <button
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                        onClick={() => setFilters({ role: '', status: 'active', search: '' })}
                    >
                        Clear Filters
                    </button>
                </div>
            </div>

            {/* User Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm text-content-muted">Loading users...</p>
                </div>
            ) : (
                <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-surface-border">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">User</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Role</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Last Login</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Created</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-content-secondary uppercase tracking-wider bg-surface">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-border">
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-4 py-8 text-center text-sm text-content-muted">
                                            No users found matching your criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    users.map(user => {
                                        const formattedUser = formatUserData(user);
                                        const canManage = canManageUser(user);

                                        return (
                                            <tr key={user.id} className={`hover:bg-surface-hover transition-colors ${!user.is_active ? 'opacity-60' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <div className="text-sm font-medium text-content">{user.username}</div>
                                                        {user.must_change_password && (
                                                            <div className="text-xs text-warning mt-0.5">
                                                                Must change password
                                                            </div>
                                                        )}
                                                        {user.assigned_devices_count > 0 && (
                                                            <div className="text-xs text-content-muted mt-0.5">
                                                                {user.assigned_devices_count} device(s) assigned
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={getRoleBadgeClasses(user.role)}>
                                                        {formattedUser.roleLabel}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {user.is_active ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success-muted text-success">
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-hover text-content-muted">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                                    {formattedUser.lastLoginFormatted}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap">
                                                    {formattedUser.createdAtFormatted}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        {canManage && (
                                                            <>
                                                                <button
                                                                    className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                                                                    onClick={() => openModal('resetPassword', user)}
                                                                    title="Reset Password"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                                    </svg>
                                                                </button>

                                                                {user.role === 'analyst' && (
                                                                    <button
                                                                        className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                                                                        onClick={() => openModal('assignDevices', user)}
                                                                        title="Assign Devices"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                                        </svg>
                                                                    </button>
                                                                )}

                                                                {user.is_active ? (
                                                                    <button
                                                                        className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-danger transition-colors"
                                                                        onClick={() => handleDeactivateUser(user.id, user.username)}
                                                                        title="Deactivate User"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                        </svg>
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        className="p-1.5 rounded-lg hover:bg-surface-hover text-content-muted hover:text-success transition-colors"
                                                                        onClick={() => handleReactivateUser(user.id, user.username)}
                                                                        title="Reactivate User"
                                                                    >
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                        </svg>
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals */}
            {modals.createUser && (
                <UserModal
                    isOpen={true}
                    onClose={() => closeModal('createUser')}
                    onSubmit={handleCreateUser}
                    title="Create New User"
                />
            )}

            {modals.assignDevices && selectedUser && (
                <DeviceAssignmentModal
                    isOpen={true}
                    onClose={() => closeModal('assignDevices')}
                    onSubmit={(deviceIds) => handleAssignDevices(selectedUser.id, deviceIds)}
                    user={selectedUser}
                />
            )}

            {modals.resetPassword && selectedUser && (
                <PasswordModal
                    isOpen={true}
                    onClose={() => closeModal('resetPassword')}
                    onConfirm={() => handleResetPassword(selectedUser.id)}
                    user={selectedUser}
                />
            )}
        </div>
    );
};

export default UserManagement;
