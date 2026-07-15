import {
  importSharedVoiceResponseSchema,
  sharedVoicesResponseSchema,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type { VoicePage, VoiceSummary } from '../../application/types';
import { apiFetch } from './apiClient';

const invalidResponse = (capability: string): Error =>
  new Error(`The ${capability} response was invalid. Refresh and try again.`);

export const listWorkspaceVoices = async (
  search: string,
  pageToken: string | null,
  signal: AbortSignal,
): Promise<VoicePage> => {
  const params = new URLSearchParams({ search: search.trim(), pageSize: '10' });
  if (pageToken) params.set('pageToken', pageToken);
  const response = await apiFetch(`/api/elevenlabs/voices?${params}`, { signal });
  const parsed = workspaceVoicesResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw invalidResponse('workspace voice');
  return parsed.data;
};

export const listPublicVoices = async (
  search: string,
  page: number,
  signal: AbortSignal,
): Promise<VoicePage> => {
  const params = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: '10' });
  const response = await apiFetch(`/api/elevenlabs/shared-voices?${params}`, { signal });
  const parsed = sharedVoicesResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw invalidResponse('public voice');
  return parsed.data;
};

export const importPublicVoice = async (
  voice: VoiceSummary,
  signal: AbortSignal,
): Promise<string> => {
  if (!voice.publicOwnerId) throw new Error('Public owner information is unavailable.');
  const response = await apiFetch('/api/elevenlabs/shared-voices/import', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: voice.name,
      publicOwnerId: voice.publicOwnerId,
      voiceId: voice.voiceId,
    }),
  });
  const parsed = importSharedVoiceResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw invalidResponse('voice import');
  return parsed.data.voiceId;
};

export const convertRecordingVoice = async (
  voiceId: string,
  sidecar: Blob,
  signal: AbortSignal,
): Promise<Blob> => {
  const params = new URLSearchParams({ voiceId });
  const response = await apiFetch(`/api/elevenlabs/voice-changer/recording?${params}`, {
    method: 'POST',
    signal,
    cache: 'no-store',
    headers: { 'Content-Type': sidecar.type || 'application/octet-stream' },
    body: sidecar,
  });
  const converted = await response.blob();
  if (converted.size === 0 || !converted.type.startsWith('audio/')) {
    throw invalidResponse('voice conversion');
  }
  return converted;
};
