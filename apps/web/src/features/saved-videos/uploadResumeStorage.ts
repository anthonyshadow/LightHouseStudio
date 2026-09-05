import { createVersionedRecordStore } from '../../persistence/versionedRecord';

/** How long a remembered key is worth replaying. The server's staged upload expires before this. */
const RESUME_TTL_MS = 24 * 60 * 60 * 1000;
/** Enough for the handful of uploads one person has in flight; the oldest fall off first. */
const RESUME_LIMIT = 8;

export interface RememberedUploadKey {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  /** When the key was minted, so a key older than the staged upload it names is not offered. */
  readonly mintedAt: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Names the bytes an upload is for, so the same file picked again after a reload is recognised.
 *
 * Size, type and name are what a browser can state about a file without reading it — reading it to
 * hash would cost the whole file on every pick, for a question this answers well enough: two
 * different videos agreeing on all three, in one person's own library, would still both be that
 * person's own upload of the same thing.
 */
export const uploadFingerprint = (media: Blob, filename: string, scope: string): string =>
  [scope, filename, media.size, media.type, media instanceof File ? media.lastModified : 0].join(
    ':',
  );

/**
 * The idempotency keys this browser has minted for uploads that have not finished.
 *
 * The server already replays a staged upload: staging with a key it has seen returns the same
 * upload id, and the parts it holds are listed back, so the uploader continues from where it
 * stopped. Only the key was missing across a reload — it lived in a ref — which is what made a
 * reload restart a large upload from zero.
 */
export const uploadResumeStore = createVersionedRecordStore<readonly RememberedUploadKey[]>({
  storageBase: 'lightframe.video-upload-keys',
  version: 1,
  parse: (payload) => {
    if (!Array.isArray(payload)) return null;
    const entries = payload.filter(
      (entry): entry is RememberedUploadKey =>
        isRecord(entry) &&
        typeof entry['fingerprint'] === 'string' &&
        entry['fingerprint'].length > 0 &&
        typeof entry['idempotencyKey'] === 'string' &&
        uuidPattern.test(entry['idempotencyKey']) &&
        typeof entry['mintedAt'] === 'string' &&
        !Number.isNaN(Date.parse(entry['mintedAt'])),
    );
    return entries.length === payload.length ? entries : null;
  },
});

/** The key already minted for these bytes, or nothing when there is none worth replaying. */
export const rememberedUploadKey = (
  ownerUserId: string,
  fingerprint: string,
  now: number,
): string | null => {
  const entry = (uploadResumeStore.load(ownerUserId) ?? []).find(
    (candidate) => candidate.fingerprint === fingerprint,
  );
  if (entry === undefined) return null;
  return now - Date.parse(entry.mintedAt) < RESUME_TTL_MS ? entry.idempotencyKey : null;
};

/** Records the key an upload is using, so the next attempt at these bytes replays rather than repeats. */
export const rememberUploadKey = (ownerUserId: string, entry: RememberedUploadKey): void => {
  const now = Date.parse(entry.mintedAt);
  const kept = (uploadResumeStore.load(ownerUserId) ?? []).filter(
    (candidate) =>
      candidate.fingerprint !== entry.fingerprint &&
      now - Date.parse(candidate.mintedAt) < RESUME_TTL_MS,
  );
  uploadResumeStore.save(ownerUserId, [entry, ...kept].slice(0, RESUME_LIMIT));
};

/** Forgets a key once its upload is durably stored: the next attempt is a new upload. */
export const forgetUploadKey = (ownerUserId: string, fingerprint: string): void => {
  const kept = (uploadResumeStore.load(ownerUserId) ?? []).filter(
    (candidate) => candidate.fingerprint !== fingerprint,
  );
  if (kept.length === 0) {
    uploadResumeStore.remove(ownerUserId);
    return;
  }
  uploadResumeStore.save(ownerUserId, kept);
};
