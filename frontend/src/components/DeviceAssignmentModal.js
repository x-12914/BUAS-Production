/**
 * Device Assignment Modal Component
 * BUAS RBAC Implementation - Segment 6: User Management Frontend
 * 
 * Modal for assigning devices to analysts
 */

import React, { useState, useEffect } from 'react';
import userService from '../services/userService';
import './DeviceAssignmentModal.css';

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
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content device-assignment-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Assign Devices to {user?.username}</h3>
                    <button 
                        className="modal-close-btn" 
                        onClick={handleClose}
                        disabled={loading || dataLoading}
                    >
                        ×
                    </button>
                </div>

                {error && (
                    <div className="error-message">
                        {error}
                    </div>
                )}

                <div className="modal-body">
                    {dataLoading ? (
                        <div className="loading">
                            <div className="spinner"></div>
                            Loading devices...
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {/* Assignment Summary */}
                            <div className="assignment-summary">
                                <div className="summary-item">
                                    <span className="summary-label">Currently Assigned:</span>
                                    <span className="summary-value">{currentAssignments.length} devices</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">Will be Assigned:</span>
                                    <span className="summary-value">{selectedDevices.length} devices</span>
                                </div>
                                {hasChanges() && (
                                    <div className="summary-item changes">
                                        <span className="summary-label">Changes:</span>
                                        <span className="summary-value">
                                            {selectedDevices.length - currentAssignments.length > 0 ? '+' : ''}
                                            {selectedDevices.length - currentAssignments.length} devices
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Device Search and Controls */}
                            <div className="device-controls">
                                <div className="search-group">
                                    <input
                                        type="search"
                                        placeholder="Search devices by name, ID, or Android ID..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="device-search"
                                    />
                                </div>
                                
                                <div className="control-buttons">
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-secondary"
                                        onClick={handleSelectAll}
                                        disabled={filteredDevices.length === 0}
                                    >
                                        {allFilteredSelected ? 'Deselect All' : 'Select All'}
                                        {searchTerm && ` (${filteredDevices.length})`}
                                    </button>
                                    
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-warning"
                                        onClick={() => setSelectedDevices([])}
                                        disabled={selectedDevices.length === 0}
                                    >
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            {/* Device List */}
                            <div className="device-list">
                                {filteredDevices.length === 0 ? (
                                    <div className="no-devices">
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
                                                className={`device-item ${isSelected ? 'selected' : ''} ${isChanged ? 'changed' : ''}`}
                                                onClick={() => handleDeviceToggle(device.device_id)}
                                            >
                                                <div className="device-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleDeviceToggle(device.device_id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                
                                                <div className="device-info">
                                                    <div className="device-id">{device.display_name || device.device_id}</div>
                                                    {device.display_name && device.display_name !== device.device_id && (
                                                        <div className="device-id-sub">ID: {device.device_id}</div>
                                                    )}
                                                    {device.android_id && (
                                                        <div className="android-id">Android ID: {device.android_id}</div>
                                                    )}
                                                    {device.phone_numbers && device.phone_numbers.length > 0 && (
                                                        <div className="phone-numbers">
                                                            {device.phone_numbers.slice(0, 2).join(', ')}
                                                            {device.phone_numbers.length > 2 && ` (+${device.phone_numbers.length - 2} more)`}
                                                        </div>
                                                    )}
                                                    {device.assignment_count > 0 && (
                                                        <div className="assignment-info">
                                                            Currently assigned to {device.assignment_count} user(s)
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                <div className="device-status">
                                                    {isChanged && (
                                                        <span className="change-indicator">
                                                            {isSelected ? '+ Added' : '- Removed'}
                                                        </span>
                                                    )}
                                                    {wasAssigned && !isChanged && (
                                                        <span className="current-assignment">Current</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Modal Actions */}
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
                                    disabled={loading || !hasChanges()}
                                >
                                    {loading ? (
                                        <>
                                            <span className="spinner"></span>
                                            {selectedDevices.length === 0 ? 'Removing...' : 'Assigning...'}
                                        </>
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
