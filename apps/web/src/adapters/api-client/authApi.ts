import {
  authenticatedSessionResponseSchema,
  demoAuthConfigResponseSchema,
  type AuthenticatedSessionResponse,
  type DemoAuthConfigResponse,
  type LoginRequest,
} from '@studio/contracts';
import { ApiClientError, requestJson } from './apiClient';

const invalidResponse = (label: string) => () =>
  new ApiClientError(`The ${label} response was invalid.`, 502, 'invalid-response');

export const fetchDemoAuthConfig = (signal?: AbortSignal): Promise<DemoAuthConfigResponse> =>
  requestJson(
    '/api/auth/demo-config',
    {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    demoAuthConfigResponseSchema,
    invalidResponse('demo login configuration'),
  );

export const login = (
  input: LoginRequest,
  signal?: AbortSignal,
): Promise<AuthenticatedSessionResponse> =>
  requestJson(
    '/api/auth/login',
    {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    authenticatedSessionResponseSchema,
    invalidResponse('login'),
  );

export const fetchCurrentSession = (signal?: AbortSignal): Promise<AuthenticatedSessionResponse> =>
  requestJson(
    '/api/auth/me',
    {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    authenticatedSessionResponseSchema,
    invalidResponse('session'),
  );

export const logout = async (signal?: AbortSignal): Promise<void> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok && response.status !== 401) {
    throw new ApiClientError('Logout could not be confirmed.', response.status);
  }
};
