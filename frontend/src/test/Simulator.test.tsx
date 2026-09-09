import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Simulator from '../Simulator';
import * as agentsApi from '../api/agents';
import * as authApi from '../api/authorize';
import type { Agent } from '../types/api';

const mockAgents: Agent[] = [
  {
    id: 'agent-sandbox-1',
    name: 'Sandbox Agent',
    owner: 'qa-team',
    risk_tier: 'LOW',
    status: 'ACTIVE',
    created_at: '2026-09-09T08:00:00Z',
  },
];

describe('Simulator Component (Deterministic Test Harness & Sandbox)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs deterministic simulation dry-run without mutating budgets', async () => {
    vi.spyOn(agentsApi, 'getAgents').mockResolvedValue(mockAgents);
    const authSpy = vi.spyOn(authApi, 'authorizeAction').mockResolvedValue({
      decision: 'ALLOW',
      remaining_budget: 45000,
    });

    render(<Simulator />);

    expect(await screen.findByText('Governance Test Harness & Sandbox')).toBeInTheDocument();
    expect(screen.getByText('Simulation (Dry Run)')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /simulate governance action/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          simulate: true,
          agent_id: 'agent-sandbox-1',
        })
      );
    });

    expect(await screen.findByText('ALLOW')).toBeInTheDocument();
  });

  it('switches to sandbox execution mode and issues signed authorization credential', async () => {
    vi.spyOn(agentsApi, 'getAgents').mockResolvedValue(mockAgents);
    const authSpy = vi.spyOn(authApi, 'authorizeAction').mockResolvedValue({
      decision: 'ALLOW',
      authorization_id: 'AUTH-SANDBOX-EXEC-999',
      expires_at: '2026-09-09T10:15:00Z',
      remaining_budget: 40000,
    });

    render(<Simulator />);

    // Switch mode to Sandbox Execution
    const sandboxModeBtn = await screen.findByRole('button', { name: 'Sandbox Execution' });
    fireEvent.click(sandboxModeBtn);

    const executeBtn = screen.getByRole('button', { name: 'Execute in Sandbox' });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(authSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          simulate: false,
          agent_id: 'agent-sandbox-1',
        })
      );
    });

    expect(await screen.findByText('AUTH-SANDBOX-EXEC-999')).toBeInTheDocument();
    expect(screen.getByText('Expires: 2026-09-09T10:15:00Z')).toBeInTheDocument();
  });
});
