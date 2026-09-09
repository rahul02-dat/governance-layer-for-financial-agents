import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Policies from '../Policies';
import * as policiesApi from '../api/policies';
import type { Policy } from '../types/api';

const mockPolicies: Policy[] = [
  {
    id: 'pol-001',
    name: 'Single Transaction Cap Policy',
    enabled: true,
    version_number: 1,
    content_hash: '5d41402abc4b2a76b9719d911017c592',
    rego_content: 'package agentguard.authz\n\ndefault allow = false\nallow { input.amount <= 50000 }',
    created_at: '2026-09-09T07:00:00Z',
  },
];

describe('Policies Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders policies with active version and content hash', async () => {
    vi.spyOn(policiesApi, 'getPolicies').mockResolvedValue(mockPolicies);

    render(<Policies />);

    expect(await screen.findByText('Single Transaction Cap Policy')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/5d41402abc4b2a76/)).toBeInTheDocument();
  });

  it('opens read-only Rego viewer modal on button click', async () => {
    vi.spyOn(policiesApi, 'getPolicies').mockResolvedValue(mockPolicies);

    render(<Policies />);

    const viewBtn = await screen.findByRole('button', { name: /inspect policy/i });
    fireEvent.click(viewBtn);

    expect(screen.getByText('Authoritative Rego Definition (Read-Only)')).toBeInTheDocument();
    expect(screen.getByText(/package agentguard.authz/)).toBeInTheDocument();
  });

  it('displays empty state when no policies are configured', async () => {
    vi.spyOn(policiesApi, 'getPolicies').mockResolvedValue([]);

    render(<Policies />);

    expect(await screen.findByText('No policies found')).toBeInTheDocument();
  });
});
