export type SessionCleanupPhase = 'cancel-operations' | 'release-media' | 'clear-caches';

const phaseOrder: Readonly<Record<SessionCleanupPhase, number>> = {
  'cancel-operations': 0,
  'release-media': 1,
  'clear-caches': 2,
};

export class SessionCleanupCoordinator {
  readonly #tasks = new Map<
    string,
    { readonly phase: SessionCleanupPhase; readonly cleanup: () => void | Promise<void> }
  >();
  #active: Promise<void> | null = null;

  register(
    id: string,
    phase: SessionCleanupPhase,
    cleanup: () => void | Promise<void>,
  ): () => void {
    this.#tasks.set(id, { phase, cleanup });
    return () => {
      const current = this.#tasks.get(id);
      if (current?.cleanup === cleanup) this.#tasks.delete(id);
    };
  }

  run(): Promise<void> {
    this.#active ??= (async () => {
      const tasks = [...this.#tasks.values()].sort(
        (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase],
      );
      for (const task of tasks) await task.cleanup();
    })().finally(() => {
      this.#active = null;
    });
    return this.#active;
  }
}
