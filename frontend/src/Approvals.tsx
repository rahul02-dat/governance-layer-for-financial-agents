import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getApprovals, approveRequest, denyRequest } from './api/approvals';
import type { ApprovalRequest } from './types/api';
import { formatMoney, formatDateTime, formatRelativeTime } from './utils/formatters';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast, type ToastMessage } from './components/Toast';
import { EmptyState } from './components/EmptyState';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';

interface PendingActionState {
  id: string;
  action: 'approve' | 'deny';
  request: ApprovalRequest;
}

const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Per-item loading state to prevent double-click submissions
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<PendingActionState | null>(null);

  const isMountedRef = useRef(true);

  const fetchApprovalList = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const data = await getApprovals(statusFilter === 'ALL' ? undefined : statusFilter, 0, 50);
      if (!isMountedRef.current) return;
      setApprovals(data);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch approvals';
      setToast({ id: String(Date.now()), type: 'error', message: 'Failed to fetch approvals', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [statusFilter]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchApprovalList();

    const interval = setInterval(() => {
      fetchApprovalList();
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchApprovalList]);

  const handleOpenConfirm = (request: ApprovalRequest, action: 'approve' | 'deny') => {
    setConfirmAction({
      id: request.id,
      action,
      request,
    });
  };

  const handleExecuteAction = async () => {
    if (!confirmAction || actionInProgressId) return;

    const { id, action, request } = confirmAction;
    setActionInProgressId(id);

    try {
      if (action === 'approve') {
        const res = await approveRequest(id);
        setToast({
          id: String(Date.now()),
          type: 'success',
          message: `Request for ${formatMoney(request.amount, request.currency)} approved`,
          detail: res.authorization_id ? `Authorization ID: ${res.authorization_id}` : undefined,
        });
      } else {
        await denyRequest(id);
        setToast({
          id: String(Date.now()),
          type: 'info',
          message: `Request for ${formatMoney(request.amount, request.currency)} denied`,
        });
      }

      setConfirmAction(null);
      await fetchApprovalList();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Approval operation failed';

      // Section 27: Handle race conditions gracefully
      if (errMessage.toLowerCase().includes('already') || errMessage.includes('status')) {
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: 'This approval request has already been processed.',
          detail: 'Refreshing approval list with authoritative state.',
        });
      } else if (errMessage.toLowerCase().includes('expired')) {
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: 'Approval request has expired.',
          detail: 'Authorizations expire after 15 minutes of inactivity.',
        });
      } else {
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: `Failed to ${action} request`,
          detail: errMessage,
        });
      }

      setConfirmAction(null);
      await fetchApprovalList();
    } finally {
      if (isMountedRef.current) {
        setActionInProgressId(null);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge badge-halted">Pending Approval</span>;
      case 'APPROVED':
        return <span className="badge badge-active">Approved</span>;
      case 'DENIED':
        return <span className="badge badge-revoked">Denied</span>;
      case 'EXPIRED':
        return <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>Expired</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction.action === 'approve' ? 'Authorize Financial Execution' : 'Deny Authorization Request'}
          operationName={confirmAction.action === 'approve' ? 'Approving' : 'Denying'}
          description={`Are you sure you want to ${confirmAction.action} this financial request from ${confirmAction.request.agent_name || confirmAction.request.agent_id}?`}
          expectedEffect={
            confirmAction.action === 'approve'
              ? 'This will immediately issue an execution authorization and permit the financial transaction to proceed.'
              : 'This will deny authorization and record a human operator denial in the cryptographic audit log.'
          }
          confirmButtonText={confirmAction.action === 'approve' ? 'Approve Request' : 'Deny Request'}
          confirmButtonVariant={confirmAction.action === 'approve' ? 'primary' : 'danger'}
          isPending={actionInProgressId === confirmAction.id}
          details={[
            { label: 'Amount', value: formatMoney(confirmAction.request.amount, confirmAction.request.currency) },
            { label: 'Action', value: confirmAction.request.action },
            { label: 'Target Resource', value: confirmAction.request.resource_id },
            { label: 'Agent', value: confirmAction.request.agent_name || confirmAction.request.agent_id },
          ]}
          onConfirm={handleExecuteAction}
          onCancel={() => !actionInProgressId && setConfirmAction(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Human Approval Workflow</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Review and authorize high-impact actions exceeding agent autonomy thresholds.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-color)' }}>
            <button
              className="btn"
              onClick={() => setStatusFilter('PENDING')}
              style={{
                padding: '6px 14px',
                fontSize: '0.85rem',
                background: statusFilter === 'PENDING' ? 'var(--accent-color)' : 'transparent',
                color: statusFilter === 'PENDING' ? '#fff' : 'var(--text-muted)',
              }}
            >
              Pending Inbox
            </button>
            <button
              className="btn"
              onClick={() => setStatusFilter('ALL')}
              style={{
                padding: '6px 14px',
                fontSize: '0.85rem',
                background: statusFilter === 'ALL' ? 'var(--accent-color)' : 'transparent',
                color: statusFilter === 'ALL' ? '#fff' : 'var(--text-muted)',
              }}
            >
              All History
            </button>
          </div>

          <button
            className="btn"
            onClick={() => fetchApprovalList(true)}
            disabled={isRefreshing}
            style={{ padding: '8px 14px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}
            aria-label="Refresh approvals list"
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>Loading approvals queue...</div>
      ) : approvals.length === 0 ? (
        <EmptyState
          title={statusFilter === 'PENDING' ? 'No pending approvals' : 'No approval records found'}
          description={statusFilter === 'PENDING' ? 'All autonomous agent transactions are within limits or already resolved.' : 'No transactions have triggered dual-control escalation.'}
          icon={<CheckCircle2 size={40} color="var(--success-color)" />}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {approvals.map((req) => {
            const isItemPending = actionInProgressId === req.id;
            const isRequestPending = req.status === 'PENDING';

            return (
              <div
                key={req.id}
                className="glass-panel"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '20px',
                  padding: '24px',
                }}
              >
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    {getStatusBadge(req.status)}
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={14} />
                      {formatRelativeTime(new Date(req.created_at))} ({formatDateTime(req.created_at)})
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.4rem', margin: '4px 0 12px 0', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{req.action.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--warning-color)', fontWeight: 700 }}>
                      {formatMoney(req.amount, req.currency)}
                    </span>
                  </h3>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '8px 16px',
                      fontSize: '0.85rem',
                      background: 'rgba(0, 0, 0, 0.2)',
                      padding: '12px 16px',
                      borderRadius: '8px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Agent: </span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{req.agent_name || req.agent_id}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Target: </span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>{req.resource_id}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Resource Type: </span>
                      <span style={{ color: 'var(--text-main)' }}>{req.resource_type}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Request ID: </span>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{req.id.substring(0, 8)}...</span>
                    </div>
                    {req.parent_request_id && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Lineage Parent: </span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{req.parent_request_id.substring(0, 8)}...</span>
                      </div>
                    )}
                    {req.decision_attempt !== undefined && req.decision_attempt !== null && req.decision_attempt > 1 && (
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Attempt: </span>
                        <span style={{ color: 'var(--warning-color)' }}>{req.decision_attempt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {isRequestPending && (
                  <div style={{ display: 'flex', gap: '12px', minWidth: '220px' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleOpenConfirm(req, 'deny')}
                      disabled={isItemPending}
                      style={{
                        flex: 1,
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--danger-color)',
                      }}
                    >
                      <XCircle size={16} />
                      {isItemPending ? 'Processing...' : 'Deny'}
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleOpenConfirm(req, 'approve')}
                      disabled={isItemPending}
                      style={{ flex: 1 }}
                    >
                      <CheckCircle2 size={16} />
                      {isItemPending ? 'Processing...' : 'Approve'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Approvals;
