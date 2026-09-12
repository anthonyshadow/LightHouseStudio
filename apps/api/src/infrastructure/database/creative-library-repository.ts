import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  createEmptyCreativeAssetStore,
  sanitizeCreativeAssetStore,
  type CreativeAssetStore,
} from '@studio/domain';
import { and, asc, eq } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  CreativeLibraryRepository,
  CreativeLibrarySnapshot,
} from '../../features/creative-libraries/creative-library-repository.js';
import type { LightframeDatabase } from './client.js';
import { collectReferenceImageAssetIds } from './reference-image-asset-store.js';
import { creativeAssets, creativeLibraries } from './schema.js';

type AssetKind = typeof creativeAssets.$inferInsert.kind;

const assetRows = (
  ownerUserId: string,
  revision: number,
  store: CreativeAssetStore,
  updatedAt: string,
): (typeof creativeAssets.$inferInsert)[] => {
  const row = (kind: AssetKind, item: { readonly id: string }, timestamp: string) => ({
    id: item.id,
    ownerUserId,
    kind,
    revision,
    schemaVersion: store.schemaVersion,
    payload: item,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt,
  });
  return [
    ...store.savedPrompts.map((item) =>
      row(item.vtonInputKind === null ? 'saved-prompt' : 'outfit', item, item.createdAt),
    ),
    ...store.recentPrompts.map((item) => row('recent-prompt', item, item.usedAt)),
    ...store.savedCharacterPrompts.map((item) => row('character', item, item.createdAt)),
    ...store.savedCharacterVariants.map((item) => row('character-variant', item, item.createdAt)),
  ];
};

const emptySnapshot = (): CreativeLibrarySnapshot => ({
  revision: 0,
  store: createEmptyCreativeAssetStore(),
  updatedAt: new Date(0).toISOString(),
});

export class DrizzleCreativeLibraryRepository implements CreativeLibraryRepository {
  constructor(
    private readonly db: LightframeDatabase,
    private readonly releaseReferenceImages?: (
      ownerUserId: string,
      assetIds: readonly string[],
    ) => Promise<void>,
  ) {}

  async load(ownerUserId: string): Promise<CreativeLibrarySnapshot> {
    const [library] = await this.db
      .select()
      .from(creativeLibraries)
      .where(eq(creativeLibraries.ownerUserId, ownerUserId))
      .limit(1);
    if (library === undefined) return emptySnapshot();
    const rows = await this.db
      .select()
      .from(creativeAssets)
      .where(eq(creativeAssets.ownerUserId, ownerUserId))
      .orderBy(asc(creativeAssets.kind), asc(creativeAssets.id));
    const candidate = {
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: rows
        .filter((row) => row.kind === 'saved-prompt' || row.kind === 'outfit')
        .map((row) => row.payload),
      recentPrompts: rows.filter((row) => row.kind === 'recent-prompt').map((row) => row.payload),
      savedCharacterPrompts: rows
        .filter((row) => row.kind === 'character')
        .map((row) => row.payload),
      savedCharacterVariants: rows
        .filter((row) => row.kind === 'character-variant')
        .map((row) => row.payload),
    };
    const sanitized = sanitizeCreativeAssetStore(candidate);
    // Normalized rows do not preserve the browser store's array order. The domain
    // sanitizer restores its canonical order, which is a harmless recovery. Only
    // reject records that could not be represented at all.
    if (sanitized.droppedRecords > 0) {
      throw new Error('Stored creative library records are inconsistent.');
    }
    return {
      revision: library.revision,
      store: sanitized.store,
      updatedAt: toIsoTimestamp(library.updatedAt),
    };
  }

  async replace(
    ownerUserId: string,
    expectedRevision: number,
    store: CreativeAssetStore,
    updatedAt: string,
  ): Promise<CreativeLibrarySnapshot | 'conflict'> {
    const sanitized = sanitizeCreativeAssetStore(store);
    if (sanitized.recovered || sanitized.droppedRecords > 0) {
      throw new Error('Creative library payload is not canonical.');
    }
    const nextReferences = collectReferenceImageAssetIds(sanitized.store);
    const nextRevision = expectedRevision + 1;
    const result = await this.db.transaction(async (tx) => {
      // The revision claim is the statement itself, not a read followed by a write.
      //
      // `select ... for update` was the check, which cannot lock a row that does not exist — so on
      // an account's first write, when there is no library row, two callers both read nothing, both
      // computed revision 0, both passed the check and both went on to delete every asset and
      // insert their own. One operator's characters, outfits and prompts vanished while both were
      // told the write succeeded. Each branch below decides and writes in one statement, and an
      // empty result means somebody else got there first.
      const claimed =
        expectedRevision === 0
          ? await tx
              .insert(creativeLibraries)
              .values({
                ownerUserId,
                revision: nextRevision,
                schemaVersion: sanitized.store.schemaVersion,
                createdAt: updatedAt,
                updatedAt,
              })
              // The row's absence is what this claims, so the unique index is the arbiter: exactly
              // one of two first writes inserts, and the other returns nothing.
              .onConflictDoNothing({ target: creativeLibraries.ownerUserId })
              .returning({ revision: creativeLibraries.revision })
          : await tx
              .update(creativeLibraries)
              .set({
                revision: nextRevision,
                schemaVersion: sanitized.store.schemaVersion,
                updatedAt,
              })
              .where(
                and(
                  eq(creativeLibraries.ownerUserId, ownerUserId),
                  eq(creativeLibraries.revision, expectedRevision),
                ),
              )
              .returning({ revision: creativeLibraries.revision });
      if (claimed.length === 0) return 'conflict' as const;
      // Only the writer that took the revision replaces the assets, and it holds that row's lock
      // for the rest of the transaction, so the next writer waits rather than interleaving.
      // The rows this write replaces are also the previous reference set, so it comes from the
      // delete that has to run anyway — under the claim's lock — rather than from a second full
      // read of the library, sanitized in full, before the transaction had even opened.
      const replaced = await tx
        .delete(creativeAssets)
        .where(eq(creativeAssets.ownerUserId, ownerUserId))
        .returning({ payload: creativeAssets.payload });
      const rows = assetRows(ownerUserId, nextRevision, sanitized.store, updatedAt);
      if (rows.length > 0) await tx.insert(creativeAssets).values(rows);
      const previousReferences = collectReferenceImageAssetIds(replaced.map((row) => row.payload));
      return {
        snapshot: { revision: nextRevision, store: sanitized.store, updatedAt },
        releasedReferenceImageAssetIds: [...previousReferences].filter(
          (assetId) => !nextReferences.has(assetId),
        ),
      };
    });
    if (result === 'conflict') return result;
    if (result.releasedReferenceImageAssetIds.length > 0) {
      await this.releaseReferenceImages?.(ownerUserId, result.releasedReferenceImageAssetIds).catch(
        () => undefined,
      );
    }
    return result.snapshot;
  }
}
