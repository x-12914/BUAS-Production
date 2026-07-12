import React, { useEffect, useState } from 'react';
import authService from '../services/authService';
import Login from './Login';
import PasswordChange from './PasswordChange';
import { ShieldX, ArrowLeft, LogOut } from 'lucide-react';

const ProtectedRoute = ({
    children,
    requiredPermission = null,
    fallbackComponent = null
}) => {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
    const [hasAccess, setHasAccess] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
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

                if (currentUser && currentUser.must_change_password) {
                    setNeedsPasswordChange(true);
                    setHasAccess(true);
                    setLoading(false);
                    return;
                }

                let userHasAccess = true;

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
    }, [requiredPermission]);

    const handleLoginSuccess = () => {
        window.location.reload();
    };

    const handlePasswordChanged = () => {
        setNeedsPasswordChange(false);
        window.location.reload();
    };

    if (loading) {
        return <LoadingSpinner />;
    }

    if (!isAuthenticated) {
        return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    if (needsPasswordChange) {
        return <PasswordChange onPasswordChanged={handlePasswordChanged} />;
    }

    if (!hasAccess) {
        return fallbackComponent || <AccessDenied user={user} requiredPermission={requiredPermission} />;
    }

    return children;
};

const LoadingSpinner = () => (
    <div className="fixed inset-0 flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-10 h-10 border-2 border-surface-border border-t-accent rounded-full"></div>
            <p className="text-sm text-content-secondary">Checking authentication...</p>
        </div>
    </div>
);

const AccessDenied = ({ user, requiredPermission }) => {
    const handleLogout = async () => {
        await authService.logout();
        window.location.reload();
    };

    const getAccessMessage = () => {
        if (requiredPermission) {
            return `This page requires ${requiredPermission} permission.`;
        }
        return 'You do not have permission to access this page.';
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-surface p-4">
            <div className="bg-surface-raised border border-surface-border rounded-xl p-8 text-center max-w-md w-full shadow-2xl">
                <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-danger/10">
                    <ShieldX size={32} className="text-danger" />
                </div>
                <h1 className="text-2xl font-display font-bold text-danger mb-2">Access Denied</h1>
                <p className="text-sm text-content-secondary mb-6">{getAccessMessage()}</p>
                <div className="bg-surface border border-surface-border rounded-lg p-4 mb-6 text-left space-y-2">
                    <p className="text-sm text-content-secondary"><span className="font-medium text-content">User:</span> {user?.username}</p>
                    <p className="text-sm text-content-secondary"><span className="font-medium text-content">Role:</span> {user?.role}</p>
                    <p className="text-sm text-content-secondary"><span className="font-medium text-content">Agency:</span> {user?.agency_name}</p>
                </div>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => window.history.back()}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                    >
                        <ArrowLeft size={16} /> Go Back
                    </button>
                    <button
                        onClick={handleLogout}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-danger hover:bg-danger/80 text-white transition-colors"
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProtectedRoute;
