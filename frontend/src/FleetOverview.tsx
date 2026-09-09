import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getAnalyticsOverview, getDenialReasons, getAgentsHealth } from './api/analytics';
import { getAuditEvents } from './api/audit';
import { getFleetStatus } from './api/fleet';
import type { AnalyticsOverview, DenialReason, AgentHealth, AuditEvent } from './types/api';
import { formatMoney, formatDateTime } from './utils/formatters';
import { StaleIndicator, type HealthStatus } from './components/StaleIndicator';
import { EmptyState } from './components/EmptyState';

const FleetOverview: React.FC = () => {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [denials, setDenials] = useState<DenialReason[]>([]);
  const [agentsHealth, setAgentsHealth] = useState<AgentHealth[]>([]);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [fleetStatus, setFleetStatus] = useState<'ACTIVE' | 'HALTED' | 'UNKNOWN'>('UNKNOWN');

  // Health and freshness telemetry
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('LIVE');
  const [lastSuccessfulUpdate, setLastSuccessfulUpdate] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Request concurrency protection
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsRefreshing(true);

    try {
      const [ovRes, denRes, agRes, eventsRes, fleetRes] = await Promise.all([
        getAnalyticsOverview(),
        getDenialReasons(),
        getAgentsHealth(),
        getAuditEvents({ limit: 10 }),
        getFleetStatus(),
      ]);

      if (!isMountedRef.current) return;

      setOverview(ovRes);
      setDenials(denRes);
      setAgentsHealth(agRes);

      // Section 15: Authoritative backend emits AUTHORIZATION_DECISION
      const authDecisions = eventsRes.items.filter(
        (e) => e.event_type === 'AUTHORIZATION_DECISION'
      );
      setRecentEvents(authDecisions.slice(0, 5));

      setFleetStatus(fleetRes.fleet_state);
      setHealthStatus('LIVE');
      setLastSuccessfulUpdate(Date.now());
      setErrorMsg(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      // Section 13: Never hide stale analytics. Visibly identify STALE or OFFLINE state.
      const message = err instanceof Error ? err.message : 'Failed to synchronize analytics';
      setErrorMsg(message);
      setHealthStatus(lastSuccessfulUpdate ? 'STALE' : 'OFFLINE');
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [lastSuccessfulUpdate]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    // Section 14: Polling every 5s with proper cleanup and duplicate prevention
    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  if (!overview && healthStatus === 'OFFLINE') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ marginBottom: '8px' }}>Governance Control Tower</h1>
            <p style={{ color: 'var(--text-muted)' }}>Real-time analytics and authorization telemetry.</p>
          </div>
          <StaleIndicator
            status={healthStatus}
            lastSuccessfulUpdate={lastSuccessfulUpdate}
            error={errorMsg}
            isRefreshing={isRefreshing}
            onManualRefresh={fetchData}
          />
        </div>
        <EmptyState
          title="Control Tower Unavailable"
          description="Unable to connect to the backend governance telemetry. Please verify network connectivity."
          action={
            <button className="btn btn-primary" onClick={fetchData} disabled={isRefreshing}>
              Retry Connection
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Governance Control Tower</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Real-time analytics and authorization telemetry.</p>
        </div>
        <StaleIndicator
          status={healthStatus}
          lastSuccessfulUpdate={lastSuccessfulUpdate}
          error={errorMsg}
          isRefreshing={isRefreshing}
          onManualRefresh={fetchData}
        />
      </div>

      {overview && (
        <div className="dashboard-grid">
          <div className="glass-panel stat-card">
            <span className="stat-title">Active Agents</span>
            <span className="stat-value">
              {overview.agents.active}{' '}
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                / {overview.agents.total}
              </span>
            </span>
          </div>

          <div className="glass-panel stat-card">
            <span className="stat-title">Requests Evaluated</span>
            <span className="stat-value">{overview.requests.total.toLocaleString()}</span>
          </div>

          <div className="glass-panel stat-card">
            <span className="stat-title">Allow Rate</span>
            <span className="stat-value" style={{ color: 'var(--success-color)' }}>
              {overview.requests.allow_rate}%
            </span>
          </div>

          <div className="glass-panel stat-card">
            <span className="stat-title">Blocked Value</span>
            <span className="stat-value" style={{ color: 'var(--danger-color)' }}>
              {formatMoney(overview.financial.value_blocked, 'INR')}
            </span>
          </div>

          <div className="glass-panel stat-card">
            <span className="stat-title">Pending Value</span>
            <span className="stat-value" style={{ color: 'var(--warning-color)' }}>
              {formatMoney(overview.financial.pending_value, 'INR')}
            </span>
          </div>

          <div
            className="glass-panel stat-card"
            style={{ borderColor: fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)' }}
          >
            <span className="stat-title">Fleet Status</span>
            <span
              className="stat-value"
              style={{ color: fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)' }}
            >
              {fleetStatus}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Live Events Stream */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Live Authorization Decisions</h2>
          {recentEvents.length === 0 ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState title="No recent authorizations" description="New evaluation decisions will stream here in real time." />
            </div>
          ) : (
            <table className="data-table" aria-label="Recent authorization decisions">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((evt) => {
                  const isDeny = evt.decision === 'DENY';
                  const isAllow = evt.decision === 'ALLOW';
                  const badgeClass = isAllow ? 'badge-active' : isDeny ? 'badge-revoked' : 'badge-halted';
                  return (
                    <tr key={evt.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {formatDateTime(evt.timestamp)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {evt.agent_id ? evt.agent_id.substring(0, 14) : 'SYSTEM'}
                      </td>
                      <td>{formatMoney(evt.amount, evt.currency || 'INR')}</td>
                      <td>
                        <span className={`badge ${badgeClass}`}>{evt.decision}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Denial Reasons */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Denial Reasons</h2>
          {denials.length === 0 ? (
            <div style={{ padding: '24px 0' }}>
              <EmptyState title="No denials recorded" description="No financial requests have been denied by policy or budget rules." />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {denials.map((d, idx) => {
                const max = Math.max(...denials.map((item) => item.count));
                const percent = max > 0 ? (d.count / max) * 100 : 0;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                      <span style={{ fontWeight: 500 }}>{d.reason}</span>
                      <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{d.count}</span>
                    </div>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${percent}%`,
                          height: '100%',
                          background: 'var(--danger-color)',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Agent Governance Health */}
      <div className="glass-panel">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Agent Governance Health</h2>
        {agentsHealth.length === 0 ? (
          <div style={{ padding: '24px 0' }}>
            <EmptyState title="No agent telemetry" description="Active agent governance metrics will be displayed here." />
          </div>
        ) : (
          <table className="data-table" aria-label="Agent governance health table">
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Requests</th>
                <th scope="col">Deny %</th>
                <th scope="col">Blocked Value</th>
              </tr>
            </thead>
            <tbody>
              {agentsHealth.map((ag) => (
                <tr key={ag.agent_id}>
                  <td style={{ fontWeight: 500 }}>{ag.agent_name}</td>
                  <td>{ag.requests.toLocaleString()}</td>
                  <td>
                    <span style={{ color: ag.deny_percent > 10 ? 'var(--danger-color)' : 'var(--text-main)', fontWeight: 600 }}>
                      {ag.deny_percent}%
                    </span>
                  </td>
                  <td>{formatMoney(ag.blocked_value, 'INR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default FleetOverview;
