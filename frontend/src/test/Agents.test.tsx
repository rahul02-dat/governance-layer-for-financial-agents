import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Agents from '../Agents';
import * as agentsApi from '../api/agents';
import type { Agent, QuarantineResult } from '../types/api';

const mockAgents: Agent[] = [
  {
    id: 'payment-agent-001',
    name: 'Payment Agent',
    owner: 'finance-ops',
    risk_tier: 'HIGH',
    status: 'ACTIVE',
    created_at: '2026-09-09T08:00:00Z',
  },
];

describe('Agents Component & Quarantine UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active agents and prompts confirmation before quarantine', async () => {
    vi.spyOn(agentsApi, 'getAgents').mockResolvedValue(mockAgents);

    render(<Agents />);

    expect(await screen.findByText('Payment Agent')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();

    const quarantineBtn = screen.getByRole('button', { name: /quarantine payment agent/i });
    fireEvent.click(quarantineBtn);

    expect(screen.getByText('Quarantine Autonomous Agent')).toBeInTheDocument();
    expect(
      screen.getByText(/This will immediately revoke all financial permissions in AgentGuard/i)
    ).toBeInTheDocument();
  });

  it('displays separate status and PARTIAL SUCCESS when Kubernetes containment fails', async () => {
    vi.spyOn(agentsApi, 'getAgents').mockResolvedValue(mockAgents);

    const partialFailureResult: QuarantineResult = {
      agent_id: 'payment-agent-001',
      financial_revocation: 'SUCCESS',
      kubernetes_containment: 'FAILED',
      overall: 'PARTIAL_SUCCESS',
      error: 'Kubernetes API connection refused',
    };

    vi.spyOn(agentsApi, 'quarantineAgent').mockResolvedValue(partialFailureResult);

    render(<Agents />);

    const quarantineBtn = await screen.findByRole('button', { name: /quarantine payment agent/i });
    fireEvent.click(quarantineBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Quarantine Agent' });
    fireEvent.click(confirmBtn);

    // Section 31: Must show breakdown and PARTIAL SUCCESS
    expect(await screen.findByText('Quarantine Execution Report')).toBeInTheDocument();
    expect(screen.getByText('Agent Financial Revocation:')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes Workload Containment:')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL SUCCESS')).toBeInTheDocument();
    expect(screen.getByText(/Kubernetes API connection refused/)).toBeInTheDocument();
  });
});
