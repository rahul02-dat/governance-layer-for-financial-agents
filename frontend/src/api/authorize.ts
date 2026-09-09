import { apiClient } from './client';
import type { AuthorizeRequest, AuthorizeResponse } from '../types/api';

export async function authorizeAction(data: AuthorizeRequest): Promise<AuthorizeResponse> {
  const res = await apiClient.post<AuthorizeResponse>('/authorize', data);
  return res.data;
}
