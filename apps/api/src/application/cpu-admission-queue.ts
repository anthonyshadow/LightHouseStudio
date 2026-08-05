type AdmissionWaiter = {
  readonly signal?: AbortSignal;
  readonly start: () => void;
  readonly reject: (error: unknown) => void;
  removeAbortListener?: () => void;
};

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

export class CpuAdmissionQueue {
  readonly #concurrency: number;
  readonly #waiting: AdmissionWaiter[] = [];
  #active = 0;

  constructor(concurrency: number) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new TypeError('CPU admission concurrency must be a positive integer.');
    }
    this.#concurrency = concurrency;
  }

  run<Result>(operation: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    if (signal?.aborted === true) return Promise.reject(abortError());

    return new Promise<Result>((resolve, reject) => {
      const waiter: AdmissionWaiter = {
        reject,
        ...(signal === undefined ? {} : { signal }),
        start: () => {
          this.#active += 1;
          void operation()
            .then(resolve, reject)
            .finally(() => {
              this.#active -= 1;
              this.#drain();
            });
        },
      };
      if (signal !== undefined) {
        const onAbort = (): void => {
          const index = this.#waiting.indexOf(waiter);
          if (index < 0) return;
          this.#waiting.splice(index, 1);
          waiter.removeAbortListener?.();
          reject(abortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        waiter.removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      }
      this.#waiting.push(waiter);
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#active < this.#concurrency) {
      const waiter = this.#waiting.shift();
      if (waiter === undefined) return;
      waiter.removeAbortListener?.();
      if (waiter.signal?.aborted === true) {
        waiter.reject(abortError());
        continue;
      }
      waiter.start();
    }
  }
}

export const imageDecodeAdmission = new CpuAdmissionQueue(2);
