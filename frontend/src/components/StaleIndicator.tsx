import React from 'react';
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatRelativeTime } from '../utils/formatters';

export type HealthStatus = 'LIVE' | 'STALE' | 'OFFLINE' | 'DEGRADED';

export interface StaleIndicatorProps {
  status: HealthStatus;
  lastSuccessfulUpdate: Date | number | null;
  error?: string | null;
  isRefreshing?: boolean;
  onManualRefresh?: () => void;
}

export const StaleIndicator: React.FC<StaleIndicatorProps> = ({
  status,
  lastSuccessfulUpdate,
  error,
  isRefreshing = false,
  onManualRefresh,
}) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'LIVE':
        return {
          bg: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: 'var(--success-color)',
          icon: <Wifi size={14} />,
          label: 'LIVE',
        };
      case 'STALE':
        return {
          bg: 'rgba(245, 158, 11, 0.15)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          color: 'var(--warning-color)',
          icon: <AlertTriangle size={14} />,
          label: 'STALE',
        };
      case 'OFFLINE':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--danger-color)',
          icon: <WifiOff size={14} />,
          label: 'OFFLINE',
        };
      case 'DEGRADED':
        return {
          bg: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: 'var(--danger-color)',
          icon: <AlertTriangle size={14} />,
          label: 'DEGRADED',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 12px',
        borderRadius: '8px',
        background: config.bg,
        border: config.border,
        color: config.color,
        fontSize: '0.85rem',
      }}
      role="status"
      aria-live="polite"
      aria-label={`System status: ${config.label}`}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
        {config.icon}
        {config.label}
      </span>

      <span style={{ color: 'var(--text-muted)' }}>—</span>

      <span style={{ color: 'var(--text-main)' }}>
        {status === 'LIVE' ? (
          `Updated ${lastSuccessfulUpdate ? formatRelativeTime(lastSuccessfulUpdate) : 'just now'}`
        ) : (
          <>
            {error || 'Unable to reach API'}
            {lastSuccessfulUpdate && (
              <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>
                (Last sync: {formatRelativeTime(lastSuccessfulUpdate)})
              </span>
            )}
          </>
        )}
      </span>

      {onManualRefresh && (
        <button
          onClick={onManualRefresh}
          disabled={isRefreshing}
          style={{
            background: 'transparent',
            border: 'none',
            color: config.color,
            cursor: isRefreshing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            marginLeft: '4px',
            padding: '2px',
          }}
          title="Refresh telemetry"
          aria-label="Refresh telemetry"
        >
          <RefreshCw size={12} className={isRefreshing ? 'spin-animation' : ''} />
        </button>
      )}
    </div>
  );
};
