import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play } from 'lucide-react';

const Simulator = () => {
  const [agents, setAgents] = useState([]);
  const [formData, setFormData] = useState({
    agent_id: '',
    action: 'CREATE_PAYMENT',
    resource_type: 'corporate_account',
    resource_id: 'ACC-001',
    amount: 10000,
    currency: 'INR',
    request_id: `req-${Math.floor(Math.random() * 100000)}`,
    simulate: true
  });

  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/agents');
      setAgents(res.data);
      if (res.data.length > 0) {
        setFormData(prev => ({ ...prev, agent_id: res.data[0].id }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: name === 'amount' ? Number(value) : value }));
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const payload = { ...formData };
      const res = await axios.post('/authorize', payload);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
      // Generate new request ID for next run
      setFormData(prev => ({ ...prev, request_id: `req-${Math.floor(Math.random() * 100000)}` }));
    }
  };

  return (
    <div>
      <h1 style={{marginBottom: '32px'}}>Authorization Simulator</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Form Panel */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Simulate Action</h2>
          <form onSubmit={handleSimulate}>
            <label>Agent</label>
            <select name="agent_id" value={formData.agent_id} onChange={handleChange} required>
              <option value="" disabled>Select Agent</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({a.status})</option>
              ))}
            </select>

            <label>Action</label>
            <input type="text" name="action" value={formData.action} onChange={handleChange} required />

            <label>Resource Type</label>
            <input type="text" name="resource_type" value={formData.resource_type} onChange={handleChange} required />

            <label>Resource ID</label>
            <input type="text" name="resource_id" value={formData.resource_id} onChange={handleChange} required />

            <label>Amount</label>
            <input type="number" name="amount" value={formData.amount} onChange={handleChange} required />

            <label>Currency</label>
            <input type="text" name="currency" value={formData.currency} onChange={handleChange} required />

            <label>Request ID</label>
            <input type="text" name="request_id" value={formData.request_id} onChange={handleChange} required />

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="simulate" name="simulate" checked={formData.simulate} onChange={handleChange} />
              <label htmlFor="simulate" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer' }}>Simulate only (no side-effects)</label>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '16px' }}>
              <Play size={18} /> {loading ? (formData.simulate ? 'Simulating...' : 'Executing...') : (formData.simulate ? 'Run Simulation' : 'Execute Action')}
            </button>
          </form>
          {error && <div style={{ color: 'var(--danger-color)', marginTop: '16px' }}>{error}</div>}
        </div>

        {/* Results Panel */}
        <div>
          {result && (
            <div className="glass-panel" style={{ 
              borderColor: result.decision === 'ALLOW' ? 'var(--success-color)' : 'var(--danger-color)' 
            }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '24px', display: 'flex', justifyContent: 'space-between' }}>
                Simulation Result
                <span className={result.decision === 'ALLOW' ? 'badge badge-active' : 'badge badge-revoked'}>
                  {result.decision}
                </span>
              </h2>

              {result.reason && (
                <div style={{ marginBottom: '24px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Reason: </span>
                  <strong>{result.reason}</strong>
                </div>
              )}

              <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '16px' }}>AUTHORIZATION TRACE</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.trace?.map((step: any, idx: number) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    padding: '12px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    borderLeft: `3px solid ${step.status === 'PASS' ? 'var(--success-color)' : step.status === 'FAIL' ? 'var(--danger-color)' : 'var(--warning-color)'}`
                  }}>
                    <span style={{ fontFamily: 'monospace' }}>{step.step}</span>
                    <span style={{ 
                      fontWeight: 600, 
                      color: step.status === 'PASS' ? 'var(--success-color)' : step.status === 'FAIL' ? 'var(--danger-color)' : 'var(--warning-color)'
                    }}>
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!result && (
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Run a simulation to see the trace.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Simulator;
