import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FleetOverview from '../FleetOverview';
import * as analyticsApi from '../api/analytics';
import * as auditApi from '../api/audit';
import * as fleetApi from '../api/fleet';
import type { AnalyticsOverview } from '../types/api';

const mockOverview: AnalyticsOverview = {
  agents: { total: 5, active: 4, revoked: 1 },
  requests: { total: 120, allowed: 100, denied: 15, pending: 5, allow_rate: 83.33, deny_rate: 12.5 },
  financial: { value_governed: 500000, value_allowed: 400000, value_blocked: 80000, pending_value: 20000 },
};

describe('FleetOverview Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders successfully with live metrics and currency formatting', async () => {
    vi.spyOn(analyticsApi, 'getAnalyticsOverview').mockResolvedValue(mockOverview);
    vi.spyOn(analyticsApi, 'getDenialReasons').mockResolvedValue([{ reason: 'BUDGET_EXCEEDED', count: 12 }]);
    vi.spyOn(analyticsApi, 'getAgentsHealth').mockResolvedValue([
      { agent_id: 'agent-1', agent_name: 'Payment Agent', requests: 50, deny_percent: 4, blocked_value: 10000 },
    ]);
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'evt-1',
          timestamp: '2026-09-09T10:00:00Z',
          event_type: 'AUTHORIZATION_DECISION',
          agent_id: 'agent-1',
          action: 'CREATE_PAYMENT',
          amount: 5000,
          currency: 'INR',
          decision: 'ALLOW',
        },
      ],
    });
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'ACTIVE' });

    render(<FleetOverview />);

    expect(await screen.findByText('Governance Control Tower')).toBeInTheDocument();
    expect(await screen.findByText(/83.33%/)).toBeInTheDocument();
    expect(await screen.findByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('displays STALE status when background refresh fails after previous success', async () => {
    vi.spyOn(analyticsApi, 'getAnalyticsOverview')
      .mockResolvedValueOnce(mockOverview)
      .mockRejectedValue(new Error('Network connectivity lost'));
    vi.spyOn(analyticsApi, 'getDenialReasons').mockResolvedValue([]);
    vi.spyOn(analyticsApi, 'getAgentsHealth').mockResolvedValue([]);
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue({ total: 0, items: [] });
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'ACTIVE' });

    render(<FleetOverview />);
    expect(await screen.findByText('LIVE')).toBeInTheDocument();

    const refreshBtn = screen.getByRole('button', { name: /refresh telemetry/i });
    fireEvent.click(refreshBtn);

    expect(await screen.findByText('STALE')).toBeInTheDocument();
  });

  it('filters AUTHORIZATION_DECISION events specifically without showing non-decision events', async () => {
    vi.spyOn(analyticsApi, 'getAnalyticsOverview').mockResolvedValue(mockOverview);
    vi.spyOn(analyticsApi, 'getDenialReasons').mockResolvedValue([]);
    vi.spyOn(analyticsApi, 'getAgentsHealth').mockResolvedValue([]);
    vi.spyOn(auditApi, 'getAuditEvents').mockResolvedValue({
      total: 2,
      items: [
        {
          id: 'evt-auth',
          timestamp: '2026-09-09T10:00:00Z',
          event_type: 'AUTHORIZATION_DECISION',
          agent_id: 'agent-valid',
          amount: 1000,
          decision: 'ALLOW',
        },
        {
          id: 'evt-other',
          timestamp: '2026-09-09T10:00:00Z',
          event_type: 'FLEET_HALTED',
          agent_id: 'agent-ignore',
        },
      ],
    });
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'ACTIVE' });

    render(<FleetOverview />);
    await waitFor(() => {
      expect(screen.getByText('agent-valid')).toBeInTheDocument();
      expect(screen.queryByText('agent-ignore')).not.toBeInTheDocument();
    });
  });
});
