import type { CreativeAssetStore } from '@studio/domain';

export interface PersistedCreativeAssetSnapshot {
  readonly revision: number;
  readonly store: unknown;
}

export interface CreativeAssetPersistence {
  load(ownerUserId: string): Promise<PersistedCreativeAssetSnapshot | null>;
  initialize(ownerUserId: string, store: CreativeAssetStore): Promise<number>;
  commit(
    ownerUserId: string,
    expectedRevision: number,
    previous: CreativeAssetStore,
    next: CreativeAssetStore,
  ): Promise<number>;
  repair(ownerUserId: string, expectedRevision: number, store: CreativeAssetStore): Promise<number>;
  close(): void;
}

export class CreativeAssetPersistenceConflictError extends Error {
  constructor() {
    super('The durable creative library changed in another browser context.');
    this.name = 'CreativeAssetPersistenceConflictError';
  }
}
