import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Approvals from '../Approvals';
import * as approvalsApi from '../api/approvals';
import type { ApprovalRequest } from '../types/api';

const mockApprovals: ApprovalRequest[] = [
  {
    id: 'app-001',
    agent_id: 'payment-agent-1',
    agent_name: 'Payment Agent',
    action: 'CREATE_PAYMENT',
    resource_type: 'corporate_account',
    resource_id: 'ACC-99',
    amount: 150000,
    currency: 'INR',
    status: 'PENDING',
    created_at: '2026-09-09T09:00:00Z',
    parent_request_id: 'req-parent-1',
    decision_attempt: 1,
  },
];

describe('Approvals Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pending approval cards with full governance context', async () => {
    vi.spyOn(approvalsApi, 'getApprovals').mockResolvedValue(mockApprovals);

    render(<Approvals />);

    expect(await screen.findByText('Human Approval Workflow')).toBeInTheDocument();
    expect(screen.getByText('CREATE PAYMENT')).toBeInTheDocument();
    expect(screen.getByText('ACC-99')).toBeInTheDocument();
    expect(screen.getByText('Payment Agent')).toBeInTheDocument();
  });

  it('opens confirmation modal before executing approval', async () => {
    vi.spyOn(approvalsApi, 'getApprovals').mockResolvedValue(mockApprovals);
    const approveSpy = vi.spyOn(approvalsApi, 'approveRequest').mockResolvedValue({
      status: 'success',
      decision: 'ALLOW',
      authorization_id: 'AUTH-EXEC-123',
    });

    render(<Approvals />);

    const approveButton = await screen.findByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    // Confirmation dialog should appear with explicit transaction details
    expect(screen.getByText('Authorize Financial Execution')).toBeInTheDocument();
    expect(screen.getByText(/This will immediately issue an execution authorization/i)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Approve Request' });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(approveSpy).toHaveBeenCalledWith('app-001');
    });
  });

  it('gracefully handles already processed race conditions without generic errors', async () => {
    vi.spyOn(approvalsApi, 'getApprovals').mockResolvedValue(mockApprovals);
    vi.spyOn(approvalsApi, 'approveRequest').mockRejectedValue(
      new Error('Cannot approve request with status APPROVED')
    );

    render(<Approvals />);

    const approveButton = await screen.findByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    const confirmButton = screen.getByRole('button', { name: 'Approve Request' });
    fireEvent.click(confirmButton);

    expect(
      await screen.findByText('This approval request has already been processed.')
    ).toBeInTheDocument();
  });

  it('handles expired requests clearly', async () => {
    vi.spyOn(approvalsApi, 'getApprovals').mockResolvedValue(mockApprovals);
    vi.spyOn(approvalsApi, 'denyRequest').mockRejectedValue(
      new Error('Approval request has expired')
    );

    render(<Approvals />);

    const denyButton = await screen.findByRole('button', { name: /deny/i });
    fireEvent.click(denyButton);

    const confirmButton = screen.getByRole('button', { name: 'Deny Request' });
    fireEvent.click(confirmButton);

    expect(await screen.findByText('Approval request has expired.')).toBeInTheDocument();
  });
});
