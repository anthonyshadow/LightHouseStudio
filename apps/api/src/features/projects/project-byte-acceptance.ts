import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, StoredAssetManifest } from '../../storage/asset-byte-store.js';
import { deterministicUuid } from './deterministic-uuid.js';

/**
 * The stored id for an uploaded Project asset.
 *
 * Deriving it from the owner as well as the operation key is what stops one account's upload from
 * naming another account's asset. The id becomes the byte store's object key, and the operation
 * key is chosen by the client through `Idempotency-Key` — so using the key alone let a request
 * address, and overwrite, bytes it does not own. Replay still resolves to the same id because the
 * derivation stays a pure function of the operation's identity.
 */
export const projectUploadAssetId = (ownerUserId: string, operationKey: string): string =>
  deterministicUuid(`lightframe:project-upload:v1:${ownerUserId}:${operationKey}`);

/**
 * The one rule for accepting an uploaded media file into the byte store under an idempotency key.
 *
 * A replayed key must describe the exact same bytes — checksum, size, type and filename — or the
 * replay is refused with a conflict; only a first attempt stores. `commit` then records the
 * durable acceptance, and any commit failure or refusal releases bytes this attempt stored (never
 * bytes a previous attempt already owned) through the caller's retention-aware discard.
 */
export const acceptIdempotentUpload = async <T extends { readonly ok: boolean }>(options: {
  readonly bytes: AssetByteStore;
  readonly ownerUserId: string;
  readonly operationKey: string;
  readonly sourcePath: string;
  readonly checksumSha256: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly now: string;
  readonly conflictMessage: string;
  readonly commit: (manifest: StoredAssetManifest) => Promise<T>;
  readonly discard: (assetId: string) => Promise<void>;
}): Promise<T> => {
  const assetId = projectUploadAssetId(options.ownerUserId, options.operationKey);
  // TEMPORARY, and safe to delete once no deployment holds a Project asset stored under a raw
  // operation key — the same shape of wind-down `ShadowAssetByteStore` documents for itself.
  //
  // The operation key was the asset id before ids were owner-derived. Without this read, a key
  // minted before that change and retried after it stores the bytes a second time under the new
  // id, and because a replay reports `ok` the discard below never runs, so the duplicate is
  // orphaned. Both reads are owner-scoped, so the fallback can only ever find this owner's own
  // earlier upload; it costs one extra indexed lookup on a first attempt.
  const existing =
    (await options.bytes.open(options.ownerUserId, assetId)) ??
    (await options.bytes.open(options.ownerUserId, options.operationKey));
  let created = false;
  let manifest = existing?.manifest;
  if (manifest !== undefined) {
    if (
      manifest.checksumSha256 !== options.checksumSha256 ||
      manifest.sizeBytes !== options.sizeBytes ||
      manifest.mimeType !== options.mimeType ||
      manifest.filename !== options.filename
    ) {
      throw new AppError(409, 'conflict', options.conflictMessage);
    }
  } else {
    manifest = await options.bytes.storeFile({
      assetId,
      ownerUserId: options.ownerUserId,
      sourcePath: options.sourcePath,
      checksumSha256: options.checksumSha256,
      mimeType: options.mimeType,
      filename: options.filename,
      createdAt: options.now,
    });
    created = true;
  }
  try {
    const result = await options.commit(manifest);
    if (!result.ok && created) {
      await options.discard(manifest.assetId);
    }
    return result;
  } catch (error) {
    if (created) await options.discard(manifest.assetId);
    throw error;
  }
};
