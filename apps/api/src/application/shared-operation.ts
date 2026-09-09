export interface SharedOperation<Result> {
  readonly acceptingSubscribers: boolean;
  readonly result: Promise<Result>;
  subscribe(signal: AbortSignal | undefined, abortedError: () => Error): Promise<Result>;
}

export const createSharedOperation = <Result>(
  run: (signal: AbortSignal) => Promise<Result>,
): SharedOperation<Result> => {
  const controller = new AbortController();
  const subscribers = new Set<symbol>();
  let settled = false;
  let acceptingSubscribers = true;
  const result = Promise.resolve().then(() => run(controller.signal));
  void result.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  return {
    get acceptingSubscribers() {
      return acceptingSubscribers;
    },
    result,
    subscribe: (signal, abortedError) => {
      if (!acceptingSubscribers) return Promise.reject(abortedError());
      const subscriber = Symbol('shared-operation-subscriber');
      subscribers.add(subscriber);

      return new Promise<Result>((resolve, reject) => {
        let completed = false;
        const release = (): void => {
          subscribers.delete(subscriber);
          signal?.removeEventListener('abort', abort);
          if (!settled && subscribers.size === 0) {
            acceptingSubscribers = false;
            controller.abort('no-active-subscribers');
          }
        };
        const finish = (complete: () => void): void => {
          if (completed) return;
          completed = true;
          release();
          complete();
        };
        const abort = (): void => finish(() => reject(abortedError()));

        if (signal?.aborted === true) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        void result.then(
          (value) => finish(() => resolve(value)),
          (error: unknown) =>
            finish(() =>
              reject(
                error instanceof Error
                  ? error
                  : new Error('Shared operation failed.', { cause: error }),
              ),
            ),
        );
      });
    },
  };
};

/**
 * One in-flight operation per key, shared by everyone who asks while it runs.
 *
 * The map entry is the coalescing point, not a cache: it is dropped as soon as the operation
 * settles, so the next caller starts a fresh one. A caller that wants the result kept holds its own
 * cache and writes it from `onResult`, which runs before the entry is released — so a caller
 * arriving immediately after settlement reads that cache instead of starting a second run.
 */
export class KeyedSharedOperations<Value> {
  readonly #operations = new Map<string, SharedOperation<Value>>();

  run(
    key: string,
    input: {
      readonly signal: AbortSignal | undefined;
      readonly abortedError: () => Error;
      readonly start: (signal: AbortSignal) => Promise<Value>;
      readonly onResult?: (value: Value) => void;
    },
  ): Promise<Value> {
    const active = this.#operations.get(key);
    if (active?.acceptingSubscribers === true) {
      return active.subscribe(input.signal, input.abortedError);
    }
    const operation = createSharedOperation(input.start);
    this.#operations.set(key, operation);
    const release = (): void => {
      if (this.#operations.get(key) === operation) this.#operations.delete(key);
    };
    void operation.result.then((value) => {
      input.onResult?.(value);
      release();
    }, release);
    return operation.subscribe(input.signal, input.abortedError);
  }
}
