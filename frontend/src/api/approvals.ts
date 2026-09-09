import { apiClient } from './client';
import type { ApprovalRequest } from '../types/api';

export async function getApprovals(
  status?: string,
  skip: number = 0,
  limit: number = 50
): Promise<ApprovalRequest[]> {
  let url = `/approvals?skip=${skip}&limit=${limit}`;
  if (status) {
    url += `&status=${encodeURIComponent(status)}`;
  }
  const res = await apiClient.get<ApprovalRequest[]>(url);
  return res.data;
}

export async function getApproval(id: string): Promise<ApprovalRequest> {
  const res = await apiClient.get<ApprovalRequest>(`/approvals/${encodeURIComponent(id)}`);
  return res.data;
}

export async function approveRequest(id: string): Promise<{ status: string; decision: string; authorization_id?: string }> {
  const res = await apiClient.post<{ status: string; decision: string; authorization_id?: string }>(
    `/approvals/${encodeURIComponent(id)}/approve`
  );
  return res.data;
}

export async function denyRequest(id: string): Promise<{ status: string; decision: string }> {
  const res = await apiClient.post<{ status: string; decision: string }>(
    `/approvals/${encodeURIComponent(id)}/deny`
  );
  return res.data;
}
