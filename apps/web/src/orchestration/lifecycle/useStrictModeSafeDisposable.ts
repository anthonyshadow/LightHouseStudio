import { useEffect, useMemo } from 'react';

export type DisposableResource = { close(): void };

class ResourceLease<T extends DisposableResource> {
  private activeEffects = 0;
  private generation = 0;
  private disposed = false;

  constructor(private readonly resource: T) {}

  acquire(): void {
    this.activeEffects += 1;
    this.generation += 1;
  }

  release(): void {
    this.activeEffects -= 1;
    const generation = ++this.generation;
    queueMicrotask(() => {
      if (this.disposed || this.activeEffects !== 0 || this.generation !== generation) return;
      this.disposed = true;
      this.resource.close();
    });
  }
}

/** Owns a render-created resource without closing it during React StrictMode effect replay. */
export const useStrictModeSafeDisposable = <T extends DisposableResource>(resource: T): T => {
  const lease = useMemo(() => new ResourceLease(resource), [resource]);

  useEffect(() => {
    lease.acquire();
    return () => lease.release();
  }, [lease]);

  return resource;
};
