import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DeviceSearch from './DeviceSearch';
import MapComponent from './MapComponent';

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
    <div className="px-5 py-5 max-w-[1200px] mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-semibold text-content font-display mb-2">Device Location Dashboard</h2>
        <p className="text-content-secondary">Search for devices to view their current locations and status</p>
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
