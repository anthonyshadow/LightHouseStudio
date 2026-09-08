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

  /**
   * Each task is isolated: a task that rejects no longer prevents the later phases from running,
   * so `release-media` still releases the camera and microphone when `cancel-operations` failed.
   * The failure is not swallowed — `run()` still rejects with the first one once every task has
   * been attempted, which is what keeps the logout controller showing its notice and skipping
   * `logout()`.
   */
  run(): Promise<void> {
    this.#active ??= (async () => {
      const tasks = [...this.#tasks.values()].sort(
        (left, right) => phaseOrder[left.phase] - phaseOrder[right.phase],
      );
      const failures: unknown[] = [];
      for (const task of tasks) {
        try {
          await task.cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) throw failures[0];
    })().finally(() => {
      this.#active = null;
    });
    return this.#active;
  }
}
