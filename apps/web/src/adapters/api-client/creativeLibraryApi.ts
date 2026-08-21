import { isRecord, sanitizeCreativeAssetStore, type CreativeAssetStore } from '@studio/domain';
import { ApiClientError, apiFetchAllowingStatuses } from './transport';

export type CreativeLibraryRemoteState = Readonly<{
  revision: number;
  store: CreativeAssetStore;
}>;

const readPayload = async (response: Response, message: string): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new ApiClientError(message, 502, 'invalid-response');
  }
};

export const readCreativeLibrary = async (
  signal: AbortSignal,
): Promise<CreativeLibraryRemoteState | null> => {
  const response = await apiFetchAllowingStatuses(
    '/api/creative-library',
    { signal, headers: { Accept: 'application/json' } },
    [404],
  );
  if (response.status === 404) return null;
  const body = await readPayload(response, 'Creative library cloud response is invalid.');
  if (
    !isRecord(body) ||
    typeof body.revision !== 'number' ||
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    !('store' in body)
  ) {
    throw new ApiClientError(
      'Creative library cloud response is invalid.',
      502,
      'invalid-response',
    );
  }
  const parsed = sanitizeCreativeAssetStore(body.store);
  if (parsed.recovered || parsed.droppedRecords > 0) {
    throw new ApiClientError(
      'Creative library cloud response contains invalid records.',
      502,
      'invalid-response',
    );
  }
  return { revision: body.revision, store: parsed.store };
};

export const replaceCreativeLibrary = async (
  expectedRevision: number,
  store: CreativeAssetStore,
  signal: AbortSignal,
): Promise<number | 'conflict'> => {
  const response = await apiFetchAllowingStatuses(
    '/api/creative-library',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ expectedRevision, store }),
      signal,
    },
    [409],
  );
  if (response.status === 409) return 'conflict';
  const body = await readPayload(response, 'Creative library cloud write response is invalid.');
  if (
    !isRecord(body) ||
    typeof body.revision !== 'number' ||
    !Number.isInteger(body.revision) ||
    body.revision < 0
  ) {
    throw new ApiClientError(
      'Creative library cloud write response is invalid.',
      502,
      'invalid-response',
    );
  }
  return body.revision;
};
