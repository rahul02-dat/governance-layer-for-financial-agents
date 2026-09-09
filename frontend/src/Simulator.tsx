import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAgents } from './api/agents';
import { authorizeAction } from './api/authorize';
import type { Agent, AuthorizeResponse } from './types/api';
import { formatMoney } from './utils/formatters';
import { Play, Shield, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { Toast, type ToastMessage } from './components/Toast';

let requestCounter = 1001;

function generateRequestId(): string {
  return `req-det-${Date.now().toString(36)}-${requestCounter++}`;
}

const Simulator: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState<boolean>(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Form State
  const [agentId, setAgentId] = useState<string>('');
  const [action, setAction] = useState<string>('CREATE_PAYMENT');
  const [resourceType, setResourceType] = useState<string>('corporate_account');
  const [resourceId, setResourceId] = useState<string>('ACC-001');
  const [amount, setAmount] = useState<number>(5000);
  const [currency, setCurrency] = useState<string>('INR');
  const [requestId, setRequestId] = useState<string>(() => generateRequestId());

  // Dual Execution Mode: Simulation (Dry-Run) vs Sandbox Execution
  const [executionMode, setExecutionMode] = useState<'SIMULATION' | 'SANDBOX'>('SIMULATION');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<AuthorizeResponse | null>(null);

  const isMountedRef = useRef(true);

  const loadAgents = useCallback(async () => {
    try {
      const data = await getAgents();
      if (!isMountedRef.current) return;
      setAgents(data);
      if (data.length > 0) {
        setAgentId(data[0].id);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load agents';
      setToast({ id: String(Date.now()), type: 'error', message: 'Failed to load agents', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoadingAgents(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadAgents();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadAgents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    const isSimulate = executionMode === 'SIMULATION';

    try {
      const res = await authorizeAction({
        agent_id: agentId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        amount,
        currency,
        request_id: requestId,
        simulate: isSimulate,
      });

      if (!isMountedRef.current) return;
      setResult(res);

      if (res.decision === 'ALLOW') {
        setToast({
          id: String(Date.now()),
          type: 'success',
          message: isSimulate ? 'Simulation Allowed' : 'Sandbox Execution Authorized',
          detail: res.authorization_id ? `Authorization ID: ${res.authorization_id}` : undefined,
        });
      } else if (res.decision === 'DENY') {
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: 'Financial Action Denied',
          detail: res.reason || 'Blocked by governance policy.',
        });
      } else {
        setToast({
          id: String(Date.now()),
          type: 'info',
          message: 'Escalated for Human Approval',
          detail: 'Transaction exceeds autonomy threshold.',
        });
      }

      // Generate new deterministic request ID for next run
      setRequestId(generateRequestId());
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Execution failed';
      setToast({ id: String(Date.now()), type: 'error', message: 'Authorization Error', detail: message });
    } finally {
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'ALLOW':
        return (
          <span className="badge badge-active" style={{ fontSize: '1rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={18} /> ALLOW
          </span>
        );
      case 'DENY':
        return (
          <span className="badge badge-revoked" style={{ fontSize: '1rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <XCircle size={18} /> DENY
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="badge badge-halted" style={{ fontSize: '1rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={18} /> PENDING_APPROVAL
          </span>
        );
      default:
        return <span className="badge">{decision}</span>;
    }
  };

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ marginBottom: '8px' }}>Governance Test Harness & Sandbox</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Deterministic policy evaluation and sandbox financial execution harness for autonomous agents.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '32px' }}>
        {/* Form Panel */}
        <div className="glass-panel">
          {/* Execution Mode Selector */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Execution Mode</label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                background: 'rgba(0,0,0,0.3)',
                padding: '6px',
                borderRadius: '8px',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setExecutionMode('SIMULATION')}
                style={{
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  background: executionMode === 'SIMULATION' ? 'var(--accent-color)' : 'transparent',
                  color: executionMode === 'SIMULATION' ? '#fff' : 'var(--text-muted)',
                }}
              >
                Simulation (Dry Run)
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setExecutionMode('SANDBOX')}
                style={{
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  background: executionMode === 'SANDBOX' ? 'var(--success-color)' : 'transparent',
                  color: executionMode === 'SANDBOX' ? '#fff' : 'var(--text-muted)',
                }}
              >
                Sandbox Execution
              </button>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
              {executionMode === 'SIMULATION'
                ? 'Dry run evaluates OPA policies and budget limits without recording debits or emitting authorizations.'
                : 'Sandbox executes the real AgentGuard governance path, issuing signed authorization credentials against restricted mock accounts.'}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="sim-agent">Agent</label>
              <select
                id="sim-agent"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={loadingAgents || isSubmitting}
                required
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.status}) — Tier: {a.risk_tier}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label htmlFor="sim-action">Action</label>
                <input
                  id="sim-action"
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label htmlFor="sim-resource-type">Resource Type</label>
                <input
                  id="sim-resource-type"
                  type="text"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label htmlFor="sim-resource-id">Target Resource ID</label>
                <input
                  id="sim-resource-id"
                  type="text"
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label htmlFor="sim-currency">Currency</label>
                <input
                  id="sim-currency"
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label htmlFor="sim-amount">Amount</label>
                <input
                  id="sim-amount"
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div>
                <label htmlFor="sim-request-id">Request ID (Deterministic)</label>
                <input
                  id="sim-request-id"
                  type="text"
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className={executionMode === 'SANDBOX' ? 'btn btn-success' : 'btn btn-primary'}
              disabled={isSubmitting || loadingAgents}
              style={{ width: '100%', padding: '12px' }}
            >
              <Play size={18} />
              {isSubmitting
                ? 'Evaluating Governance Stack...'
                : executionMode === 'SANDBOX'
                ? 'Execute in Sandbox'
                : 'Simulate Governance Action'}
            </button>
          </form>
        </div>

        {/* Results Panel */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Evaluation Telemetry</h2>

          {!result && !isSubmitting && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Shield size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p>Configure parameters on the left and submit to evaluate against OPA policies and budget thresholds.</p>
            </div>
          )}

          {isSubmitting && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Shield size={48} className="spin-animation" style={{ color: 'var(--accent-color)', marginBottom: '16px' }} />
              <p>Evaluating request across OPA rules, fleet budgets, agent permissions, and emergency status...</p>
            </div>
          )}

          {result && (
            <div>
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'rgba(0,0,0,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Authoritative Decision
                  </span>
                  {getDecisionBadge(result.decision)}
                </div>

                {result.remaining_budget !== null && result.remaining_budget !== undefined && (
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Remaining Daily Budget
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {formatMoney(result.remaining_budget, currency)}
                    </span>
                  </div>
                )}
              </div>

              {result.reason && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--danger-color)',
                  }}
                >
                  <ShieldAlert size={20} />
                  <span>
                    <strong>Governance Denial Reason:</strong> {result.reason}
                  </span>
                </div>
              )}

              {result.authorization_id && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    marginBottom: '20px',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                    Issued Execution Authorization ID
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: 'var(--success-color)', wordBreak: 'break-all' }}>
                    {result.authorization_id}
                  </span>
                  {result.expires_at && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                      Expires: {result.expires_at}
                    </span>
                  )}
                </div>
              )}

              {result.trace && result.trace.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
                    Governance Evaluation Trace
                  </span>
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    {result.trace.map((step, idx) => (
                      <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        {JSON.stringify(step)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Simulator;
