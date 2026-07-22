import {
  importSharedVoiceResponseSchema,
  sharedVoicesResponseSchema,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type {
  PublicVoiceItem,
  PublicVoicePage,
  VoiceLibraryItem,
  WorkspaceVoicePage,
} from '../../application/types';
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
    () => invalidResponse('workspace voice'),
  );
  return {
    ...payload,
    voices: payload.voices.map((voice) => ({ kind: 'workspace' as const, voice })),
  };
};

export const listPublicVoices = async (
  search: string,
  page: number,
  signal: AbortSignal,
): Promise<PublicVoicePage> => {
  const params = new URLSearchParams({ search: search.trim(), page: String(page), pageSize: '10' });
  const payload = await requestJson(
    `/api/elevenlabs/shared-voices?${params}`,
    { signal, headers: providerIntentHeaders() },
    sharedVoicesResponseSchema,
    () => invalidResponse('public voice'),
  );
  return {
    hasMore: payload.hasMore,
    nextPageToken: payload.nextPageToken,
    total: payload.total,
    voices: payload.voices.map((voice) => ({ kind: 'public' as const, voice })),
  };
};

export const importPublicVoice = async (
  item: PublicVoiceItem,
  signal: AbortSignal,
): Promise<string> => {
  const { voice } = item;
  const payload = await requestJson(
    '/api/elevenlabs/shared-voices/import',
    {
      method: 'POST',
      signal,
      headers: {
        ...providerIntentHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: voice.name,
        publicOwnerId: voice.publicOwnerId,
        voiceId: voice.voiceId,
      }),
    },
    importSharedVoiceResponseSchema,
    () => invalidResponse('voice import'),
  );
  return payload.voiceId;
};

export const fetchVoicePreview = async (
  item: VoiceLibraryItem,
  signal: AbortSignal,
): Promise<Blob> => {
  const path =
    item.kind === 'public'
      ? `/api/elevenlabs/shared-voices/${encodeURIComponent(item.voice.publicOwnerId)}/${encodeURIComponent(item.voice.voiceId)}/preview`
      : `/api/elevenlabs/voices/${encodeURIComponent(item.voice.voiceId)}/preview`;
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
