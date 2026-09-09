import { apiClient } from './client';
import type { AnalyticsOverview, DenialReason, AgentHealth } from '../types/api';

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const res = await apiClient.get<AnalyticsOverview>('/analytics/overview');
  return res.data;
}

export async function getDenialReasons(): Promise<DenialReason[]> {
  const res = await apiClient.get<DenialReason[]>('/analytics/denials');
  return res.data;
}

export async function getAgentsHealth(): Promise<AgentHealth[]> {
  const res = await apiClient.get<AgentHealth[]>('/analytics/agents');
  return res.data;
}
