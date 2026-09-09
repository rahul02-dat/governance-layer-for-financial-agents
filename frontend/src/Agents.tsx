import { useEffect, useState } from 'react';
import axios from 'axios';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  owner: string;
  risk_tier: string;
  status: string;
}

const Agents = () => {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await axios.post(`/api/agents/${id}/revoke`);
      fetchAgents();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await axios.post(`/api/agents/${id}/restore`);
      fetchAgents();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="glass-panel">
      <h1>Agents</h1>
      <p style={{marginBottom: '24px', color: 'var(--text-muted)'}}>Manage autonomous agents</p>
      
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Risk Tier</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.id}>
              <td>{agent.name}</td>
              <td>{agent.owner}</td>
              <td>{agent.risk_tier}</td>
              <td>
                <span className={`badge badge-${agent.status.toLowerCase()}`}>
                  {agent.status}
                </span>
              </td>
              <td>
                {agent.status === 'ACTIVE' ? (
                  <button className="btn btn-danger" onClick={() => handleRevoke(agent.id)}>
                    <ShieldAlert size={16} /> Revoke
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => handleRestore(agent.id)}>
                    <ShieldCheck size={16} /> Restore
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Agents;
