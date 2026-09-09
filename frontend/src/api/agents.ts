import { apiClient } from './client';
import type { Agent, QuarantineResult } from '../types/api';

export async function getAgents(skip: number = 0, limit: number = 100): Promise<Agent[]> {
  const res = await apiClient.get<Agent[]>(`/agents?skip=${skip}&limit=${limit}`);
  return res.data;
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await apiClient.get<Agent>(`/agents/${encodeURIComponent(id)}`);
  return res.data;
}

export async function quarantineAgent(id: string): Promise<QuarantineResult> {
  const res = await apiClient.post<QuarantineResult>(`/agents/${encodeURIComponent(id)}/quarantine`);
  return res.data;
}

export async function restoreAgent(id: string): Promise<Agent> {
  const res = await apiClient.post<Agent>(`/agents/${encodeURIComponent(id)}/restore`);
  return res.data;
}
