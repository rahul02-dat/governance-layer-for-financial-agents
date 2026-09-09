import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAgents, quarantineAgent, restoreAgent } from './api/agents';
import type { Agent, QuarantineResult } from './types/api';
import { formatDateTime } from './utils/formatters';
import { ShieldAlert, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EmptyState } from './components/EmptyState';
import { Toast, type ToastMessage } from './components/Toast';

const Agents: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Concurrency & double-click protection
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Confirmation state
  const [confirmTarget, setConfirmTarget] = useState<{ agent: Agent; action: 'quarantine' | 'restore' } | null>(null);

  // Quarantine detailed result modal
  const [quarantineModalResult, setQuarantineModalResult] = useState<QuarantineResult | null>(null);

  const isMountedRef = useRef(true);

  const fetchAgentList = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const data = await getAgents();
      if (!isMountedRef.current) return;
      setAgents(data);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to retrieve agent fleet';
      setToast({ id: String(Date.now()), type: 'error', message: 'Agent Sync Failed', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchAgentList();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchAgentList]);

  const handleExecuteAction = async () => {
    if (!confirmTarget || actionInProgressId) return;

    const { agent, action } = confirmTarget;
    setActionInProgressId(agent.id);

    try {
      if (action === 'quarantine') {
        const result = await quarantineAgent(agent.id);
        setConfirmTarget(null);
        // Display detailed breakdown modal
        setQuarantineModalResult(result);
        await fetchAgentList();
      } else {
        await restoreAgent(agent.id);
        setConfirmTarget(null);
        setToast({
          id: String(Date.now()),
          type: 'success',
          message: `Agent ${agent.name} restored to ACTIVE status`,
        });
        await fetchAgentList();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to ${action} agent`;
      setConfirmTarget(null);
      setToast({ id: String(Date.now()), type: 'error', message: `Operation Failed`, detail: message });
      await fetchAgentList();
    } finally {
      if (isMountedRef.current) {
        setActionInProgressId(null);
      }
    }
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Confirmation Dialog */}
      {confirmTarget && (
        <ConfirmDialog
          isOpen={!!confirmTarget}
          title={confirmTarget.action === 'quarantine' ? 'Quarantine Autonomous Agent' : 'Restore Agent Operations'}
          operationName={confirmTarget.action === 'quarantine' ? 'Quarantining' : 'Restoring'}
          description={
            confirmTarget.action === 'quarantine'
              ? `Are you sure you want to quarantine ${confirmTarget.agent.name} (${confirmTarget.agent.id})?`
              : `Are you sure you want to restore ${confirmTarget.agent.name} (${confirmTarget.agent.id}) to active status?`
          }
          expectedEffect={
            confirmTarget.action === 'quarantine'
              ? 'This will immediately revoke all financial permissions in AgentGuard and scale down the associated Kubernetes deployment to 0 replicas.'
              : 'This will restore financial authorization evaluation capability for this agent.'
          }
          confirmButtonText={confirmTarget.action === 'quarantine' ? 'Quarantine Agent' : 'Restore Agent'}
          confirmButtonVariant={confirmTarget.action === 'quarantine' ? 'danger' : 'primary'}
          isPending={actionInProgressId === confirmTarget.agent.id}
          details={[
            { label: 'Agent ID', value: confirmTarget.agent.id },
            { label: 'Owner', value: confirmTarget.agent.owner },
            { label: 'Risk Tier', value: confirmTarget.agent.risk_tier },
            { label: 'Current Status', value: confirmTarget.agent.status },
          ]}
          onConfirm={handleExecuteAction}
          onCancel={() => !actionInProgressId && setConfirmTarget(null)}
        />
      )}

      {/* Section 31: Quarantine Detailed Result Modal */}
      {quarantineModalResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quarantine-result-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuarantineModalResult(null);
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              borderColor:
                quarantineModalResult.overall === 'SUCCESS'
                  ? 'var(--success-color)'
                  : quarantineModalResult.overall === 'PARTIAL_SUCCESS'
                  ? 'var(--warning-color)'
                  : 'var(--danger-color)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle
                  size={24}
                  color={
                    quarantineModalResult.overall === 'SUCCESS'
                      ? 'var(--success-color)'
                      : 'var(--warning-color)'
                  }
                />
                <h2 id="quarantine-result-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                  Quarantine Execution Report
                </h2>
              </div>
              <button
                onClick={() => setQuarantineModalResult(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                aria-label="Close quarantine report"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '8px',
                }}
              >
                <span>Agent Financial Revocation:</span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    color: quarantineModalResult.financial_revocation === 'SUCCESS' ? 'var(--success-color)' : 'var(--danger-color)',
                  }}
                >
                  {quarantineModalResult.financial_revocation === 'SUCCESS' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {quarantineModalResult.financial_revocation}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '8px',
                }}
              >
                <span>Kubernetes Workload Containment:</span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    color: quarantineModalResult.kubernetes_containment === 'SUCCESS' ? 'var(--success-color)' : 'var(--danger-color)',
                  }}
                >
                  {quarantineModalResult.kubernetes_containment === 'SUCCESS' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {quarantineModalResult.kubernetes_containment}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: '8px',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontWeight: 600 }}>Overall Outcome:</span>
                <span
                  className={`badge ${
                    quarantineModalResult.overall === 'SUCCESS'
                      ? 'badge-active'
                      : quarantineModalResult.overall === 'PARTIAL_SUCCESS'
                      ? 'badge-halted'
                      : 'badge-revoked'
                  }`}
                  style={{ fontSize: '0.85rem' }}
                >
                  {quarantineModalResult.overall === 'PARTIAL_SUCCESS'
                    ? 'PARTIAL SUCCESS'
                    : quarantineModalResult.overall}
                </span>
              </div>

              {quarantineModalResult.error && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--danger-color)',
                    fontSize: '0.85rem',
                  }}
                >
                  <strong>Containment Diagnostic:</strong> {quarantineModalResult.error}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setQuarantineModalResult(null)}>
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Agent Registry</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Active autonomous agents and workload containment controls.</p>
        </div>

        <button
          className="btn"
          onClick={() => fetchAgentList(true)}
          disabled={isRefreshing}
          style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}
          aria-label="Refresh agents list"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Loading agent fleet from registry...
        </div>
      ) : agents.length === 0 ? (
        <EmptyState title="No agents registered" description="No autonomous AI agents have been registered with AgentGuard." />
      ) : (
        <div className="glass-panel">
          <table className="data-table" aria-label="Agents registry table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Owner</th>
                <th scope="col">Risk Tier</th>
                <th scope="col">Status</th>
                <th scope="col">Registered</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const isPending = actionInProgressId === agent.id;
                const isActive = agent.status === 'ACTIVE';

                return (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{agent.name}</div>
                      <div style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {agent.id}
                      </div>
                    </td>
                    <td>{agent.owner}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            agent.risk_tier === 'HIGH'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : agent.risk_tier === 'MEDIUM'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(59, 130, 246, 0.15)',
                          color:
                            agent.risk_tier === 'HIGH'
                              ? 'var(--danger-color)'
                              : agent.risk_tier === 'MEDIUM'
                              ? 'var(--warning-color)'
                              : 'var(--accent-color)',
                        }}
                      >
                        {agent.risk_tier}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isActive ? 'badge-active' : 'badge-revoked'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDateTime(agent.created_at)}
                    </td>
                    <td>
                      {isActive ? (
                        <button
                          className="btn btn-danger"
                          onClick={() => setConfirmTarget({ agent, action: 'quarantine' })}
                          disabled={isPending}
                          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                          aria-label={`Quarantine ${agent.name}`}
                        >
                          <ShieldAlert size={14} />
                          {isPending ? 'Quarantining...' : 'Quarantine'}
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => setConfirmTarget({ agent, action: 'restore' })}
                          disabled={isPending}
                          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
                          aria-label={`Restore ${agent.name}`}
                        >
                          <ShieldCheck size={14} />
                          {isPending ? 'Restoring...' : 'Restore'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Agents;
