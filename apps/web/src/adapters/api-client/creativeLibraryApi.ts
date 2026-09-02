import {
  creativeLibrarySnapshotSchema,
  type CreativeLibraryReplaceRequest,
} from '@studio/contracts';
import { sanitizeCreativeAssetStore, type CreativeAssetStore } from '@studio/domain';
import { ApiClientError, apiFetchAllowingStatuses } from './transport';

export type CreativeLibraryRemoteState = Readonly<{
  revision: number;
  store: CreativeAssetStore;
}>;

/**
 * Both creative-library responses carry the same snapshot envelope; the contract owns it, and the
 * domain sanitizer owns the store inside — the same split the server enforces, so a response the
 * server can produce is exactly a response this client accepts.
 */
const readSnapshot = async (
  response: Response,
  message: string,
): Promise<{ revision: number; store: unknown }> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiClientError(message, 502, 'invalid-response');
  }
  const parsed = creativeLibrarySnapshotSchema.safeParse(payload);
  if (!parsed.success) throw new ApiClientError(message, 502, 'invalid-response');
  return parsed.data;
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
  const snapshot = await readSnapshot(response, 'Creative library cloud response is invalid.');
  const parsed = sanitizeCreativeAssetStore(snapshot.store);
  if (parsed.recovered || parsed.droppedRecords > 0) {
    throw new ApiClientError(
      'Creative library cloud response contains invalid records.',
      502,
      'invalid-response',
    );
  }
  return { revision: snapshot.revision, store: parsed.store };
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
      body: JSON.stringify({ expectedRevision, store } satisfies CreativeLibraryReplaceRequest),
      signal,
    },
    [409],
  );
  if (response.status === 409) return 'conflict';
  const snapshot = await readSnapshot(
    response,
    'Creative library cloud write response is invalid.',
  );
  return snapshot.revision;
};
