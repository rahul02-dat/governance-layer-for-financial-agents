import { apiClient } from './client';
import type { FleetStatusResponse, FleetMutationResponse } from '../types/api';

export async function getFleetStatus(): Promise<FleetStatusResponse> {
  const res = await apiClient.get<FleetStatusResponse>('/fleet/status');
  return res.data;
}

export async function emergencyStopFleet(): Promise<FleetMutationResponse> {
  const res = await apiClient.post<FleetMutationResponse>('/fleet/emergency-stop');
  return res.data;
}

export async function resumeFleet(): Promise<FleetMutationResponse> {
  const res = await apiClient.post<FleetMutationResponse>('/fleet/resume');
  return res.data;
}
