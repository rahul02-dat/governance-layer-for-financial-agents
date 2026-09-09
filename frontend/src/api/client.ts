import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// Base URL: in development or docker, default to proxy /api or VITE_API_BASE_URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * In-memory token storage to avoid storing privileged credentials in localStorage
 */
let sessionToken: string | null = null;
let onAuthFailureCallback: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  sessionToken = token;
}

export function getAuthToken(): string | null {
  return sessionToken;
}

export function onAuthFailure(callback: () => void): void {
  onAuthFailureCallback = callback;
}

/**
 * Normalized API error class representing backend errors without leaking stack traces.
 */
export class ApiError extends Error {
  public status?: number;
  public detail?: string;

  constructor(message: string, status?: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Bearer token if available
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (sessionToken) {
      config.headers.Authorization = `Bearer ${sessionToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401, 403 and normalize errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    const status = error.response?.status;
    const rawDetail = error.response?.data?.detail;

    if (status === 401) {
      sessionToken = null;
      if (onAuthFailureCallback) {
        onAuthFailureCallback();
      }
      return Promise.reject(new ApiError('Unauthorized. Please authenticate.', 401, rawDetail || 'Unauthorized'));
    }

    if (status === 403) {
      const message = rawDetail || 'You are not authorized to perform this operation.';
      return Promise.reject(new ApiError(message, 403, rawDetail));
    }

    // Sanitize network errors and unexpected failures
    const message = rawDetail || error.message || 'An unexpected error occurred while communicating with the server.';
    return Promise.reject(new ApiError(message, status, rawDetail));
  }
);

/**
 * Initialize development token if in dev mode and no token is present.
 */
export async function initializeAuth(): Promise<void> {
  if (sessionToken) return;

  // Only allow /dev/token in development mode
  if (import.meta.env.DEV) {
    try {
      const res = await axios.get<{ token?: string }>(`${API_BASE_URL}/dev/token`);
      if (res.data?.token) {
        sessionToken = res.data.token;
      }
    } catch {
      // In staging/production or if /dev/token is disabled, silently require real auth
    }
  }
}
