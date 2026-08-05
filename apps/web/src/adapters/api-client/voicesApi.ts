import {
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  sharedVoicesResponseSchema,
  voiceLibraryMutationResponseSchema,
  workspaceVoicesResponseSchema,
  type SharedVoicesQuery,
  type VoiceLibraryMutationResponse,
} from '@studio/contracts';
import type {
  SharedVoiceItem,
  SharedVoicePage,
  VoiceFilterCriteria,
  VoiceLibraryItem,
  WorkspaceVoicePage,
} from '../../application/types';
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
  criteria: VoiceFilterCriteria,
  pageToken: string | null,
  signal: AbortSignal,
  refresh = false,
): Promise<WorkspaceVoicePage> => {
  const params = voiceParams(criteria);
  if (pageToken) params.set('pageToken', pageToken);
  if (refresh) params.set('refresh', 'true');
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

const voiceParams = (criteria: VoiceFilterCriteria): URLSearchParams => {
  const params = new URLSearchParams({ pageSize: '20' });
  for (const [key, value] of Object.entries(criteria)) {
    const normalized = value.trim();
    if (normalized !== '') params.set(key, normalized);
  }
  return params;
};

export const listSharedVoices = async (
  criteria: VoiceFilterCriteria,
  page: number,
  sort: SharedVoicesQuery['sort'],
  signal: AbortSignal,
  refresh = false,
): Promise<SharedVoicePage> => {
  const params = voiceParams(criteria);
  params.set('page', String(page));
  params.set('sort', sort);
  if (refresh) params.set('refresh', 'true');
  const payload = await requestJson(
    `/api/elevenlabs/shared-voices?${params}`,
    { signal, headers: providerIntentHeaders() },
    sharedVoicesResponseSchema,
    () => invalidResponse('voice catalog'),
  );
  return {
    ...payload,
    voices: payload.voices.map((voice) => ({ kind: 'shared' as const, voice })),
  };
};

export const fetchVoicePreview = async (
  item: VoiceLibraryItem,
  signal: AbortSignal,
): Promise<Blob> => {
  const path =
    item.kind === 'workspace'
      ? `/api/elevenlabs/voices/${encodeURIComponent(item.voice.voiceId)}/preview`
      : `/api/elevenlabs/shared-voices/${encodeURIComponent(item.voice.publicOwnerId)}/${encodeURIComponent(item.voice.voiceId)}/preview`;
  const response = await apiFetch(path, {
    signal,
    cache: 'no-store',
    headers: { ...providerIntentHeaders(), Accept: 'audio/*' },
  });
  return readBoundedAudioBlob(response, VOICE_PREVIEW_MAX_BYTES, 'voice preview', signal);
};

export const saveSharedVoice = async (
  item: SharedVoiceItem,
  signal: AbortSignal,
): Promise<VoiceLibraryMutationResponse> =>
  requestJson(
    `/api/elevenlabs/shared-voices/${encodeURIComponent(item.voice.publicOwnerId)}/${encodeURIComponent(item.voice.voiceId)}/save`,
    {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { ...providerIntentHeaders(), Accept: 'application/json' },
    },
    voiceLibraryMutationResponseSchema,
    () => invalidResponse('save voice'),
  );

export const removeWorkspaceVoice = async (
  voiceId: string,
  signal: AbortSignal,
): Promise<VoiceLibraryMutationResponse> =>
  requestJson(
    `/api/elevenlabs/voices/${encodeURIComponent(voiceId)}`,
    {
      method: 'DELETE',
      signal,
      cache: 'no-store',
      headers: { ...providerIntentHeaders(), Accept: 'application/json' },
    },
    voiceLibraryMutationResponseSchema,
    () => invalidResponse('remove voice'),
  );

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
