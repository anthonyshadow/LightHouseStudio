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
