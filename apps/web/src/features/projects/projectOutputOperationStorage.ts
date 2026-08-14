import { saveProjectOutputRequestSchema, type SaveProjectOutputRequest } from '@studio/contracts';
import { environmentScopedPersistenceName } from '../../persistence/environmentScope';

const STORAGE_BASE = 'lightframe.project-output-operation.v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface PendingProjectOutputOperation {
  readonly schemaVersion: 1;
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationId: string;
  readonly request: SaveProjectOutputRequest;
  readonly createdAt: string;
}

export const projectOutputOperationStorageKey = (ownerUserId: string, projectId: string): string =>
  environmentScopedPersistenceName(`${STORAGE_BASE}.${projectId}`, ownerUserId);

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(value).sort().join('\n') === [...expected].sort().join('\n');

const parsePending = (
  value: unknown,
  ownerUserId: string,
  projectId: string,
): PendingProjectOutputOperation | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !exactKeys(record, [
      'schemaVersion',
      'ownerUserId',
      'projectId',
      'operationId',
      'request',
      'createdAt',
    ]) ||
    record.schemaVersion !== 1 ||
    record.ownerUserId !== ownerUserId ||
    record.projectId !== projectId ||
    typeof record.operationId !== 'string' ||
    !uuidPattern.test(record.operationId) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(new Date(record.createdAt).valueOf())
  ) {
    return null;
  }
  const request = saveProjectOutputRequestSchema.safeParse(record.request);
  if (!request.success) return null;
  return {
    schemaVersion: 1,
    ownerUserId,
    projectId,
    operationId: record.operationId,
    request: request.data,
    createdAt: new Date(record.createdAt).toISOString(),
  };
};

export const loadPendingProjectOutput = (
  ownerUserId: string,
  projectId: string,
): PendingProjectOutputOperation | null => {
  const key = projectOutputOperationStorageKey(ownerUserId, projectId);
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const pending = parsePending(JSON.parse(raw) as unknown, ownerUserId, projectId);
    if (pending === null) window.localStorage.removeItem(key);
    return pending;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage remains untrusted and optional; the caller will not start without a receipt.
    }
    return null;
  }
};

export const storePendingProjectOutput = (pending: PendingProjectOutputOperation): boolean => {
  try {
    window.localStorage.setItem(
      projectOutputOperationStorageKey(pending.ownerUserId, pending.projectId),
      JSON.stringify(pending),
    );
    return true;
  } catch {
    return false;
  }
};

export const clearPendingProjectOutput = (ownerUserId: string, projectId: string): void => {
  try {
    window.localStorage.removeItem(projectOutputOperationStorageKey(ownerUserId, projectId));
  } catch {
    // A failed cleanup cannot invalidate the durable server receipt; a later replay is exact.
  }
};
