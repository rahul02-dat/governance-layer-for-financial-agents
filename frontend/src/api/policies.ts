import { apiClient } from './client';
import type { Policy } from '../types/api';

export async function getPolicies(skip: number = 0, limit: number = 100): Promise<Policy[]> {
  const res = await apiClient.get<Policy[]>(`/policies?skip=${skip}&limit=${limit}`);
  return res.data;
}

export async function getPolicy(id: string): Promise<Policy> {
  const res = await apiClient.get<Policy>(`/policies/${encodeURIComponent(id)}`);
  return res.data;
}

export async function createPolicy(data: { name: string; rego_content: string; enabled?: boolean }): Promise<Policy> {
  const res = await apiClient.post<Policy>('/policies', data);
  return res.data;
}
