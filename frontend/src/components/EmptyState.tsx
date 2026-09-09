import React, { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '12px',
        border: '1px dashed var(--border-color)',
      }}
      role="region"
      aria-label="Empty state"
    >
      <div
        style={{
          padding: '16px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.04)',
          color: 'var(--text-muted)',
          marginBottom: '16px',
        }}
      >
        {icon || <Inbox size={36} />}
      </div>
      <h3 style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginBottom: description ? '8px' : '0' }}>
        {title}
      </h3>
      {description && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '400px', marginBottom: action ? '20px' : '0' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </div>
  );
};
