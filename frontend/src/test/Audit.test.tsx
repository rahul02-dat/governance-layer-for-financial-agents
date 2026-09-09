import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Audit from '../Audit';
import * as auditApi from '../api/audit';
import type { PaginatedAuditEvents, AuditVerifyResult } from '../types/api';

const mockAuditEvents: PaginatedAuditEvents = {
  total: 55,
  items: [
    {
      id: 'evt-101',
      sequence_number: 1,
      timestamp: '2026-09-09T08:00:00Z',
      event_type: 'AUTHORIZATION_DECISION',
      agent_id: 'payment-agent-001',
      action: 'CREATE_PAYMENT',
      amount: 25000,
      currency: 'INR',
      decision: 'ALLOW',
      reason: 'POLICY_PERMITTED',
      event_hash: 'abc123hash',
      previous_hash: 'GENESIS',
    },
  ],
};

const mockVerifyValid: AuditVerifyResult = {
  valid: true,
  message: 'Audit hash chain is fully valid and untampered',
  total_events: 55,
  head_hash: 'head123hash',
};

const mockVerifyTampered: AuditVerifyResult = {
  valid: false,
  error: 'CHAIN_BROKEN_PREVIOUS_HASH_MISMATCH',
  broken_event_id: 'evt-101',
  sequence_number: 1,
};

describe('Audit Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders audit records with pagination metadata and inspection capabilities', async () => {
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue(mockAuditEvents);

    render(<Audit />);

    expect(await screen.findByText('Audit Investigation')).toBeInTheDocument();
    expect(screen.getByText('payment-agent-001')).toBeInTheDocument();
    expect(screen.getByText('POLICY_PERMITTED')).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it('triggers cryptographic chain verification and shows VALID badge', async () => {
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue(mockAuditEvents);
    vi.spyOn(auditApi, 'verifyAuditChain').mockResolvedValue(mockVerifyValid);

    render(<Audit />);

    const verifyBtn = await screen.findByRole('button', { name: /verify audit chain/i });
    fireEvent.click(verifyBtn);

    expect(await screen.findByText('VALID CHAIN')).toBeInTheDocument();
  });

  it('displays CHAIN TAMPERED badge when cryptographic verification detects anomaly', async () => {
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue(mockAuditEvents);
    vi.spyOn(auditApi, 'verifyAuditChain').mockResolvedValue(mockVerifyTampered);

    render(<Audit />);

    const verifyBtn = await screen.findByRole('button', { name: /verify audit chain/i });
    fireEvent.click(verifyBtn);

    expect(await screen.findByText('CHAIN TAMPERED')).toBeInTheDocument();
  });

  it('opens detailed inspection modal with cryptographic hash lineage', async () => {
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue(mockAuditEvents);

    render(<Audit />);

    const inspectBtn = await screen.findByRole('button', { name: /inspect/i });
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/Audit Event #1/)).toBeInTheDocument();
    expect(screen.getByText('GENESIS')).toBeInTheDocument();
    expect(screen.getByText('abc123hash')).toBeInTheDocument();
  });
});
