import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeviceSearch from './DeviceSearch';
import MapComponent from './MapComponent';
import './DashboardMap.css';

const DashboardMap = () => {
  const [searchedDevices, setSearchedDevices] = useState([]);
  const navigate = useNavigate();

  const handleDevicesSelected = (deviceIds) => {
    setSearchedDevices(deviceIds);
  };

  const handleDeviceClick = (device) => {
    // Navigate to device detail page when clicking on a marker
    navigate(`/device/${device.deviceId}`);
  };

  return (
    <div className="dashboard-map">
      <div className="dashboard-map-header">
        <h2>Device Location Dashboard</h2>
        <p>Search for devices to view their current locations and status</p>
      </div>

      <DeviceSearch 
        onDevicesSelected={handleDevicesSelected}
      />

      <MapComponent 
        searchedDevices={searchedDevices}
        onDeviceClick={handleDeviceClick}
      />
    </div>
  );
};

export default DashboardMap;
