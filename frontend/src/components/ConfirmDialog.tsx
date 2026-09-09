import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  operationName: string;
  description: string;
  expectedEffect?: string;
  details?: Array<{ label: string; value: string }>;
  confirmButtonText: string;
  confirmButtonVariant?: 'danger' | 'primary' | 'success';
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  operationName,
  description,
  expectedEffect,
  details,
  confirmButtonText,
  confirmButtonVariant = 'danger',
  isPending = false,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Focus the confirmation button upon opening
      setTimeout(() => {
        confirmBtnRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isPending) {
          onCancel();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isPending, onCancel]);

  if (!isOpen) return null;

  const getConfirmBtnClass = () => {
    switch (confirmButtonVariant) {
      case 'danger':
        return 'btn btn-danger';
      case 'success':
        return 'btn btn-primary'; // Styled via custom green override if needed
      default:
        return 'btn btn-primary';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onCancel();
        }
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '540px',
          width: '100%',
          padding: '28px',
          borderColor: confirmButtonVariant === 'danger' ? 'var(--danger-color)' : 'var(--border-color)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                padding: '8px',
                borderRadius: '8px',
                background: confirmButtonVariant === 'danger' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: confirmButtonVariant === 'danger' ? 'var(--danger-color)' : 'var(--accent-color)',
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <h2 id="confirm-dialog-title" style={{ margin: 0, fontSize: '1.35rem' }}>
              {title}
            </h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isPending}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
            }}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <p style={{ color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '12px' }}>
            {description}
          </p>

          {expectedEffect && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                borderLeft: `3px solid ${confirmButtonVariant === 'danger' ? 'var(--danger-color)' : 'var(--accent-color)'}`,
                padding: '12px 16px',
                borderRadius: '0 8px 8px 0',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
                Expected Effect
              </span>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {expectedEffect}
              </p>
            </div>
          )}

          {details && details.length > 0 && (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.25)',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px 16px',
              }}
            >
              {details.map((item, idx) => (
                <div key={idx}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{item.label}</span>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontFamily: 'monospace' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={isPending}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'var(--text-main)',
            }}
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            className={getConfirmBtnClass()}
            onClick={onConfirm}
            disabled={isPending}
            style={{ minWidth: '130px' }}
          >
            {isPending ? `${operationName}...` : confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};
