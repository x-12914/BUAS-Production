/**
 * User Management Service
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 * 
 * Handles all user management API calls and state management
 */

import authService from './authService';

class UserService {
    constructor() {
        // Use environment variable for API URL, fallback to relative path for development
        this.apiBaseURL = process.env.REACT_APP_API_URL || '';
        this.baseURL = `${this.apiBaseURL}/api/users`;
    }

    /**
     * Get list of users with optional filters
     */
    async getUsers(filters = {}) {
        try {
            const queryParams = new URLSearchParams();
            
            if (filters.role) queryParams.append('role', filters.role);
            if (filters.status) queryParams.append('status', filters.status);
            if (filters.search) queryParams.append('search', filters.search);
            
            const url = `${this.baseURL}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
            
            const response = await authService.authenticatedFetch(url);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    users: data.users,
                    total: data.total,
                    currentUserRole: data.current_user_role
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch users'
                };
            }
        } catch (error) {
            console.error('Get users error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get user by ID
     */
    async getUser(userId) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    user: data.user
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch user'
                };
            }
        } catch (error) {
            console.error('Get user error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Create new user
     */
    async createUser(userData) {
        try {
            const response = await authService.authenticatedFetch(this.baseURL, {
                method: 'POST',
                body: JSON.stringify(userData)
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    user: {
                        id: data.user_id,
                        username: data.username,
                        role: data.role
                    },
                    temporaryPassword: data.temporary_password,
                    message: data.message
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to create user'
                };
            }
        } catch (error) {
            console.error('Create user error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Reset user password (admin function)
     */
    async resetUserPassword(userId) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}/reset-password`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    temporaryPassword: data.temporary_password,
                    message: data.message
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to reset password'
                };
            }
        } catch (error) {
            console.error('Reset password error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Deactivate user account
     */
    async deactivateUser(userId) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}/deactivate`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    message: data.message
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to deactivate user'
                };
            }
        } catch (error) {
            console.error('Deactivate user error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Reactivate user account
     */
    async reactivateUser(userId) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}/reactivate`, {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    message: data.message
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to reactivate user'
                };
            }
        } catch (error) {
            console.error('Reactivate user error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Assign devices to analyst
     */
    async assignDevices(userId, deviceIds) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}/assign-devices`, {
                method: 'POST',
                body: JSON.stringify({ device_ids: deviceIds })
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    assignedDevices: data.assigned_devices,
                    message: data.message
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to assign devices'
                };
            }
        } catch (error) {
            console.error('Assign devices error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get devices assigned to user
     */
    async getUserDevices(userId) {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/${userId}/devices`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    assignedDevices: data.assigned_devices,
                    totalDevices: data.total_devices
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch user devices'
                };
            }
        } catch (error) {
            console.error('Get user devices error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get available devices for assignment
     */
    async getAvailableDevices() {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/available-devices`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    devices: data.devices,
                    total: data.total
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch available devices'
                };
            }
        } catch (error) {
            console.error('Get available devices error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get available roles for current user
     */
    async getAvailableRoles() {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/roles`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    roles: data.roles,
                    currentUserRole: data.current_user_role
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch available roles'
                };
            }
        } catch (error) {
            console.error('Get available roles error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Get user management statistics
     */
    async getUserStats() {
        try {
            const response = await authService.authenticatedFetch(`${this.baseURL}/stats`);
            
            if (response.ok) {
                const data = await response.json();
                return {
                    success: true,
                    stats: data.stats
                };
            } else {
                const errorData = await response.json();
                return {
                    success: false,
                    error: errorData.error || 'Failed to fetch user statistics'
                };
            }
        } catch (error) {
            console.error('Get user stats error:', error);
            return {
                success: false,
                error: 'Network error. Please check your connection.'
            };
        }
    }

    /**
     * Validate username format
     */
    validateUsername(username) {
        if (!username) {
            return { valid: false, message: 'Username is required' };
        }

        if (username.length < 3) {
            return { valid: false, message: 'Username must be at least 3 characters' };
        }

        if (username.length > 50) {
            return { valid: false, message: 'Username cannot exceed 50 characters' };
        }

        // Allow letters, numbers, underscore, hyphen, period
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
            return { valid: false, message: 'Username can only contain letters, numbers, period, underscore, and hyphen' };
        }

        // Must start with letter or number
        if (!/^[a-zA-Z0-9]/.test(username)) {
            return { valid: false, message: 'Username must start with a letter or number' };
        }

        // Cannot end with special characters
        if (/[._-]$/.test(username)) {
            return { valid: false, message: 'Username cannot end with special characters' };
        }

        // Reserved usernames
        const reserved = [
            'admin', 'administrator', 'root', 'system', 'api', 'www',
            'mail', 'email', 'support', 'help', 'info', 'contact',
            'user', 'guest', 'test', 'demo', 'null', 'undefined'
        ];

        if (reserved.includes(username.toLowerCase())) {
            return { valid: false, message: `Username '${username}' is reserved` };
        }

        return { valid: true, message: 'Username is valid' };
    }

    /**
     * Get role display information
     */
    getRoleInfo() {
        return {
            'super_super_admin': {
                label: 'Super Super Admin',
                description: 'Highest privilege level with potential future multi-agency access',
                color: '#d32f2f',
                icon: '👑'
            },
            'super_user': {
                label: 'Super User',
                description: 'Agency administrator with full control',
                color: '#1976d2',
                icon: '🛡️'
            },
            'analyst': {
                label: 'Analyst',
                description: 'Data analysis and monitoring of assigned devices',
                color: '#388e3c',
                icon: '📊'
            },
            'operator': {
                label: 'Operator',
                description: 'Recording control without data access',
                color: '#f57c00',
                icon: '🎛️'
            }
        };
    }

    /**
     * Format user data for display
     */
    formatUserForDisplay(user) {
        const roleInfo = this.getRoleInfo()[user.role] || {};
        
        return {
            ...user,
            roleLabel: roleInfo.label || user.role,
            roleDescription: roleInfo.description || '',
            roleColor: roleInfo.color || '#666',
            roleIcon: roleInfo.icon || '👤',
            lastLoginFormatted: user.last_login 
                ? new Date(user.last_login).toLocaleString()
                : 'Never',
            createdAtFormatted: user.created_at
                ? new Date(user.created_at).toLocaleString()
                : 'Unknown',
            statusText: user.is_active ? 'Active' : 'Inactive',
            statusColor: user.is_active ? '#4caf50' : '#f44336'
        };
    }
}

// Create singleton instance
const userService = new UserService();

export default userService;
