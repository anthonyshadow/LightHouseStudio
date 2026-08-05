export const MAX_PROVIDER_JSON_BYTES = 1024 * 1024;

export interface BoundedJsonErrorOptions {
  readonly upstreamStatus?: number;
  readonly cause?: unknown;
}

export type BoundedJsonErrorFactory = (options?: BoundedJsonErrorOptions) => Error;

/** Authenticated provider requests must never follow a redirect with application credentials. */
export const authenticatedProviderFetch = (
  fetchImplementation: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> => fetchImplementation(input, { ...init, redirect: 'error' });

export const readBoundedJson = async (
  response: Response,
  createError: BoundedJsonErrorFactory,
  createTooLargeError: BoundedJsonErrorFactory = createError,
  signal?: AbortSignal,
): Promise<unknown> => {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_JSON_BYTES) {
    throw createTooLargeError({ upstreamStatus: response.status });
  }
  if (response.body === null) throw createError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancelReader, { once: true });
  if (signal?.aborted === true) cancelReader();

  try {
    while (true) {
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_PROVIDER_JSON_BYTES) {
        await reader.cancel();
        throw createTooLargeError({ upstreamStatus: response.status });
      }
      chunks.push(next.value);
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }

  signal?.throwIfAborted();
  try {
    return JSON.parse(Buffer.concat(chunks, byteLength).toString('utf8')) as unknown;
  } catch (error) {
    throw createError({ upstreamStatus: response.status, cause: error });
  }
};

export const abortableDelay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

export interface ProviderOperationDeadline {
  readonly signal: AbortSignal;
  didExpire: () => boolean;
  dispose: () => void;
}

export const createProviderOperationDeadline = (
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): ProviderOperationDeadline => {
  const controller = new AbortController();
  let expired = false;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  if (callerSignal?.aborted === true) controller.abort(callerSignal.reason);
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didExpire: () => expired,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
};
