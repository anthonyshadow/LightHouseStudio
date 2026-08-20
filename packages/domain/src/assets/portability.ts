import { isRecord, isTimestamp } from '../common/guards';
import { sanitizeCreativeAssetStore } from './sanitize';
import { CREATIVE_ASSET_SCHEMA_VERSION, type CreativeAssetStore } from './types';

/** Marks a file as a creative-library export rather than arbitrary JSON that happens to parse. */
export const CREATIVE_LIBRARY_EXPORT_KIND = 'lightframe.creative-library' as const;

/**
 * The envelope's own version, independent of the store's `schemaVersion`. An unknown value is
 * refused rather than migrated: this file is a backup, and guessing at it would corrupt the one
 * copy the operator kept.
 */
export const CREATIVE_LIBRARY_EXPORT_FILE_VERSION = 1 as const;

/**
 * The largest file an import will read, matching the `PUT /api/creative-library` body limit. A
 * larger file could only produce a store the cloud mirror would refuse, so accepting it would
 * trade one silent loss for another.
 */
export const CREATIVE_LIBRARY_EXPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface CreativeLibraryExportFile {
  readonly kind: typeof CREATIVE_LIBRARY_EXPORT_KIND;
  readonly fileVersion: typeof CREATIVE_LIBRARY_EXPORT_FILE_VERSION;
  readonly exportedAt: string;
  /**
   * Which reference images the exported records point at. The bytes are not here — this is a
   * manifest, so the file states what an import expects the account to already hold.
   */
  readonly referenceImageAssetIds: readonly string[];
  readonly store: CreativeAssetStore;
}

/** Why an import was refused. The message belongs to whichever surface asks. */
export type CreativeLibraryImportRefusal =
  | 'too-large'
  | 'unreadable'
  | 'not-a-library-file'
  | 'unsupported-file-version'
  | 'unsupported-store-version'
  | 'lossy';

export type CreativeLibraryImportResult =
  | { readonly ok: true; readonly file: CreativeLibraryExportFile }
  | { readonly ok: false; readonly refusal: CreativeLibraryImportRefusal };

const isAssetIdList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string' && id.trim().length > 0);

const refuse = (refusal: CreativeLibraryImportRefusal): CreativeLibraryImportResult => ({
  ok: false,
  refusal,
});

/** Every reference image the store depends on, deduplicated and ordered for a stable file. */
export const creativeLibraryReferenceImageAssetIds = (
  store: CreativeAssetStore,
): readonly string[] => {
  const ids = new Set<string>();
  const add = (value: string | null) => {
    if (value) ids.add(value);
  };
  store.savedPrompts.forEach((saved) => add(saved.referenceImageAssetId));
  store.recentPrompts.forEach((recent) => add(recent.referenceImageAssetId));
  store.savedCharacterPrompts.forEach((character) => {
    add(character.referenceImageAssetId);
    add(character.uploadedReferenceImageAssetId);
  });
  store.savedCharacterVariants.forEach((variant) => {
    add(variant.referenceImageAssetId);
    add(variant.creation.sourceReferenceImageAssetId);
    if (variant.creation.method === 'add-outfit') {
      add(variant.creation.garmentReferenceImageAssetId);
    }
  });
  return [...ids].sort();
};

/**
 * Serializable form of the current library. The store is sanitized first, so what is written is
 * exactly what an import would accept back.
 */
export const createCreativeLibraryExportFile = (
  store: CreativeAssetStore,
  exportedAt: string,
): CreativeLibraryExportFile => {
  const canonical = sanitizeCreativeAssetStore(store).store;
  return {
    kind: CREATIVE_LIBRARY_EXPORT_KIND,
    fileVersion: CREATIVE_LIBRARY_EXPORT_FILE_VERSION,
    exportedAt,
    referenceImageAssetIds: creativeLibraryReferenceImageAssetIds(canonical),
    store: canonical,
  };
};

/**
 * Validates a candidate export file. The store passes through `sanitizeCreativeAssetStore` under
 * the same rule `PUT /api/creative-library` applies: a snapshot that had to be repaired is not the
 * snapshot the operator exported, so it is refused rather than quietly rewritten.
 *
 * The caller bounds the file size before reading it — see `CREATIVE_LIBRARY_EXPORT_MAX_BYTES`.
 */
export const parseCreativeLibraryExportFile = (serialized: string): CreativeLibraryImportResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    return refuse('unreadable');
  }
  if (!isRecord(parsed) || parsed.kind !== CREATIVE_LIBRARY_EXPORT_KIND) {
    return refuse('not-a-library-file');
  }
  if (parsed.fileVersion !== CREATIVE_LIBRARY_EXPORT_FILE_VERSION) {
    return refuse('unsupported-file-version');
  }
  if (!isTimestamp(parsed.exportedAt) || !isAssetIdList(parsed.referenceImageAssetIds)) {
    return refuse('not-a-library-file');
  }
  if (!isRecord(parsed.store)) return refuse('not-a-library-file');
  // Checked before sanitization so an older library reports its real reason instead of "lossy".
  if (parsed.store.schemaVersion !== CREATIVE_ASSET_SCHEMA_VERSION) {
    return refuse('unsupported-store-version');
  }
  const sanitized = sanitizeCreativeAssetStore(parsed.store);
  if (sanitized.recovered || sanitized.droppedRecords > 0) return refuse('lossy');
  return {
    ok: true,
    file: {
      kind: CREATIVE_LIBRARY_EXPORT_KIND,
      fileVersion: CREATIVE_LIBRARY_EXPORT_FILE_VERSION,
      exportedAt: parsed.exportedAt,
      referenceImageAssetIds: [...parsed.referenceImageAssetIds],
      store: sanitized.store,
    },
  };
};
