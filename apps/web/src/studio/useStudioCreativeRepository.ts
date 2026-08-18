import { useCallback, useEffect, useMemo } from 'react';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
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

export const useStudioCreativeRepository = (ownerUserId: string) => {
  const persistenceScope = currentBrowserPersistenceScope();
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
    [ownerUserId, persistenceScope],
  );

  useEffect(() => () => repository.close?.(), [repository]);
  useCreativeLibraryCloudSync(repository, {
    initializeEmptyRemoteFromLocal: persistenceScope === 'production',
  });

  const store = useCreativeAssetSelector(repository, (state) => state.store);
  const existingVideoSavedRecipes = useMemo(() => deriveExistingVideoSavedRecipes(store), [store]);
  const recordAcceptedBatchStep = useCallback(
    (step: AcceptedExistingVideoBatchStep) =>
      recordAcceptedExistingVideoBatchStep(repository, existingVideoSavedRecipes, step),
    [existingVideoSavedRecipes, repository],
  );

  return useMemo(
    () => ({ repository, store, existingVideoSavedRecipes, recordAcceptedBatchStep }) as const,
    [existingVideoSavedRecipes, recordAcceptedBatchStep, repository, store],
  );
};
