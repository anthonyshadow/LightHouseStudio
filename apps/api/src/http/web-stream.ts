import { Readable } from 'node:stream';

export interface StreamLifecycle {
  readonly signal?: AbortSignal;
  readonly onActivity?: () => void;
  readonly onComplete?: () => void | Promise<void>;
  readonly onCancel?: (reason?: unknown) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

export interface StreamPayload {
  readonly kind: 'node-stream';
  readonly stream: Readable;
  readonly lifecycle?: StreamLifecycle;
}

interface ResponseBodyReply {
  readonly headers: Headers;
  type(contentType: string): unknown;
}

export interface StreamTransportSettlement {
  readonly settled: Promise<void>;
  claim(): void;
  finish(): Promise<void>;
}

export interface ResponseBodyWithTransport {
  readonly body: BodyInit | null;
  readonly transport?: StreamTransportSettlement;
}

export interface ResponseBodyOptions {
  readonly transportClaimed?: boolean;
}

export const createClaimedStreamTransportSettlement = (
  lifecycle?: StreamLifecycle,
): StreamTransportSettlement => {
  let settled = false;
  let resolveSettlement: (() => void) | undefined;
  const settlement = new Promise<void>((resolve) => {
    resolveSettlement = resolve;
  });
  const removeAbortListener = (): void => {
    lifecycle?.signal?.removeEventListener('abort', abort);
  };
  const settle = async (operation: () => void | Promise<void>): Promise<void> => {
    if (settled) return;
    settled = true;
    removeAbortListener();
    try {
      await operation();
    } finally {
      resolveSettlement?.();
    }
  };
  const abort = (): void => {
    const reason = (lifecycle?.signal?.reason as unknown) ?? 'request-aborted';
    void settle(async () => lifecycle?.onCancel?.(reason)).catch(() => undefined);
  };

  if (lifecycle?.signal?.aborted === true) abort();
  else lifecycle?.signal?.addEventListener('abort', abort, { once: true });

  return {
    settled: settlement,
    claim: () => undefined,
    finish: async () => {
      await settle(async () => lifecycle?.onComplete?.());
    },
  };
};

export const isStreamPayload = (value: unknown): value is StreamPayload =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'node-stream' &&
  'stream' in value &&
  value.stream instanceof Readable;

const streamToWeb = (
  payload: StreamPayload,
  options: ResponseBodyOptions = {},
): { readonly body: ReadableStream<Uint8Array>; readonly transport: StreamTransportSettlement } => {
  const source = Readable.toWeb(payload.stream) as unknown as ReadableStream<Uint8Array>;
  const reader = source.getReader();
  let settled = false;
  let transportClaimed = options.transportClaimed ?? false;
  let resolveSettlement: (() => void) | undefined;
  const settlement = new Promise<void>((resolve) => {
    resolveSettlement = resolve;
  });
  const settle = async (operation: () => void | Promise<void>): Promise<void> => {
    if (settled) return;
    settled = true;
    try {
      await operation();
    } finally {
      resolveSettlement?.();
    }
  };
  const complete = async (): Promise<void> => {
    await settle(async () => payload.lifecycle?.onComplete?.());
  };
  const cancel = async (reason?: unknown): Promise<void> => {
    await settle(async () => payload.lifecycle?.onCancel?.(reason));
  };
  const fail = async (error: unknown): Promise<void> => {
    await settle(async () => payload.lifecycle?.onError?.(error));
  };
  const removeAbortListener = (): void => {
    payload.lifecycle?.signal?.removeEventListener('abort', abort);
  };
  const abort = (): void => {
    const reason = (payload.lifecycle?.signal?.reason as unknown) ?? 'request-aborted';
    removeAbortListener();
    void reader.cancel(reason).catch(() => undefined);
    payload.stream.destroy();
    void cancel(reason).catch(() => undefined);
  };
  if (payload.lifecycle?.signal?.aborted === true) abort();
  else payload.lifecycle?.signal?.addEventListener('abort', abort, { once: true });

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          if (!transportClaimed) {
            removeAbortListener();
            await complete();
          }
          controller.close();
          return;
        }
        payload.lifecycle?.onActivity?.();
        controller.enqueue(next.value);
      } catch (error) {
        removeAbortListener();
        await fail(error).catch(() => undefined);
        controller.error(error);
      }
    },
    async cancel(reason) {
      removeAbortListener();
      await cancel(reason).catch(() => undefined);
      payload.stream.destroy();
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return {
    body,
    transport: {
      settled: settlement,
      claim: () => {
        if (!settled) transportClaimed = true;
      },
      finish: async () => {
        removeAbortListener();
        await complete();
      },
    },
  };
};

export const responseBodyWithTransport = (
  payload: unknown,
  reply: ResponseBodyReply,
  options: ResponseBodyOptions = {},
): ResponseBodyWithTransport => {
  if (payload === undefined || payload === null) return { body: null };
  if (isStreamPayload(payload)) return streamToWeb(payload, options);
  if (payload instanceof Readable) {
    return streamToWeb({ kind: 'node-stream', stream: payload }, options);
  }
  if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
    return { body: payload as unknown as BodyInit };
  }
  if (payload instanceof ArrayBuffer) return { body: payload };
  if (typeof payload === 'string') {
    if (!reply.headers.has('Content-Type')) reply.type('text/plain; charset=utf-8');
    return { body: payload };
  }
  if (!reply.headers.has('Content-Type')) reply.type('application/json; charset=utf-8');
  return { body: JSON.stringify(payload) };
};

export const responseBody = (payload: unknown, reply: ResponseBodyReply): BodyInit | null =>
  responseBodyWithTransport(payload, reply).body;
