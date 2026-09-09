import React, { useEffect, useState } from 'react';
import axios from 'axios';

const FleetOverview = () => {
  const [overview, setOverview] = useState<any>(null);
  const [denials, setDenials] = useState<any[]>([]);
  const [agentsHealth, setAgentsHealth] = useState<any[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [fleetStatus, setFleetStatus] = useState('UNKNOWN');

  const fetchData = async () => {
    try {
      const [ovRes, denRes, agRes, eventsRes, fleetRes] = await Promise.all([
        axios.get('/analytics/overview'),
        axios.get('/analytics/denials'),
        axios.get('/analytics/agents'),
        axios.get('/audit-events?limit=5'),
        axios.get('/fleet/status')
      ]);
      
      setOverview(ovRes.data);
      setDenials(denRes.data);
      setAgentsHealth(agRes.data);
      const fetchedEvents = eventsRes.data.items || eventsRes.data;
      setRecentEvents(fetchedEvents.filter((e: any) => e.event_type === "AUTHORIZATION").slice(0, 5));
      setFleetStatus(fleetRes.data.fleet_state);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData(); // initial fetch
    const interval = setInterval(fetchData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  if (!overview) return <div style={{ padding: '40px', color: 'var(--text-muted)' }}>Loading Analytics...</div>;

  const formatMoney = (val: number) => `₹${(val / 1000).toFixed(1)}K`;

  return (
    <div>
      <h1 style={{marginBottom: '8px'}}>Governance Control Tower</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Live analytics and authorization telemetry.</p>
      
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <span className="stat-title">Active Agents</span>
          <span className="stat-value">{overview.agents.active} <span style={{fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal'}}>/ {overview.agents.total}</span></span>
        </div>
        
        <div className="glass-panel stat-card">
          <span className="stat-title">Requests Evaluated</span>
          <span className="stat-value">{overview.requests.total.toLocaleString()}</span>
        </div>
        
        <div className="glass-panel stat-card">
          <span className="stat-title">Allow Rate</span>
          <span className="stat-value" style={{color: 'var(--success-color)'}}>{overview.requests.allow_rate}%</span>
        </div>
        
        <div className="glass-panel stat-card">
          <span className="stat-title">Blocked Value</span>
          <span className="stat-value" style={{color: 'var(--danger-color)'}}>{formatMoney(overview.financial.value_blocked)}</span>
        </div>

        <div className="glass-panel stat-card">
          <span className="stat-title">Pending Value</span>
          <span className="stat-value" style={{color: 'var(--warning-color)'}}>{formatMoney(overview.financial.pending_value)}</span>
        </div>

        <div className="glass-panel stat-card" style={{ borderColor: fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)' }}>
          <span className="stat-title">Fleet Status</span>
          <span className="stat-value" style={{ color: fleetStatus === 'HALTED' ? 'var(--danger-color)' : 'var(--success-color)' }}>{fleetStatus}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {/* Live Events Stream */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Live Authorization Events</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Amount</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((evt, idx) => {
                const isDeny = evt.decision === 'DENY';
                const isAllow = evt.decision === 'ALLOW';
                const badgeClass = isAllow ? 'badge-active' : (isDeny ? 'badge-revoked' : 'badge-halted');
                return (
                  <tr key={idx}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour12: false })}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>
                      {evt.agent_id ? evt.agent_id.substring(0, 8) : 'SYSTEM'}
                    </td>
                    <td>{evt.amount ? `₹${evt.amount.toLocaleString()}` : '-'}</td>
                    <td><span className={`badge ${badgeClass}`}>{evt.decision}</span></td>
                  </tr>
                );
              })}
              {recentEvents.length === 0 && (
                <tr><td colSpan={4} style={{textAlign: 'center'}}>No recent authorizations.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Denial Reasons */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '20px' }}>Denial Reasons</h2>
          {denials.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px', textAlign: 'center' }}>No denials recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {denials.map((d, idx) => {
                const max = Math.max(...denials.map(d => d.count));
                const percent = (d.count / max) * 100;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.9rem' }}>
                      <span>{d.reason}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{d.count}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: 'var(--danger-color)', borderRadius: '4px' }}></div>
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
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Requests</th>
              <th>Deny %</th>
              <th>Blocked Value</th>
            </tr>
          </thead>
          <tbody>
            {agentsHealth.map((ag, idx) => (
              <tr key={idx}>
                <td>{ag.agent_name}</td>
                <td>{ag.requests.toLocaleString()}</td>
                <td>
                  <span style={{ color: ag.deny_percent > 10 ? 'var(--danger-color)' : 'var(--text-main)' }}>
                    {ag.deny_percent}%
                  </span>
                </td>
                <td>{ag.blocked_value > 0 ? `₹${ag.blocked_value.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
            {agentsHealth.length === 0 && (
              <tr><td colSpan={4} style={{textAlign: 'center'}}>No agent activity recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FleetOverview;
