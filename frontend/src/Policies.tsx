import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPolicies } from './api/policies';
import type { Policy } from './types/api';
import { formatDateTime } from './utils/formatters';
import { FileCode, RefreshCw, Eye, X, Shield, CheckCircle2 } from 'lucide-react';
import { EmptyState } from './components/EmptyState';
import { Toast, type ToastMessage } from './components/Toast';

const Policies: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Policy View Modal
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);

  const isMountedRef = useRef(true);

  const fetchPolicyList = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    try {
      const data = await getPolicies();
      if (!isMountedRef.current) return;
      setPolicies(data);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch governance policies';
      setToast({ id: String(Date.now()), type: 'error', message: 'Policies Fetch Failed', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchPolicyList();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchPolicyList]);

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Policy Content Viewer Modal */}
      {selectedPolicy && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-viewer-title"
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
            if (e.target === e.currentTarget) setSelectedPolicy(null);
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '720px',
              width: '100%',
              padding: '28px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileCode size={24} color="var(--accent-color)" />
                <div>
                  <h2 id="policy-viewer-title" style={{ margin: 0, fontSize: '1.35rem' }}>
                    {selectedPolicy.name}
                  </h2>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Version v{selectedPolicy.version_number || 1} — {selectedPolicy.enabled ? 'Active Policy' : 'Disabled'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPolicy(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                aria-label="Close policy viewer"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '16px', background: 'rgba(0,0,0,0.3)', padding: '12px 16px', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Content Hash (SHA-256)
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent-color)', wordBreak: 'break-all' }}>
                {selectedPolicy.content_hash || 'No hash recorded'}
              </span>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px', fontWeight: 500 }}>
                Authoritative Rego Definition (Read-Only)
              </span>
              <pre
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '16px',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  lineHeight: '1.5',
                  overflowX: 'auto',
                  color: '#e2e8f0',
                  maxHeight: '360px',
                }}
              >
                {selectedPolicy.rego_content || '# No rego content available'}
              </pre>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setSelectedPolicy(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Governance Policies</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Open Policy Agent (OPA) rules and dual-control thresholds enforced across the fleet.</p>
        </div>

        <button
          className="btn"
          onClick={() => fetchPolicyList(true)}
          disabled={isRefreshing}
          style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)' }}
          aria-label="Refresh policies list"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin-animation' : ''} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
          Loading governance policies...
        </div>
      ) : policies.length === 0 ? (
        <EmptyState
          title="No policies found"
          description="No governance policies are currently registered in the database."
          icon={<Shield size={36} />}
        />
      ) : (
        <div className="glass-panel">
          <table className="data-table" aria-label="Governance policies table">
            <thead>
              <tr>
                <th scope="col">Policy Name</th>
                <th scope="col">Version</th>
                <th scope="col">Status</th>
                <th scope="col">Effective Time</th>
                <th scope="col">Content Hash</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-color)' }}>
                      v{p.version_number ?? 1}
                    </span>
                  </td>
                  <td>
                    {p.enabled ? (
                      <span className="badge badge-active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={12} /> Active
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                        Disabled
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {formatDateTime(p.created_at)}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.content_hash ? `${p.content_hash.substring(0, 16)}...` : '-'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => setSelectedPolicy(p)}
                      style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
                      aria-label={`Inspect policy ${p.name}`}
                    >
                      <Eye size={14} /> View Rego
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Policies;
