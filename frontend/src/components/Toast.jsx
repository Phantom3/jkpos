import React, { useEffect } from 'react';
import { CheckCircleIcon, AlertCircleIcon, XIcon } from '../icons';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`toast-notification ${type}`}>
      <div className="toast-icon">
        {type === 'success' ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
      </div>
      <div className="toast-text">{message}</div>
      <button className="toast-close" onClick={onClose}>
        <XIcon size={14} />
      </button>
    </div>
  );
}
