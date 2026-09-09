import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAuditEvents, verifyAuditChain, type AuditFilterParams } from './api/audit';
import type { AuditEvent, AuditVerifyResult } from './types/api';
import { formatMoney, formatDateTime } from './utils/formatters';
import { ShieldCheck, ShieldAlert, Search, RefreshCw, ChevronLeft, ChevronRight, Hash, Eye, X } from 'lucide-react';
import { EmptyState } from './components/EmptyState';
import { Toast, type ToastMessage } from './components/Toast';

const PAGE_SIZE = 25;

const Audit: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Cryptographic Verification State
  const [verificationResult, setVerificationResult] = useState<AuditVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Filter Bar State
  const [filters, setFilters] = useState<AuditFilterParams>({
    agent_id: '',
    decision: '',
    action: '',
    event_type: '',
    request_id: '',
    reason: '',
  });

  // Event Detail Modal State
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const isMountedRef = useRef(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const skip = (currentPage - 1) * PAGE_SIZE;
      const res = await getAuditEvents({
        skip,
        limit: PAGE_SIZE,
        agent_id: filters.agent_id || undefined,
        decision: filters.decision || undefined,
        action: filters.action || undefined,
        event_type: filters.event_type || undefined,
        request_id: filters.request_id || undefined,
        reason: filters.reason || undefined,
      });

      if (!isMountedRef.current) return;
      setEvents(res.items);
      setTotalCount(res.total);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch audit events';
      setToast({ id: String(Date.now()), type: 'error', message: 'Audit Fetch Failed', detail: message });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [currentPage, filters]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchEvents();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchEvents]);

  const handleRunVerification = async () => {
    setIsVerifying(true);
    try {
      const result = await verifyAuditChain();
      setVerificationResult(result);
      if (result.valid) {
        setToast({
          id: String(Date.now()),
          type: 'success',
          message: 'Audit Hash Chain Verified',
          detail: `Verified ${result.total_events || 0} chained events from GENESIS to head.`,
        });
      } else {
        setToast({
          id: String(Date.now()),
          type: 'error',
          message: 'Audit Hash Chain Tampering Detected!',
          detail: result.error || 'Cryptographic sequence mismatch found in audit chain.',
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Audit verification failed';
      setToast({ id: String(Date.now()), type: 'error', message: 'Verification Check Failed', detail: message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset to page 1 on filter change
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Audit Detail Modal */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-detail-title"
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
            if (e.target === e.currentTarget) setSelectedEvent(null);
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '680px',
              width: '100%',
              padding: '28px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Hash size={24} color="var(--accent-color)" />
                <h2 id="event-detail-title" style={{ margin: 0, fontSize: '1.4rem' }}>
                  Audit Event #{selectedEvent.sequence_number ?? selectedEvent.id.substring(0, 8)}
                </h2>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                aria-label="Close detail modal"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 20px', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Timestamp (UTC)</span>
                <div style={{ fontWeight: 500 }}>{selectedEvent.timestamp}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Event Type</span>
                <div style={{ fontWeight: 600 }}>{selectedEvent.event_type}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Agent ID</span>
                <div style={{ fontFamily: 'monospace' }}>{selectedEvent.agent_id || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Decision</span>
                <div>
                  <span
                    className={`badge ${
                      selectedEvent.decision === 'ALLOW'
                        ? 'badge-active'
                        : selectedEvent.decision === 'DENY'
                        ? 'badge-revoked'
                        : 'badge-halted'
                    }`}
                  >
                    {selectedEvent.decision || '-'}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Action</span>
                <div>{selectedEvent.action || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Amount</span>
                <div style={{ fontWeight: 600 }}>
                  {formatMoney(selectedEvent.amount, selectedEvent.currency || 'INR')}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reason</span>
                <div>{selectedEvent.reason || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Policy Version</span>
                <div>{selectedEvent.policy_version ?? '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Request ID</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{selectedEvent.request_id || '-'}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Authorization ID</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{selectedEvent.authorization_id || '-'}</div>
              </div>
            </div>

            {/* Cryptographic Hashes */}
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                Cryptographic Chaining
              </span>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Previous Event Hash</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', color: '#9ba1a6' }}>
                  {selectedEvent.previous_hash || 'GENESIS'}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Event SHA-256 Hash</span>
                <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', color: 'var(--accent-color)' }}>
                  {selectedEvent.event_hash || '-'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setSelectedEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Verification Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '32px' }}>
        <div>
          <h1 style={{ marginBottom: '8px' }}>Audit Investigation</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Cryptographically verified, tamper-evident governance ledger.</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {verificationResult && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: verificationResult.valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${verificationResult.valid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: verificationResult.valid ? 'var(--success-color)' : 'var(--danger-color)',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {verificationResult.valid ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
              {verificationResult.valid ? 'VALID CHAIN' : 'CHAIN TAMPERED'}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleRunVerification}
            disabled={isVerifying}
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            {isVerifying ? <RefreshCw size={14} className="spin-animation" /> : <ShieldCheck size={14} />}
            {isVerifying ? 'Verifying Chain...' : 'Verify Audit Chain'}
          </button>
        </div>
      </div>

      {/* Server-Side Filter Bar */}
      <div className="glass-panel" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.85rem' }}>Decision</label>
            <select name="decision" value={filters.decision} onChange={handleFilterChange}>
              <option value="">All Decisions</option>
              <option value="ALLOW">ALLOW</option>
              <option value="DENY">DENY</option>
              <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem' }}>Event Type</label>
            <select name="event_type" value={filters.event_type} onChange={handleFilterChange}>
              <option value="">All Event Types</option>
              <option value="AUTHORIZATION_DECISION">AUTHORIZATION_DECISION</option>
              <option value="AGENT_REVOKED">AGENT_REVOKED</option>
              <option value="AGENT_QUARANTINED">AGENT_QUARANTINED</option>
              <option value="FLEET_HALTED">FLEET_HALTED</option>
              <option value="FLEET_RESUMED">FLEET_RESUMED</option>
              <option value="BUDGET_CREATED">BUDGET_CREATED</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem' }}>Action</label>
            <input
              type="text"
              name="action"
              value={filters.action}
              onChange={handleFilterChange}
              placeholder="e.g. CREATE_PAYMENT"
            />
          </div>

          <div>
            <label style={{ fontSize: '0.85rem' }}>Agent ID</label>
            <input
              type="text"
              name="agent_id"
              value={filters.agent_id}
              onChange={handleFilterChange}
              placeholder="Agent ID..."
            />
          </div>

          <div>
            <label style={{ fontSize: '0.85rem' }}>Request ID</label>
            <input
              type="text"
              name="request_id"
              value={filters.request_id}
              onChange={handleFilterChange}
              placeholder="Request ID..."
            />
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Audit Events ({totalCount})</h2>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Loading audit events from ledger...
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            title="No audit events found"
            description="No cryptographic records match the current filter criteria."
            icon={<Search size={36} />}
          />
        ) : (
          <>
            <table className="data-table" aria-label="Audit events ledger">
              <thead>
                <tr>
                  <th scope="col">Seq #</th>
                  <th scope="col">Time</th>
                  <th scope="col">Type</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent-color)' }}>
                      {evt.sequence_number ?? '-'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {formatDateTime(evt.timestamp)}
                    </td>
                    <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>{evt.event_type}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {evt.agent_id || 'SYSTEM'}
                    </td>
                    <td>{formatMoney(evt.amount, evt.currency || 'INR')}</td>
                    <td>
                      <span
                        className={`badge ${
                          evt.decision === 'ALLOW'
                            ? 'badge-active'
                            : evt.decision === 'DENY'
                            ? 'badge-revoked'
                            : 'badge-halted'
                        }`}
                      >
                        {evt.decision || '-'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {evt.reason || '-'}
                    </td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => setSelectedEvent(evt)}
                        style={{ padding: '4px 10px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }}
                        aria-label={`Inspect event ${evt.sequence_number ?? evt.id}`}
                      >
                        <Eye size={14} /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button
                className="btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || loading}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} /> Previous
              </button>

              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} events
              </span>

              <button
                className="btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || loading}
                style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                aria-label="Next page"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Audit;
