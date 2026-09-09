import React, { useEffect, useState } from 'react';
import axios from 'axios';

const InvestigationConsole = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [filters, setFilters] = useState({
    decision: '',
    action: '',
    agent_id: '',
    request_id: '',
    reason: ''
  });

  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  const fetchEvents = async () => {
    try {
      const skip = (page - 1) * limit;
      let url = `/audit-events?skip=${skip}&limit=${limit}`;
      
      if (filters.decision) url += `&decision=${filters.decision}`;
      if (filters.action) url += `&action=${filters.action}`;
      if (filters.agent_id) url += `&agent_id=${filters.agent_id}`;
      if (filters.request_id) url += `&request_id=${filters.request_id}`;
      if (filters.reason) url += `&reason=${filters.reason}`;

      const res = await axios.get(url);
      setEvents(res.data.items || res.data); // Support both paginated and non-paginated backends temporarily
      setTotal(res.data.total || (res.data.length ? res.data.length : 0));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000); // Poll every 5s for real-time updates
    return () => clearInterval(interval);
  }, [page, filters]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1); // Reset to page 1 on filter change
  };

  const handleRowClick = (evt: any) => {
    setSelectedEvent(selectedEvent?.id === evt.id ? null : evt);
  };

  return (
    <div>
      <h1 style={{ marginBottom: '8px' }}>Investigation Console</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Search, filter, and inspect detailed authorization telemetry.</p>

      {/* Filter Bar */}
      <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Decision</label>
          <select name="decision" value={filters.decision} onChange={handleFilterChange} className="form-input">
            <option value="">All</option>
            <option value="ALLOW">ALLOW</option>
            <option value="DENY">DENY</option>
            <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Action</label>
          <select name="action" value={filters.action} onChange={handleFilterChange} className="form-input">
            <option value="">All</option>
            <option value="CREATE_PAYMENT">CREATE_PAYMENT</option>
            <option value="TRANSFER">TRANSFER</option>
            <option value="REFUND">REFUND</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Reason</label>
          <input type="text" name="reason" value={filters.reason} onChange={handleFilterChange} className="form-input" placeholder="e.g. BUDGET_EXCEEDED" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Agent ID</label>
          <input type="text" name="agent_id" value={filters.agent_id} onChange={handleFilterChange} className="form-input" placeholder="Agent ID..." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Request ID</label>
          <input type="text" name="request_id" value={filters.request_id} onChange={handleFilterChange} className="form-input" placeholder="Request ID..." />
        </div>
      </div>

      {/* Data Table */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Audit Events</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total: {total} events</span>
        </div>
        
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Agent ID</th>
              <th>Action</th>
              <th>Amount</th>
              <th>Decision</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {events.map((evt) => {
              const isSelected = selectedEvent?.id === evt.id;
              const isDeny = evt.decision === 'DENY';
              const isAllow = evt.decision === 'ALLOW';
              const badgeClass = isAllow ? 'badge-active' : (isDeny ? 'badge-revoked' : 'badge-halted');

              return (
                <React.Fragment key={evt.id}>
                  <tr onClick={() => handleRowClick(evt)} style={{ cursor: 'pointer', background: isSelected ? 'rgba(255,255,255,0.05)' : '' }}>
                    <td style={{ color: 'var(--text-muted)' }}>{new Date(evt.timestamp).toLocaleString()}</td>
                    <td style={{ fontFamily: 'monospace' }}>{evt.agent_id ? evt.agent_id.substring(0,8) : 'SYSTEM'}</td>
                    <td>{evt.action || '-'}</td>
                    <td>{evt.amount ? `₹${evt.amount.toLocaleString()}` : '-'}</td>
                    <td><span className={`badge ${badgeClass}`}>{evt.decision}</span></td>
                    <td style={{ color: isDeny ? 'var(--danger-color)' : 'inherit' }}>{evt.reason || '-'}</td>
                  </tr>
                  
                  {isSelected && (
                    <tr>
                      <td colSpan={6} style={{ background: 'rgba(0,0,0,0.3)', padding: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Request ID</span>
                            <span style={{ fontFamily: 'monospace' }}>{evt.request_id || '-'}</span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Policy ID</span>
                            <span style={{ fontFamily: 'monospace' }}>{evt.policy_id || '-'}</span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latency</span>
                            <span>{evt.latency_ms ? `${evt.latency_ms.toFixed(1)} ms` : '-'}</span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Resource Type</span>
                            <span>{evt.resource_type || '-'}</span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Resource ID</span>
                            <span>{evt.resource_id || '-'}</span>
                          </div>
                          <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operator ID</span>
                            <span>{evt.operator_id || '-'}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {events.length === 0 && (
              <tr><td colSpan={6} style={{textAlign: 'center', padding: '24px'}}>No events match the filters.</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '12px' }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setPage(page - 1)} 
            disabled={page === 1}
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>Page {page}</span>
          <button 
            className="btn btn-secondary" 
            onClick={() => setPage(page + 1)} 
            disabled={page * limit >= total}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestigationConsole;
