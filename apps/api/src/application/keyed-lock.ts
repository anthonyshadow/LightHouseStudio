/** Serializes asynchronous mutations that share one caller-defined key. */
export class KeyedLock {
  readonly #locks = new Map<string, Promise<unknown>>();

  async run<Result>(key: string, operation: () => Promise<Result>): Promise<Result> {
    const prior = this.#locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => next);
    this.#locks.set(key, chain);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.#locks.get(key) === chain) this.#locks.delete(key);
    }
  }
}
