/**
 * Device Assignment Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 *
 * Modal for assigning devices to analysts
 */

import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import userService from '../services/userService';

const DeviceAssignmentModal = ({ isOpen, onClose, onSubmit, user }) => {
    const [availableDevices, setAvailableDevices] = useState([]);
    const [currentAssignments, setCurrentAssignments] = useState([]);
    const [selectedDevices, setSelectedDevices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dataLoading, setDataLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && user) {
            loadData();
        }
    }, [isOpen, user]);

    const loadData = async () => {
        setDataLoading(true);
        setError('');

        try {
            // Load available devices and current assignments
            const [devicesResult, assignmentsResult] = await Promise.all([
                userService.getAvailableDevices(),
                userService.getUserDevices(user.id)
            ]);

            if (devicesResult.success) {
                setAvailableDevices(devicesResult.devices);
            } else {
                setError(`Failed to load devices: ${devicesResult.error}`);
            }

            if (assignmentsResult.success) {
                const assignedIds = assignmentsResult.assignedDevices.map(d => d.device_id);
                setCurrentAssignments(assignedIds);
                setSelectedDevices(assignedIds);
            } else {
                setError(`Failed to load current assignments: ${assignmentsResult.error}`);
            }
        } catch (err) {
            setError('Failed to load device data. Please try again.');
        } finally {
            setDataLoading(false);
        }
    };

    const handleDeviceToggle = (deviceId) => {
        setSelectedDevices(prev => {
            if (prev.includes(deviceId)) {
                return prev.filter(id => id !== deviceId);
            } else {
                return [...prev, deviceId];
            }
        });
    };

    const handleSelectAll = () => {
        const filteredDevices = getFilteredDevices();
        const allSelected = filteredDevices.every(device =>
            selectedDevices.includes(device.device_id)
        );

        if (allSelected) {
            // Deselect all filtered devices
            const filteredIds = filteredDevices.map(d => d.device_id);
            setSelectedDevices(prev => prev.filter(id => !filteredIds.includes(id)));
        } else {
            // Select all filtered devices
            const filteredIds = filteredDevices.map(d => d.device_id);
            setSelectedDevices(prev => {
                const newSelected = [...prev];
                filteredIds.forEach(id => {
                    if (!newSelected.includes(id)) {
                        newSelected.push(id);
                    }
                });
                return newSelected;
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            await onSubmit(selectedDevices);
        } catch (err) {
            setError('Failed to assign devices. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading || dataLoading) return;
        onClose();
    };

    const getFilteredDevices = () => {
        if (!searchTerm) return availableDevices;

        return availableDevices.filter(device =>
            device.device_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (device.android_id && device.android_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (device.display_name && device.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    };

    const hasChanges = () => {
        // If no devices are selected but there are current assignments, that's a change (removing all)
        if (selectedDevices.length === 0 && currentAssignments.length > 0) return true;

        // If different number of devices selected, that's a change
        if (selectedDevices.length !== currentAssignments.length) return true;

        // If same number but different devices, that's a change
        return !selectedDevices.every(id => currentAssignments.includes(id));
    };

    if (!isOpen) return null;

    const filteredDevices = getFilteredDevices();
    const allFilteredSelected = filteredDevices.length > 0 &&
        filteredDevices.every(device => selectedDevices.includes(device.device_id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleClose}>
            <div className="bg-surface-overlay border border-surface-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                    <h2 className="text-lg font-display font-semibold text-content">Assign Devices to {user?.username}</h2>
                    <button
                        className="p-1 rounded-lg hover:bg-surface-hover text-content-muted hover:text-content transition-colors"
                        onClick={handleClose}
                        disabled={loading || dataLoading}
                    >
                        <X size={20} />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-4 bg-danger/5 border border-danger/20 rounded-lg p-3">
                        <p className="text-xs text-danger">{error}</p>
                    </div>
                )}

                {/* Body */}
                <div className="px-6 py-4">
                    {dataLoading ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin"></div>
                            <span className="text-sm text-content-muted">Loading devices...</span>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Assignment Summary */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-surface-raised border border-surface-border rounded-lg p-3">
                                    <div className="text-xs text-content-muted">Currently Assigned</div>
                                    <div className="text-sm font-semibold text-content mt-0.5">{currentAssignments.length} devices</div>
                                </div>
                                <div className="bg-surface-raised border border-surface-border rounded-lg p-3">
                                    <div className="text-xs text-content-muted">Will be Assigned</div>
                                    <div className="text-sm font-semibold text-content mt-0.5">{selectedDevices.length} devices</div>
                                </div>
                            </div>
                            {hasChanges() && (
                                <div className="bg-accent/5 border border-accent/20 rounded-lg px-3 py-2">
                                    <span className="text-xs font-medium text-accent">
                                        Changes: {selectedDevices.length - currentAssignments.length > 0 ? '+' : ''}
                                        {selectedDevices.length - currentAssignments.length} devices
                                    </span>
                                </div>
                            )}

                            {/* Device Search and Controls */}
                            <div className="space-y-3">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-muted" />
                                    <input
                                        type="search"
                                        placeholder="Search devices by name, ID, or Android ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-surface-raised border border-surface-border rounded-lg text-sm text-content placeholder:text-content-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-hover transition-colors"
                                        onClick={handleSelectAll}
                                        disabled={filteredDevices.length === 0}
                                    >
                                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                                        {searchTerm && ` (${filteredDevices.length})`}
                                    </button>

                                    <button
                                        type="button"
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warning/10 hover:bg-warning/20 text-warning border border-warning/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={() => setSelectedDevices([])}
                                        disabled={selectedDevices.length === 0}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            {/* Device List */}
                            <div className="max-h-64 overflow-y-auto space-y-1 border border-surface-border rounded-lg p-2">
                                {filteredDevices.length === 0 ? (
                                    <div className="text-center py-6 text-sm text-content-muted">
                                        {searchTerm ?
                                            `No devices found matching "${searchTerm}"` :
                                            'No devices available'
                                        }
                                    </div>
                                ) : (
                                    filteredDevices.map(device => {
                                        const isSelected = selectedDevices.includes(device.device_id);
                                        const wasAssigned = currentAssignments.includes(device.device_id);
                                        const isChanged = isSelected !== wasAssigned;

                                        return (
                                            <div
                                                key={device.device_id}
                                                className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-accent/10 border border-accent/20' : 'hover:bg-surface-hover border border-transparent'} ${isChanged ? 'ring-1 ring-accent/30' : ''}`}
                                                onClick={() => handleDeviceToggle(device.device_id)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleDeviceToggle(device.device_id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded border-surface-border text-accent focus:ring-accent/20"
                                                />

                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-content truncate">{device.display_name || device.device_id}</div>
                                                    {device.display_name && device.display_name !== device.device_id && (
                                                        <div className="text-xs text-content-muted">ID: {device.device_id}</div>
                                                    )}
                                                    {device.android_id && (
                                                        <div className="text-xs text-content-muted">Android ID: {device.android_id}</div>
                                                    )}
                                                    {device.phone_numbers && device.phone_numbers.length > 0 && (
                                                        <div className="text-xs text-content-muted">
                                                            {device.phone_numbers.slice(0, 2).join(', ')}
                                                            {device.phone_numbers.length > 2 && ` (+${device.phone_numbers.length - 2} more)`}
                                                        </div>
                                                    )}
                                                    {device.assignment_count > 0 && (
                                                        <div className="text-xs text-content-muted">
                                                            Currently assigned to {device.assignment_count} user(s)
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="shrink-0">
                                                    {isChanged && (
                                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isSelected ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                                                            {isSelected ? '+ Added' : '- Removed'}
                                                        </span>
                                                    )}
                                                    {wasAssigned && !isChanged && (
                                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-hover text-content-muted">Current</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
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
                                    disabled={loading || !hasChanges()}
                                >
                                    {loading ? (
                                        <span className="flex items-center gap-2">
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                            {selectedDevices.length === 0 ? 'Removing...' : 'Assigning...'}
                                        </span>
                                    ) : (
                                        selectedDevices.length === 0 ?
                                            'Remove All Devices' :
                                            `Assign ${selectedDevices.length} Device${selectedDevices.length !== 1 ? 's' : ''}`
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeviceAssignmentModal;
