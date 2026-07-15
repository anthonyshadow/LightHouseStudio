import { useSyncExternalStore } from 'react';
import type { CreativeAssetRepository } from './types';

export const useCreativeAssetRepository = (repository: CreativeAssetRepository) =>
  useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot);
