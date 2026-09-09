import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { formatDistanceToNow } from 'date-fns';

interface ApprovalRequest {
  id: string;
  agent_id: string;
  agent_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  parent_request_id?: string;
  decision_attempt?: number;
}

const Approvals: React.FC = () => {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchApprovals = async () => {
    try {
      // Only fetch pending approvals for the inbox by default, or all if we want history
      // For now, let's fetch all and filter client side for tabs if we want, or just fetch pending
      const res = await axios.get('/api/approvals?status=PENDING');
      setApprovals(res.data);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 5000); // real-time updates
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'deny') => {
    try {
      await axios.post(`/api/approvals/${id}/${action}`);
      // Remove from pending list optimistically or refresh
      fetchApprovals();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || `Failed to ${action} request`);
    }
  };

  if (loading) {
    return <div className="text-gray-400">Loading approvals...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Human Approval Workflow</h1>
        <p className="text-gray-400">Review and authorize actions that exceed agent autonomy thresholds.</p>
      </header>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-md">
          {error}
        </div>
      )}

      {approvals.length === 0 ? (
        <div className="bg-[#111] border border-gray-800 rounded-lg p-8 text-center text-gray-500">
          No pending approvals at this time.
        </div>
      ) : (
        <div className="grid gap-4">
          {approvals.map((req) => (
            <div key={req.id} className="bg-[#111] border border-gray-800 rounded-lg p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-700 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 uppercase">
                    PENDING APPROVAL
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                  </span>
                </div>
                
                <h3 className="text-xl font-medium text-white flex items-baseline gap-2">
                  {req.action.replace('_', ' ')}
                  <span className="text-2xl font-bold text-red-400">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: req.currency }).format(req.amount)}
                  </span>
                </h3>
                
                <div className="text-sm text-gray-400 grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-1 mt-3">
                  <div>
                    <span className="text-gray-500">Agent:</span> <span className="font-mono text-gray-300">{req.agent_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Target:</span> <span className="font-mono text-gray-300">{req.resource_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Resource:</span> <span className="font-mono text-gray-300">{req.resource_type}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Req ID:</span> <span className="font-mono text-gray-500">{req.id.substring(0,8)}...</span>
                  </div>
                  {req.parent_request_id && (
                    <div>
                      <span className="text-gray-500">Parent:</span> <span className="font-mono text-gray-500">{req.parent_request_id.substring(0,8)}...</span>
                    </div>
                  )}
                  {req.decision_attempt !== undefined && req.decision_attempt > 1 && (
                    <div>
                      <span className="text-gray-500">Attempt:</span> <span className="font-mono text-gray-500">{req.decision_attempt}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex w-full md:w-auto gap-3 shrink-0">
                <button
                  onClick={() => handleAction(req.id, 'deny')}
                  className="flex-1 md:flex-none px-4 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded font-medium transition-colors"
                >
                  Deny
                </button>
                <button
                  onClick={() => handleAction(req.id, 'approve')}
                  className="flex-1 md:flex-none px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-medium transition-colors"
                >
                  Approve
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Approvals;
