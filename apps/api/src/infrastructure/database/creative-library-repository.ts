import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  createEmptyCreativeAssetStore,
  sanitizeCreativeAssetStore,
  type CreativeAssetStore,
} from '@studio/domain';
import { asc, eq } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  CreativeLibraryRepository,
  CreativeLibrarySnapshot,
} from '../../features/creative-libraries/creative-library-repository.js';
import type { LightframeDatabase } from './client.js';
import { creativeAssets, creativeLibraries } from './schema.js';

type AssetKind = typeof creativeAssets.$inferInsert.kind;

const referencedImageAssetIds = (store: CreativeAssetStore): Set<string> => {
  const ids = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) ids.add(value);
  };
  for (const item of store.savedPrompts) add(item.referenceImageAssetId);
  for (const item of store.recentPrompts) add(item.referenceImageAssetId);
  for (const item of store.savedCharacterPrompts) {
    add(item.referenceImageAssetId);
    add(item.uploadedReferenceImageAssetId);
  }
  for (const item of store.savedCharacterVariants) {
    add(item.referenceImageAssetId);
    add(item.creation.sourceReferenceImageAssetId);
    if (item.creation.method === 'add-outfit') add(item.creation.garmentReferenceImageAssetId);
  }
  return ids;
};

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
    const previousReferences =
      this.releaseReferenceImages === undefined
        ? new Set<string>()
        : referencedImageAssetIds((await this.load(ownerUserId)).store);
    const nextReferences = referencedImageAssetIds(sanitized.store);
    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(creativeLibraries)
        .where(eq(creativeLibraries.ownerUserId, ownerUserId))
        .for('update')
        .limit(1);
      const revision = current?.revision ?? 0;
      if (revision !== expectedRevision) return 'conflict' as const;
      const nextRevision = revision + 1;
      await tx.delete(creativeAssets).where(eq(creativeAssets.ownerUserId, ownerUserId));
      const rows = assetRows(ownerUserId, nextRevision, sanitized.store, updatedAt);
      if (rows.length > 0) await tx.insert(creativeAssets).values(rows);
      await tx
        .insert(creativeLibraries)
        .values({
          ownerUserId,
          revision: nextRevision,
          schemaVersion: sanitized.store.schemaVersion,
          createdAt: current?.createdAt ?? updatedAt,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: creativeLibraries.ownerUserId,
          set: {
            revision: nextRevision,
            schemaVersion: sanitized.store.schemaVersion,
            updatedAt,
          },
        });
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
