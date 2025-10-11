// Route Protection Component for BUAS RBAC System
// Following BUAS_RBAC_IMPLEMENTATION_GUIDE.md - Segment 2

import React, { useEffect, useState } from 'react';
import authService from '../services/authService';
import Login from './Login';
import PasswordChange from './PasswordChange';

/**
 * Protected Route Component
 * Handles authentication and authorization for protected routes
 */
const ProtectedRoute = ({ 
    children, 
    requiredRole = null, 
    requiredPermission = null,
    fallbackComponent = null 
}) => {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
    const [hasAccess, setHasAccess] = useState(true); // Default to true to prevent flash
    
    useEffect(() => {
        const checkAuth = async () => {
            try {
                // Check if user is authenticated
                const isAuthenticated = await authService.checkAuth();
                
                if (!isAuthenticated) {
                    setIsAuthenticated(false);
                    setHasAccess(false);
                    setLoading(false);
                    return;
                }
                
                const currentUser = authService.getCurrentUser();
                setUser(currentUser);
                setIsAuthenticated(true);
                
                // Check if password change is required
                if (currentUser && currentUser.must_change_password) {
                    setNeedsPasswordChange(true);
                    setHasAccess(true); // Password change is still "access"
                    setLoading(false);
                    return;
                }
                
                // Default to having access
                let userHasAccess = true;
                
                // Check role-based access
                if (requiredRole) {
                    const hasRole = authService.hasPermission(requiredRole);
                    if (!hasRole) {
                        userHasAccess = false;
                    }
                }
                
                // Check permission-based access
                if (requiredPermission) {
                    const hasPermission = authService.hasPermission(requiredPermission);
                    if (!hasPermission) {
                        userHasAccess = false;
                    }
                }
                
                setHasAccess(userHasAccess);
                setLoading(false);
                
            } catch (error) {
                console.error('Auth check error:', error);
                setIsAuthenticated(false);
                setHasAccess(false);
                setLoading(false);
            }
        };
        
        checkAuth();
    }, [requiredRole, requiredPermission]);
    
    const handleLoginSuccess = () => {
        // Refresh the component by re-checking auth
        window.location.reload();
    };
    
    const handlePasswordChanged = () => {
        setNeedsPasswordChange(false);
        // Refresh user data
        window.location.reload();
    };
    
    // Show loading spinner
    if (loading) {
        return <LoadingSpinner />;
    }
    
    // Show login if not authenticated
    if (!isAuthenticated) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }
    
    // Show password change if required
    if (needsPasswordChange) {
        return <PasswordChange onPasswordChanged={handlePasswordChanged} />;
    }
    
    // Show access denied if user doesn't have required permissions
    if (!hasAccess) {
        return fallbackComponent || <AccessDenied user={user} requiredRole={requiredRole} requiredPermission={requiredPermission} />;
    }
    
    // Render protected content
    return children;
};

/**
 * Loading Spinner Component
 */
const LoadingSpinner = () => (
    <div className="auth-loading">
        <div className="loading-container">
            <div className="loading-spinner-large"></div>
            <p>Checking authentication...</p>
        </div>
        <style jsx>{`
            .auth-loading {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                font-family: 'Inter', sans-serif;
            }
            
            .loading-container {
                text-align: center;
                color: white;
            }
            
            .loading-spinner-large {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255, 255, 255, 0.3);
                border-top: 4px solid white;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 16px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .loading-container p {
                margin: 0;
                font-size: 16px;
                opacity: 0.9;
            }
        `}</style>
    </div>
);

/**
 * Access Denied Component
 */
const AccessDenied = ({ user, requiredRole, requiredPermission }) => {
    const handleLogout = async () => {
        await authService.logout();
        window.location.reload();
    };
    
    const getAccessMessage = () => {
        if (requiredRole) {
            return `This page requires ${requiredRole} role access.`;
        }
        if (requiredPermission) {
            return `This page requires ${requiredPermission} permission.`;
        }
        return 'You do not have permission to access this page.';
    };
    
    return (
        <div className="access-denied">
            <div className="access-denied-container">
                <div className="denied-icon">🚫</div>
                <h1>Access Denied</h1>
                <p className="denied-message">{getAccessMessage()}</p>
                <div className="user-info">
                    <p><strong>Current User:</strong> {user?.username}</p>
                    <p><strong>Current Role:</strong> {user?.role}</p>
                    <p><strong>Agency:</strong> {user?.agency_name}</p>
                </div>
                <div className="denied-actions">
                    <button onClick={() => window.history.back()} className="back-button">
                        Go Back
                    </button>
                    <button onClick={handleLogout} className="logout-button">
                        Logout
                    </button>
                </div>
            </div>
            <style jsx>{`
                .access-denied {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
                    font-family: 'Inter', sans-serif;
                }
                
                .access-denied-container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    text-align: center;
                    max-width: 500px;
                    margin: 20px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                
                .denied-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                
                .access-denied-container h1 {
                    color: #dc2626;
                    margin: 0 0 16px 0;
                    font-size: 32px;
                    font-weight: 700;
                }
                
                .denied-message {
                    color: #374151;
                    font-size: 16px;
                    margin-bottom: 24px;
                    line-height: 1.5;
                }
                
                .user-info {
                    background: #f9fafb;
                    padding: 20px;
                    border-radius: 12px;
                    margin-bottom: 24px;
                    text-align: left;
                }
                
                .user-info p {
                    margin: 0 0 8px 0;
                    color: #374151;
                    font-size: 14px;
                }
                
                .user-info p:last-child {
                    margin-bottom: 0;
                }
                
                .denied-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
                
                .back-button, .logout-button {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .back-button {
                    background: #6b7280;
                    color: white;
                }
                
                .back-button:hover {
                    background: #4b5563;
                }
                
                .logout-button {
                    background: #dc2626;
                    color: white;
                }
                
                .logout-button:hover {
                    background: #b91c1c;
                }
                
                @media (max-width: 768px) {
                    .access-denied-container {
                        padding: 24px;
                        margin: 16px;
                    }
                    
                    .access-denied-container h1 {
                        font-size: 24px;
                    }
                    
                    .denied-actions {
                        flex-direction: column;
                    }
                }
            `}</style>
        </div>
    );
};

/**
 * Role-based Route Protection Hook
 * Use this hook in components to check permissions dynamically
 */
export const useRoleCheck = (requiredRole) => {
    const [hasRole, setHasRole] = useState(false);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const checkRole = async () => {
            try {
                const result = authService.hasPermission(requiredRole);
                setHasRole(result);
            } catch (error) {
                console.error('Role check error:', error);
                setHasRole(false);
            } finally {
                setLoading(false);
            }
        };
        
        if (requiredRole) {
            checkRole();
        } else {
            setLoading(false);
        }
    }, [requiredRole]);
    
    return { hasRole, loading };
};

/**
 * Permission-based Route Protection Hook
 * Use this hook in components to check permissions dynamically
 */
export const usePermissionCheck = (requiredPermission) => {
    const [hasPermission, setHasPermission] = useState(false);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        const checkPermission = async () => {
            try {
                const result = authService.hasPermission(requiredPermission);
                setHasPermission(result);
            } catch (error) {
                console.error('Permission check error:', error);
                setHasPermission(false);
            } finally {
                setLoading(false);
            }
        };
        
        if (requiredPermission) {
            checkPermission();
        } else {
            setLoading(false);
        }
    }, [requiredPermission]);
    
    return { hasPermission, loading };
};

/**
 * Multi-Role Protection Component
 * Protects routes that require any of multiple roles
 */
export const MultiRoleProtectedRoute = ({ children, requiredRoles = [], fallbackComponent = null }) => {
    const [loading, setLoading] = useState(true);
    const [hasAccess, setHasAccess] = useState(false);
    
    useEffect(() => {
        const checkRoles = async () => {
            try {
                const roleChecks = requiredRoles.map(role => authService.hasPermission(role));
                
                // User needs at least one of the required roles
                const hasAnyRole = roleChecks.some(hasRole => hasRole);
                setHasAccess(hasAnyRole);
            } catch (error) {
                console.error('Multi-role check error:', error);
                setHasAccess(false);
            } finally {
                setLoading(false);
            }
        };
        
        if (requiredRoles.length > 0) {
            checkRoles();
        } else {
            setLoading(false);
        }
    }, [requiredRoles]);
    
    if (loading) {
        return <LoadingSpinner />;
    }
    
    if (!hasAccess) {
        return fallbackComponent || <AccessDenied requiredRole={requiredRoles.join(' or ')} />;
    }
    
    return children;
};

export default ProtectedRoute;
