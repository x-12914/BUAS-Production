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
import './UserManagement.css';

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

    if (!canManageUsers) {
        return (
            <div className="user-management">
                <div className="error-message">
                    <h3>Access Denied</h3>
                    <p>You do not have permission to manage users.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="user-management">
            {/* Header */}
            <div className="user-management-header">
                <div className="header-content">
                    <h2>User Management</h2>
                    <button 
                        className="btn btn-primary create-user-btn"
                        onClick={() => openModal('createUser')}
                    >
                        <span className="btn-icon">👤</span>
                        Create New User
                    </button>
                </div>
                
                {/* Statistics Cards */}
                {stats && (
                    <div className="stats-cards">
                        <div className="stat-card">
                            <div className="stat-number">{stats.total_users}</div>
                            <div className="stat-label">Total Users</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-number">{stats.active_users}</div>
                            <div className="stat-label">Active</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-number">{stats.by_role?.analyst || 0}</div>
                            <div className="stat-label">Analysts</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-number">{stats.by_role?.operator || 0}</div>
                            <div className="stat-label">Operators</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="alert alert-error">
                    <span>{error}</span>
                    <button onClick={clearMessages} className="alert-close">×</button>
                </div>
            )}
            
            {success && (
                <div className="alert alert-success">
                    <span>{success}</span>
                    <button onClick={clearMessages} className="alert-close">×</button>
                </div>
            )}

            {/* Filters */}
            <div className="user-filters">
                <div className="filter-group">
                    <label>Role:</label>
                    <select 
                        value={filters.role} 
                        onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                    >
                        <option value="">All Roles</option>
                        {currentUser.role === 'super_super_admin' && (
                            <option value="super_user">Super Users</option>
                        )}
                        <option value="analyst">Analysts</option>
                        <option value="operator">Operators</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Status:</label>
                    <select 
                        value={filters.status} 
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="all">All</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Search:</label>
                    <input
                        type="search"
                        placeholder="Search by username..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    />
                </div>

                <button 
                    className="btn btn-secondary"
                    onClick={() => setFilters({ role: '', status: 'active', search: '' })}
                >
                    Clear Filters
                </button>
            </div>

            {/* User Table */}
            {loading ? (
                <div className="loading">Loading users...</div>
            ) : (
                <div className="user-table-container">
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="no-data">
                                        No users found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                users.map(user => {
                                    const formattedUser = formatUserData(user);
                                    const canManage = canManageUser(user);
                                    
                                    return (
                                        <tr key={user.id} className={`user-row ${!user.is_active ? 'inactive' : ''}`}>
                                            <td>
                                                <div className="user-info">
                                                    <div className="username">{user.username}</div>
                                                    {user.must_change_password && (
                                                        <div className="password-warning">
                                                            Must change password
                                                        </div>
                                                    )}
                                                    {user.assigned_devices_count > 0 && (
                                                        <div className="device-count">
                                                            {user.assigned_devices_count} device(s) assigned
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="role-badge" style={{ backgroundColor: formattedUser.roleColor }}>
                                                    {formattedUser.roleIcon} {formattedUser.roleLabel}
                                                </div>
                                            </td>
                                            <td>
                                                <span 
                                                    className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}
                                                    style={{ color: formattedUser.statusColor }}
                                                >
                                                    {formattedUser.statusText}
                                                </span>
                                            </td>
                                            <td className="last-login">
                                                {formattedUser.lastLoginFormatted}
                                            </td>
                                            <td className="created-date">
                                                {formattedUser.createdAtFormatted}
                                            </td>
                                            <td>
                                                <div className="action-buttons">
                                                    {canManage && (
                                                        <>
                                                            <button
                                                                className="btn btn-sm btn-secondary"
                                                                onClick={() => openModal('resetPassword', user)}
                                                                title="Reset Password"
                                                            >
                                                                🔑
                                                            </button>
                                                            
                                                            {user.role === 'analyst' && (
                                                                <button
                                                                    className="btn btn-sm btn-info"
                                                                    onClick={() => openModal('assignDevices', user)}
                                                                    title="Assign Devices"
                                                                >
                                                                    📱
                                                                </button>
                                                            )}
                                                            
                                                            {user.is_active ? (
                                                                <button
                                                                    className="btn btn-sm btn-warning"
                                                                    onClick={() => handleDeactivateUser(user.id, user.username)}
                                                                    title="Deactivate User"
                                                                >
                                                                    🚫
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="btn btn-sm btn-success"
                                                                    onClick={() => handleReactivateUser(user.id, user.username)}
                                                                    title="Reactivate User"
                                                                >
                                                                    ✅
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
