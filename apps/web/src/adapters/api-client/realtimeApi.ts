import { realtimeTokenResponseSchema } from '@studio/contracts';
import type { ModelMode } from '../../application/types';
import { ApiClientError, invalidApiResponse, requestJson } from './transport';

export const requestRealtimeToken = async (
  model: ModelMode,
  signal: AbortSignal,
): Promise<{
  apiKey: string;
  expiresAt: string;
  maxSessionDurationSeconds: number;
}> => {
  const payload = await requestJson(
    '/api/realtime-token',
    {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model }),
    },
    realtimeTokenResponseSchema,
    invalidApiResponse('The realtime credential response was incomplete.', 'bad-token'),
  );
  if (!payload.constraints || payload.constraints.model !== model) {
    throw new ApiClientError('The realtime credential response was incomplete.', 502, 'bad-token');
  }
  return {
    apiKey: payload.apiKey,
    expiresAt: payload.expiresAt,
    maxSessionDurationSeconds: payload.constraints.maxSessionDurationSeconds,
  };
};
