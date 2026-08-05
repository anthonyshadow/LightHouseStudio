import { useSyncExternalStore } from 'react';
import type { CreativeAssetRepository } from './types';

export const useCreativeAssetRepository = (repository: CreativeAssetRepository) =>
  useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);

export const useCreativeAssetSelector = <Selection>(
  repository: CreativeAssetRepository,
  selector: (state: ReturnType<CreativeAssetRepository['getSnapshot']>) => Selection,
) =>
  useSyncExternalStore(
    (listener) => repository.subscribeSelector(selector, listener),
    () => selector(repository.getSnapshot()),
    () => selector(repository.getSnapshot()),
  );
