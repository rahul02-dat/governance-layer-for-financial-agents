import React from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
}

export interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  if (!toast) return null;

  const getStyle = () => {
    switch (toast.type) {
      case 'success':
        return {
          bg: 'rgba(16, 185, 129, 0.95)',
          color: '#ffffff',
          icon: <CheckCircle size={20} />,
        };
      case 'error':
        return {
          bg: 'rgba(239, 68, 68, 0.95)',
          color: '#ffffff',
          icon: <AlertCircle size={20} />,
        };
      default:
        return {
          bg: 'rgba(59, 130, 246, 0.95)',
          color: '#ffffff',
          icon: <Info size={20} />,
        };
    }
  };

  const style = getStyle();

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 10000,
        backgroundColor: style.bg,
        color: style.color,
        padding: '14px 20px',
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        maxWidth: '440px',
        animation: 'slideIn 0.2s ease-out',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: '2px' }}>{style.icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{toast.message}</div>
        {toast.detail && (
          <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '4px' }}>
            {toast.detail}
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: style.color,
          cursor: 'pointer',
          padding: '2px',
          marginLeft: '8px',
          opacity: 0.8,
        }}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};
