import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Emergency from '../Emergency';
import * as fleetApi from '../api/fleet';

describe('Emergency Controls Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active state and prompts confirmation before halting fleet', async () => {
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'ACTIVE' });
    const haltSpy = vi.spyOn(fleetApi, 'emergencyStopFleet').mockResolvedValue({
      status: 'success',
      fleet_state: 'HALTED',
    });

    render(<Emergency />);

    expect(await screen.findByText('ACTIVE')).toBeInTheDocument();

    const haltButton = screen.getByRole('button', { name: 'Halt Fleet Immediately' });
    fireEvent.click(haltButton);

    // Confirmation dialog check
    expect(screen.getByText('Confirm Fleet Emergency Stop')).toBeInTheDocument();
    expect(
      screen.getByText(/This will prevent new financial authorizations across the fleet/i)
    ).toBeInTheDocument();

    const confirmHalt = screen.getByRole('button', { name: 'Halt Fleet' });
    fireEvent.click(confirmHalt);

    await waitFor(() => {
      expect(haltSpy).toHaveBeenCalled();
    });
  });

  it('renders halted state and prompts confirmation before resuming fleet', async () => {
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'HALTED' });
    const resumeSpy = vi.spyOn(fleetApi, 'resumeFleet').mockResolvedValue({
      status: 'success',
      fleet_state: 'ACTIVE',
    });

    render(<Emergency />);

    expect(await screen.findByText('HALTED')).toBeInTheDocument();

    const resumeButton = screen.getByRole('button', { name: 'Resume Fleet Operations' });
    fireEvent.click(resumeButton);

    expect(screen.getByText('Confirm Resume Fleet Operations')).toBeInTheDocument();

    const confirmResume = screen.getByRole('button', { name: 'Resume Fleet' });
    fireEvent.click(confirmResume);

    await waitFor(() => {
      expect(resumeSpy).toHaveBeenCalled();
    });
  });

  it('handles backend emergency stop failures gracefully', async () => {
    vi.spyOn(fleetApi, 'getFleetStatus').mockResolvedValue({ fleet_state: 'ACTIVE' });
    vi.spyOn(fleetApi, 'emergencyStopFleet').mockRejectedValue(
      new Error('Redis connection timed out')
    );

    render(<Emergency />);

    const haltButton = await screen.findByRole('button', { name: 'Halt Fleet Immediately' });
    fireEvent.click(haltButton);

    const confirmHalt = screen.getByRole('button', { name: 'Halt Fleet' });
    fireEvent.click(confirmHalt);

    expect(await screen.findByText('Failed to halt fleet')).toBeInTheDocument();
  });
});
