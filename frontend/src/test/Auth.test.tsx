import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  apiClient,
  setAuthToken,
  getAuthToken,
  onAuthFailure,
  initializeAuth,
  ApiError,
} from '../api/client';

describe('Centralized Authentication & Client Layer', () => {
  beforeEach(() => {
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it('manages token in memory without writing privileged credentials to localStorage', () => {
    localStorage.clear();
    setAuthToken('test-bearer-token');

    expect(getAuthToken()).toBe('test-bearer-token');
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('handles 401 Unauthorized by resetting token and triggering callback', async () => {
    setAuthToken('expired-token');
    const authFailureSpy = vi.fn();
    onAuthFailure(authFailureSpy);

    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async () => {
      const error: any = new Error('Request failed with status code 401');
      error.response = { status: 401, data: { detail: 'Token has expired' } };
      throw error;
    };

    try {
      await expect(apiClient.get('/fleet/status')).rejects.toThrow(ApiError);
      expect(getAuthToken()).toBeNull();
      expect(authFailureSpy).toHaveBeenCalled();
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('normalizes 403 Forbidden without leaking raw backend exceptions', async () => {
    const originalAdapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async () => {
      const error: any = new Error('Request failed with status code 403');
      error.response = { status: 403, data: { detail: 'Operation forbidden. Allowed roles: ADMIN' } };
      throw error;
    };

    try {
      await apiClient.get('/fleet/status');
      expect.unreachable('Should have thrown an error');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.message).toBe('Operation forbidden. Allowed roles: ADMIN');
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('initializes auth via dev token in development environment', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { token: 'mock-dev-token' } });

    await initializeAuth();
    expect(getAuthToken()).toBe('mock-dev-token');
  });
});
