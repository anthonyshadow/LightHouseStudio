import {
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type { VoiceLibraryItem, WorkspaceVoicePage } from '../../application/types';
import { apiFetch, requestJson } from './apiClient';

const invalidResponse = (capability: string): Error =>
  new Error(`The ${capability} response was invalid. Refresh and try again.`);

const providerIntentHeaders = (): Record<string, string> => ({
  [VOICE_PROVIDER_INTENT_HEADER]: VOICE_PROVIDER_INTENT_VALUE,
});

export const listWorkspaceVoices = async (
  search: string,
  pageToken: string | null,
  signal: AbortSignal,
): Promise<WorkspaceVoicePage> => {
  const params = new URLSearchParams({ search: search.trim(), pageSize: '10' });
  if (pageToken) params.set('pageToken', pageToken);
  const payload = await requestJson(
    `/api/elevenlabs/voices?${params}`,
    { signal, headers: providerIntentHeaders() },
    workspaceVoicesResponseSchema,
    () => invalidResponse('saved voice library'),
  );
  return {
    ...payload,
    voices: payload.voices.map((voice) => ({ kind: 'workspace' as const, voice })),
  };
};

export const fetchVoicePreview = async (
  item: VoiceLibraryItem,
  signal: AbortSignal,
): Promise<Blob> => {
  const path = `/api/elevenlabs/voices/${encodeURIComponent(item.voice.voiceId)}/preview`;
  const response = await apiFetch(path, {
    signal,
    cache: 'no-store',
    headers: { ...providerIntentHeaders(), Accept: 'audio/*' },
  });
  const preview = await response.blob();
  if (preview.size === 0 || !preview.type.startsWith('audio/')) {
    throw invalidResponse('voice preview');
  }
  return preview;
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
    headers: {
      ...providerIntentHeaders(),
      'Content-Type': sidecar.type || 'application/octet-stream',
    },
    body: sidecar,
  });
  const converted = await response.blob();
  if (converted.size === 0 || !converted.type.startsWith('audio/')) {
    throw invalidResponse('voice conversion');
  }
  return converted;
};
