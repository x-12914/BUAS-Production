import React, { useState } from 'react';
import './DeleteConfirmationModal.css';

const DeleteConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  recordDetails,
  recordType 
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (confirmText === 'DELETE') {
      setIsDeleting(true);
      try {
        await onConfirm();
        onClose();
      } catch (error) {
        console.error('Delete failed:', error);
        alert('Delete failed: ' + error.message);
      } finally {
        setIsDeleting(false);
        setConfirmText('');
      }
    }
  };

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  const isConfirmEnabled = confirmText === 'DELETE' && !isDeleting;

  if (!isOpen) return null;

  return (
    <div className="delete-modal-overlay">
      <div className="delete-modal">
        <div className="delete-modal-header">
          <h3>⚠️ DELETE RECORD PERMANENTLY?</h3>
        </div>
        
        <div className="delete-modal-content">
          <div className="record-details">
            {recordType === 'audio' && (
              <>
                <p><strong>Device:</strong> {recordDetails.device_id}</p>
                <p><strong>File:</strong> {recordDetails.filename}</p>
                <p><strong>Uploaded:</strong> {new Date(recordDetails.upload_time).toLocaleString()}</p>
                <p><strong>Size:</strong> {recordDetails.file_size ? `${(recordDetails.file_size / 1024 / 1024).toFixed(2)} MB` : 'Unknown'}</p>
              </>
            )}
            
            {recordType === 'location' && (
              <>
                <p><strong>Device:</strong> {recordDetails.device_id}</p>
                <p><strong>Location:</strong> {recordDetails.latitude}, {recordDetails.longitude}</p>
                <p><strong>Timestamp:</strong> {new Date(recordDetails.timestamp).toLocaleString()}</p>
              </>
            )}
            
            {recordType === 'recording_event' && (
              <>
                <p><strong>Device:</strong> {recordDetails.device_id}</p>
                <p><strong>Event:</strong> {recordDetails.event_type}</p>
                <p><strong>Timestamp:</strong> {new Date(recordDetails.timestamp).toLocaleString()}</p>
                {recordDetails.latitude && (
                  <p><strong>Location:</strong> {recordDetails.latitude}, {recordDetails.longitude}</p>
                )}
              </>
            )}
          </div>
          
          <div className="warning-message">
            <p>⚠️ This action cannot be undone.</p>
          </div>
          
          <div className="confirmation-input">
            <label htmlFor="confirmText">Type "DELETE" to confirm:</label>
            <input
              id="confirmText"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE here"
              disabled={isDeleting}
              autoFocus
            />
          </div>
        </div>
        
        <div className="delete-modal-actions">
          <button 
            onClick={handleClose} 
            disabled={isDeleting}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={`delete-button ${isConfirmEnabled ? 'enabled' : 'disabled'}`}
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
