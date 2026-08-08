import type { CreativeAssetStore } from '@studio/domain';

export interface CreativeLibrarySnapshot {
  readonly revision: number;
  readonly store: CreativeAssetStore;
  readonly updatedAt: string;
}

export interface CreativeLibraryRepository {
  load(ownerUserId: string): Promise<CreativeLibrarySnapshot>;
  replace(
    ownerUserId: string,
    expectedRevision: number,
    store: CreativeAssetStore,
    updatedAt: string,
  ): Promise<CreativeLibrarySnapshot | 'conflict'>;
}
