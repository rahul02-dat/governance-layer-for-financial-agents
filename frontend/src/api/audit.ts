import { apiClient } from './client';
import type { PaginatedAuditEvents, AuditVerifyResult } from '../types/api';

export interface AuditFilterParams {
  skip?: number;
  limit?: number;
  agent_id?: string;
  decision?: string;
  action?: string;
  reason?: string;
  event_type?: string;
  request_id?: string;
}

export async function getAuditEvents(params: AuditFilterParams = {}): Promise<PaginatedAuditEvents> {
  const query = new URLSearchParams();
  if (params.skip !== undefined) query.set('skip', params.skip.toString());
  if (params.limit !== undefined) query.set('limit', params.limit.toString());
  if (params.agent_id) query.set('agent_id', params.agent_id);
  if (params.decision) query.set('decision', params.decision);
  if (params.action) query.set('action', params.action);
  if (params.reason) query.set('reason', params.reason);
  if (params.event_type) query.set('event_type', params.event_type);
  if (params.request_id) query.set('request_id', params.request_id);

  const queryString = query.toString();
  const url = queryString ? `/audit-events?${queryString}` : '/audit-events';
  const res = await apiClient.get<PaginatedAuditEvents>(url);
  return res.data;
}

export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const res = await apiClient.get<AuditVerifyResult>('/audit-events/verify');
  return res.data;
}
