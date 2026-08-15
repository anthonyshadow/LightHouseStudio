import { useSyncExternalStore } from 'react';
import type { CreativeAssetRepository } from './types';

export const useCreativeAssetSelector = <Selection>(
  repository: CreativeAssetRepository,
  selector: (state: ReturnType<CreativeAssetRepository['getSnapshot']>) => Selection,
) =>
  useSyncExternalStore(
    (listener) => repository.subscribeSelector(selector, listener),
    () => selector(repository.getSnapshot()),
    () => selector(repository.getSnapshot()),
  );
