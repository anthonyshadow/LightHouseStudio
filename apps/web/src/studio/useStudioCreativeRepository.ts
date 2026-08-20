import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import type { CreativeAssetRepository } from '../features/creative-assets/types';
import { useCreativeLibraryCloudSync } from '../features/creative-assets/useCreativeLibraryCloudSync';
import { useCreativeAssetSelector } from '../features/creative-assets/useCreativeAssetRepository';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
} from '../features/creative-assets/types';
import {
  currentBrowserPersistenceScope,
  environmentScopedPersistenceName,
  legacyPersistenceNamesForScope,
} from '../persistence/environmentScope';
import {
  deriveExistingVideoSavedRecipes,
  recordAcceptedExistingVideoBatchStep,
  type AcceptedExistingVideoBatchStep,
} from './existingVideoRecipes';

export const useStudioCreativeRepository = (
  ownerUserId: string,
  { cloudMirror }: { readonly cloudMirror?: boolean | undefined } = {},
) => {
  const persistenceScope = currentBrowserPersistenceScope();
  /*
   * Bumped only to recover a library that failed to open. Recreating the repository is what
   * re-runs the IndexedDB load, and there is no cheaper seam: the initialization promise is
   * settled, so awaiting it again returns the same failure.
   */
  const [openAttempt, setOpenAttempt] = useState(0);
  const repository = useMemo(
    () =>
      createCreativeAssetRepository({
        storageKey: environmentScopedPersistenceName(
          CREATIVE_ASSET_STORAGE_KEY,
          ownerUserId,
          persistenceScope,
        ),
        legacyStorageKeys: legacyPersistenceNamesForScope(
          [
            `${WARDROBE_CREATIVE_ASSET_STORAGE_KEY}.${ownerUserId}`,
            CREATIVE_ASSET_STORAGE_KEY,
            WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
          ],
          persistenceScope,
        ),
        ownerUserId,
      }),
    // `openAttempt` is a deliberate dependency: a retry has to build a new repository.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openAttempt, ownerUserId, persistenceScope],
  );

  useEffect(() => () => repository.close?.(), [repository]);
  /*
   * The store starts empty and fills in after IndexedDB loads, so a surface that reads a count
   * without this would state `0` for a library it has not read yet.
   *
   * The loaded repository is the state, rather than a boolean reset on every change: a reopened
   * library is a different instance, so it reads as unloaded again without an effect saying so.
   */
  const [loadedRepository, setLoadedRepository] = useState<CreativeAssetRepository | null>(null);
  useEffect(() => {
    let current = true;
    void repository.ready().then(() => {
      if (current) setLoadedRepository(repository);
    });
    return () => {
      current = false;
    };
  }, [repository]);
  const hydrated = loadedRepository === repository;
  const reopen = useCallback(() => setOpenAttempt((attempt) => attempt + 1), []);
  const sync = useCreativeLibraryCloudSync(repository, {
    initializeEmptyRemoteFromLocal: persistenceScope === 'production',
    cloudMirror,
  });

  const store = useCreativeAssetSelector(repository, (state) => state.store);
  const health = useCreativeAssetSelector(repository, (state) => state.health);
  const existingVideoSavedRecipes = useMemo(() => deriveExistingVideoSavedRecipes(store), [store]);
  const recordAcceptedBatchStep = useCallback(
    (step: AcceptedExistingVideoBatchStep) =>
      recordAcceptedExistingVideoBatchStep(repository, existingVideoSavedRecipes, step),
    [existingVideoSavedRecipes, repository],
  );

  return useMemo(
    () =>
      ({
        repository,
        store,
        health,
        hydrated,
        reopen,
        sync,
        existingVideoSavedRecipes,
        recordAcceptedBatchStep,
      }) as const,
    [
      existingVideoSavedRecipes,
      health,
      hydrated,
      recordAcceptedBatchStep,
      reopen,
      repository,
      store,
      sync,
    ],
  );
};
