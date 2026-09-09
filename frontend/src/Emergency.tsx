import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFleetStatus, emergencyStopFleet, resumeFleet } from './api/fleet';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast, type ToastMessage } from './components/Toast';
import { AlertOctagon, Play, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';

const Emergency: React.FC = () => {
  const [fleetState, setFleetState] = useState<'ACTIVE' | 'HALTED' | 'UNKNOWN'>('UNKNOWN');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Confirmation dialog state
  const [pendingAction, setPendingAction] = useState<'HALT' | 'RESUME' | null>(null);

  const isMountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getFleetStatus();
      if (!isMountedRef.current) return;
      setFleetState(res.fleet_state);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to retrieve authoritative fleet status';
      setToast({ id: String(Date.now()), type: 'error', message: 'Status Sync Failed', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStatus();

    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const handleExecuteEmergencyAction = async () => {
    if (!pendingAction || actionInProgress) return;

    setActionInProgress(true);
    const actionType = pendingAction;

    try {
      if (actionType === 'HALT') {
        const res = await emergencyStopFleet();
        setFleetState(res.fleet_state);
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: 'Fleet Emergency Stop Engaged',
          detail: 'All financial authorizations are now strictly blocked across the fleet.',
        });
      } else {
        const res = await resumeFleet();
        setFleetState(res.fleet_state);
        setToast({
          id: String(Date.now()),
          type: 'success',
          message: 'Fleet Operations Resumed',
          detail: 'Autonomous agent authorizations will now be evaluated against policies.',
        });
      }

      setPendingAction(null);
      await fetchStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Emergency control failed';
      setToast({
        id: String(Date.now()),
        type: 'error',
        message: `Failed to ${actionType === 'HALT' ? 'halt' : 'resume'} fleet`,
        detail: message,
      });
      setPendingAction(null);
      await fetchStatus();
    } finally {
      if (isMountedRef.current) {
        setActionInProgress(false);
      }
    }
  };

  const isHalted = fleetState === 'HALTED';

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Confirmation Dialog */}
      {pendingAction && (
        <ConfirmDialog
          isOpen={!!pendingAction}
          title={pendingAction === 'HALT' ? 'Confirm Fleet Emergency Stop' : 'Confirm Resume Fleet Operations'}
          operationName={pendingAction === 'HALT' ? 'Halting fleet' : 'Resuming fleet'}
          description={
            pendingAction === 'HALT'
              ? 'Are you sure you want to trigger a global emergency stop across the entire agent fleet?'
              : 'Are you sure you want to resume financial authorization evaluations for the fleet?'
          }
          expectedEffect={
            pendingAction === 'HALT'
              ? 'This will prevent new financial authorizations across the fleet. All autonomous agents will immediately receive DENIED decisions on financial calls.'
              : 'This will allow authorization requests to be evaluated again according to standard governance policies.'
          }
          confirmButtonText={pendingAction === 'HALT' ? 'Halt Fleet' : 'Resume Fleet'}
          confirmButtonVariant={pendingAction === 'HALT' ? 'danger' : 'primary'}
          isPending={actionInProgress}
          details={[
            { label: 'Current Fleet State', value: fleetState },
            { label: 'Target State', value: pendingAction === 'HALT' ? 'HALTED' : 'ACTIVE' },
          ]}
          onConfirm={handleExecuteEmergencyAction}
          onCancel={() => !actionInProgress && setPendingAction(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Emergency Controls</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Authoritative fleet killswitch and execution resumption controls.</p>
        </div>

        <button
          className="btn"
          onClick={fetchStatus}
          disabled={loading || actionInProgress}
          style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}
          aria-label="Refresh fleet status"
        >
          <RefreshCw size={14} className={loading ? 'spin-animation' : ''} />
          Refresh Status
        </button>
      </div>

      {/* Primary Status Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderColor: isHalted ? 'var(--danger-color)' : 'var(--success-color)',
          background: isHalted
            ? 'radial-gradient(ellipse at center, rgba(239, 68, 68, 0.15) 0%, rgba(25, 28, 41, 0.7) 100%)'
            : 'radial-gradient(ellipse at center, rgba(16, 185, 129, 0.15) 0%, rgba(25, 28, 41, 0.7) 100%)',
          textAlign: 'center',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '20px',
            borderRadius: '50%',
            background: isHalted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            color: isHalted ? 'var(--danger-color)' : 'var(--success-color)',
            marginBottom: '16px',
          }}
        >
          {isHalted ? <AlertOctagon size={56} /> : <ShieldCheck size={56} />}
        </div>

        <span style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', letterSpacing: '0.1em' }}>
          Authoritative Backend State
        </span>

        <h2
          style={{
            fontSize: '3rem',
            margin: '0 0 16px 0',
            color: isHalted ? 'var(--danger-color)' : 'var(--success-color)',
            fontWeight: 800,
          }}
        >
          {loading ? 'SYNCING...' : fleetState}
        </h2>

        <p style={{ maxWidth: '580px', margin: '0 auto 32px auto', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: '1.6' }}>
          {isHalted
            ? 'The fleet is currently HALTED. All autonomous agents are blocked from creating payments, transfers, or executing financial transactions.'
            : 'The fleet is currently ACTIVE. Autonomous agents can evaluate financial requests against OPA governance rules and budget caps.'}
        </p>

        {/* Consequential Action Button */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {isHalted ? (
            <button
              className="btn btn-primary"
              onClick={() => setPendingAction('RESUME')}
              disabled={actionInProgress || loading}
              style={{
                padding: '14px 36px',
                fontSize: '1.1rem',
                minWidth: '220px',
              }}
              aria-label="Resume Fleet Operations"
            >
              <Play size={20} />
              {actionInProgress ? 'Resuming...' : 'Resume Fleet'}
            </button>
          ) : (
            <button
              className="btn btn-danger"
              onClick={() => setPendingAction('HALT')}
              disabled={actionInProgress || loading}
              style={{
                padding: '14px 36px',
                fontSize: '1.1rem',
                minWidth: '220px',
              }}
              aria-label="Halt Fleet Immediately"
            >
              <AlertOctagon size={20} />
              {actionInProgress ? 'Halting...' : 'Halt Fleet'}
            </button>
          )}
        </div>
      </div>

      {/* Technical Impact Safeguards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', color: 'var(--accent-color)' }}>
            <ShieldAlert size={20} />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Fail-Closed Enforcement</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Fleet halt state is written atomically to Redis and persisted in the audit ledger. In-flight and subsequent evaluations immediately fail closed.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', color: 'var(--success-color)' }}>
            <ShieldCheck size={20} />
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Operator Attribution</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Every halt and resume event logs the authenticated operator subject, cryptographic timestamp, and hash into the immutable audit sequence.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Emergency;
