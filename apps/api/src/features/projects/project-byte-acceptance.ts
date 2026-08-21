import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, StoredAssetManifest } from '../../storage/asset-byte-store.js';

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
  const existing = await options.bytes.open(options.ownerUserId, options.operationKey);
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
      assetId: options.operationKey,
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
