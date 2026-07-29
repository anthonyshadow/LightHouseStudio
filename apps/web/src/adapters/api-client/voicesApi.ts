import {
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
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

const declaredContentLength = (response: Response): number | null | undefined => {
  const header = response.headers.get('content-length');
  if (header === null) return undefined;
  if (!/^\d+$/u.test(header)) return null;
  const value = Number(header);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};

const readBoundedAudioBlob = async (
  response: Response,
  maximumBytes: number,
  capability: string,
  signal: AbortSignal,
): Promise<Blob> => {
  const contentType =
    response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const contentLength = declaredContentLength(response);
  if (
    !contentType.startsWith('audio/') ||
    contentLength === null ||
    (contentLength !== undefined && contentLength > maximumBytes) ||
    response.body === null
  ) {
    void response.body?.cancel().catch(() => undefined);
    throw invalidResponse(capability);
  }

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let byteLength = 0;
  let completed = false;
  const abortReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', abortReader, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) {
        completed = true;
        break;
      }
      if (chunk.value.byteLength === 0) continue;
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) throw invalidResponse(capability);
      const copy = new Uint8Array(chunk.value.byteLength);
      copy.set(chunk.value);
      chunks.push(copy.buffer);
    }
  } catch (error) {
    if (signal.aborted) throw new DOMException('Voice audio request was cancelled.', 'AbortError');
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw invalidResponse(capability);
  } finally {
    signal.removeEventListener('abort', abortReader);
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (byteLength === 0 || (contentLength !== undefined && contentLength !== byteLength)) {
    throw invalidResponse(capability);
  }
  return new Blob(chunks, { type: contentType });
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
