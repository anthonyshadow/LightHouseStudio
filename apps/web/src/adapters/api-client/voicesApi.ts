import {
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type { VoiceLibraryItem, WorkspaceVoicePage } from '../../application/types';
import { apiFetch, requestJson } from './apiClient';
import { readBoundedBlob } from './readBoundedBlob';

const invalidResponse = (capability: string): Error =>
  new Error(`The ${capability} response was invalid. Refresh and try again.`);

const providerIntentHeaders = (): Record<string, string> => ({
  [VOICE_PROVIDER_INTENT_HEADER]: VOICE_PROVIDER_INTENT_VALUE,
});

const readBoundedAudioBlob = async (
  response: Response,
  maximumBytes: number,
  capability: string,
  signal: AbortSignal,
): Promise<Blob> => {
  return readBoundedBlob(response, {
    maximumBytes,
    signal,
    acceptsContentType: (contentType) => contentType.startsWith('audio/'),
    createError: () => invalidResponse(capability),
    abortMessage: 'Voice audio request was cancelled.',
  });
};

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
  return readBoundedAudioBlob(response, VOICE_PREVIEW_MAX_BYTES, 'voice preview', signal);
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
  return readBoundedAudioBlob(
    response,
    VOICE_CONVERSION_OUTPUT_MAX_BYTES,
    'voice conversion',
    signal,
  );
};
