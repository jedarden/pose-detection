/**
 * CameraSelector Component
 * Allows users to select which camera to use when multiple cameras are available
 */

import React, { useEffect, useState } from 'react';

interface CameraSelectorProps {
  onCameraSelect: (deviceId: string) => void;
  currentDeviceId?: string;
  className?: string;
}

interface CameraDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export const CameraSelector: React.FC<CameraSelectorProps> = ({
  onCameraSelect,
  currentDeviceId,
  className
}) => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCameras();

    // Listen for device changes (camera plugged in/out)
    navigator.mediaDevices.addEventListener('devicechange', loadCameras);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadCameras);
    };
  }, []);

  const loadCameras = async () => {
    try {
      // First request permission to access cameras
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Get all available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      // Filter for video input devices (cameras)
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
          groupId: device.groupId
        }));

      setCameras(videoDevices);
      setLoading(false);
      
      // If only one camera and no current selection, auto-select it
      if (videoDevices.length === 1 && !currentDeviceId) {
        onCameraSelect(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Error loading cameras:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cameras');
      setLoading(false);
    }
  };

  const handleCameraChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    if (deviceId) {
      onCameraSelect(deviceId);
    }
  };

  if (loading) {
    return <div className={className}>Loading cameras...</div>;
  }

  if (error) {
    return (
      <div className={`camera-selector-error ${className}`}>
        <span style={{ color: '#e74c3c' }}>Camera Error: {error}</span>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className={`camera-selector-error ${className}`}>
        <span style={{ color: '#e74c3c' }}>No cameras found</span>
      </div>
    );
  }

  // Don't show selector if only one camera is available
  if (cameras.length === 1) {
    return null;
  }

  return (
    <div className={`camera-selector ${className}`} data-testid="camera-selector" style={{ marginBottom: '10px' }}>
      <label htmlFor="camera-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>
        Select Camera:
      </label>
      <select
        id="camera-select"
        data-testid="camera-select"
        data-testid="available-cameras-list"
        value={currentDeviceId || ''}
        onChange={handleCameraChange}
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          border: '1px solid #ccc',
          backgroundColor: 'white',
          cursor: 'pointer',
          fontSize: '14px'
        }}
      >
        <option value="">-- Select Camera --</option>
        {cameras.map((camera, index) => (
          <option key={camera.deviceId} value={camera.deviceId}>
            {camera.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
      
      <span style={{ 
        marginLeft: '10px', 
        fontSize: '12px', 
        color: '#666' 
      }}>
        ({cameras.length} cameras detected)
      </span>
    </div>
  );
};