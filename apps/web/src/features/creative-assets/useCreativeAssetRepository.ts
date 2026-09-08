import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { CreativeAssetRepository } from './types';

/**
 * React re-subscribes whenever the `subscribe` argument changes identity, and `subscribeSelector`
 * allocates a record and evaluates the selector on every subscribe — so a `subscribe` rebuilt each
 * render tears the subscription down and re-adds it after every render of whoever owns it, which
 * here is the session-lifetime shell.
 *
 * Reading the selector through a ref is what lets `subscribe` depend on the repository alone, so
 * callers may keep passing an inline arrow. `getSnapshot` still calls the selector the caller
 * passed this render, so a selector whose result changes is picked up at render time regardless.
 */
export const useCreativeAssetSelector = <Selection>(
  repository: CreativeAssetRepository,
  selector: (state: ReturnType<CreativeAssetRepository['getSnapshot']>) => Selection,
) => {
  const selectorRef = useRef(selector);
  useLayoutEffect(() => {
    selectorRef.current = selector;
  });
  const subscribe = useCallback(
    (listener: () => void) =>
      repository.subscribeSelector((state) => selectorRef.current(state), listener),
    [repository],
  );
  return useSyncExternalStore(
    subscribe,
    () => selector(repository.getSnapshot()),
    () => selector(repository.getSnapshot()),
  );
};
