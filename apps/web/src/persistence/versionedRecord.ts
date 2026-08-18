import { environmentScopedPersistenceName } from './environmentScope';

/**
 * Read and write one owner-scoped, versioned record in browser storage.
 *
 * Every such record shares the same contract — a key namespaced by environment and user, a version
 * stamp that lets an incompatible payload be ignored rather than hydrated, and failure that degrades
 * to "no stored value" instead of throwing. Writing that contract per feature is how the copies
 * drift: the existing ones already disagree about whether a corrupt entry is removed.
 *
 * Callers supply only the part that is theirs — a parser that turns an unknown payload into a value
 * they trust, or `null` if it cannot.
 */
export interface VersionedRecordStore<T> {
  readonly storageKey: (ownerUserId: string) => string;
  /** The stored value, or `null` when absent, unreadable, or written by an incompatible version. */
  readonly load: (ownerUserId: string) => T | null;
  /** False when storage refused the write — a full quota or a blocked origin, never a throw. */
  readonly save: (ownerUserId: string, value: T) => boolean;
}

interface VersionedRecordOptions<T> {
  /** Base name, namespaced per environment and user by `environmentScopedPersistenceName`. */
  readonly storageBase: string;
  readonly version: number;
  /** Validates an untrusted payload. Return `null` to ignore it. */
  readonly parse: (payload: unknown) => T | null;
}

export const createVersionedRecordStore = <T>({
  storageBase,
  version,
  parse,
}: VersionedRecordOptions<T>): VersionedRecordStore<T> => {
  const storageKey = (ownerUserId: string): string =>
    environmentScopedPersistenceName(storageBase, ownerUserId);

  return {
    storageKey,
    load: (ownerUserId) => {
      try {
        const raw = window.localStorage.getItem(storageKey(ownerUserId));
        if (raw === null) return null;
        const envelope = JSON.parse(raw) as unknown;
        if (typeof envelope !== 'object' || envelope === null) return null;
        const { version: storedVersion, payload } = envelope as {
          version?: unknown;
          payload?: unknown;
        };
        return storedVersion === version ? parse(payload) : null;
      } catch {
        return null;
      }
    },
    save: (ownerUserId, value) => {
      try {
        window.localStorage.setItem(
          storageKey(ownerUserId),
          JSON.stringify({ version, payload: value }),
        );
        return true;
      } catch {
        return false;
      }
    },
  };
};
