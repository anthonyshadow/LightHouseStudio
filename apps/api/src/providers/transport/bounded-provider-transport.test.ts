import { describe, expect, it, vi } from 'vitest';
import type { ProviderFetch } from './provider-fetch.js';
import {
  abortableDelay,
  authenticatedProviderFetch,
  createProviderOperationDeadline,
  MAX_PROVIDER_JSON_BYTES,
  readBoundedJson,
  type BoundedJsonErrorOptions,
} from './bounded-provider-transport.js';

class BoundedJsonTestError extends Error {
  readonly options: BoundedJsonErrorOptions | undefined;

  constructor(options?: BoundedJsonErrorOptions) {
    super('invalid bounded JSON');
    this.options = options;
  }
}

const createError = (options?: BoundedJsonErrorOptions): Error => new BoundedJsonTestError(options);
const createTooLargeError = (options?: BoundedJsonErrorOptions): Error => {
  const error = new BoundedJsonTestError(options);
  error.name = 'BoundedJsonTooLargeTestError';
  return error;
};

describe('bounded provider transport primitives', () => {
  it('forces redirect rejection for authenticated requests', async () => {
    const fetchImplementation = vi.fn<ProviderFetch>().mockResolvedValue(new Response('{}'));

    await authenticatedProviderFetch(fetchImplementation, 'https://provider.invalid/resource', {
      redirect: 'follow',
      headers: { Authorization: 'Bearer secret' },
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://provider.invalid/resource',
      expect.objectContaining({
        redirect: 'error',
        headers: { Authorization: 'Bearer secret' },
      }),
    );
  });

  it('parses a bounded JSON response', async () => {
    const response = new Response(JSON.stringify({ result: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    await expect(readBoundedJson(response, createError)).resolves.toEqual({ result: true });
  });

  it('rejects a declared oversized response before reading its body', async () => {
    const cancel = vi.fn();
    const response = {
      status: 200,
      headers: new Headers({ 'content-length': String(MAX_PROVIDER_JSON_BYTES + 1) }),
      body: {
        getReader: () => ({
          read: () => Promise.reject(new Error('must not read')),
          cancel,
        }),
      },
    } as unknown as Response;

    await expect(readBoundedJson(response, createError, createTooLargeError)).rejects.toMatchObject(
      {
        name: 'BoundedJsonTooLargeTestError',
        options: { upstreamStatus: 200 },
      },
    );
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels and rejects a streamed response over the byte limit', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const chunks = [new Uint8Array(MAX_PROVIDER_JSON_BYTES), new Uint8Array([0])];
    const read = vi
      .fn()
      .mockResolvedValueOnce({ done: false, value: chunks[0] })
      .mockResolvedValueOnce({ done: false, value: chunks[1] });
    const releaseLock = vi.fn();
    const response = {
      status: 201,
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel, releaseLock }) },
    } as unknown as Response;

    await expect(readBoundedJson(response, createError, createTooLargeError)).rejects.toMatchObject(
      {
        name: 'BoundedJsonTooLargeTestError',
        options: { upstreamStatus: 201 },
      },
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it('rejects a missing body and malformed JSON with the existing error context', async () => {
    await expect(
      readBoundedJson(new Response(null, { status: 204 }), createError),
    ).rejects.toMatchObject({ options: undefined });

    try {
      await readBoundedJson(new Response('{', { status: 200 }), createError);
      throw new Error('Expected malformed JSON to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(BoundedJsonTestError);
      if (!(error instanceof BoundedJsonTestError)) throw error;
      expect(error.options?.upstreamStatus).toBe(200);
      expect(error.options?.cause).toBeInstanceOf(SyntaxError);
    }
  });

  it('settles delay normally and rejects immediately or while waiting on abort', async () => {
    await expect(abortableDelay(0, new AbortController().signal)).resolves.toBeUndefined();

    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(abortableDelay(1_000, alreadyAborted.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    const waiting = new AbortController();
    const pending = abortableDelay(1_000, waiting.signal);
    waiting.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('distinguishes caller cancellation from one operation-wide deadline', async () => {
    const caller = new AbortController();
    const callerDeadline = createProviderOperationDeadline(caller.signal, 5_000);
    const reason = new Error('caller stopped');
    caller.abort(reason);
    expect(callerDeadline.signal.aborted).toBe(true);
    expect(callerDeadline.signal.reason).toBe(reason);
    expect(callerDeadline.didExpire()).toBe(false);
    callerDeadline.dispose();

    const timed = createProviderOperationDeadline(undefined, 5);
    await new Promise<void>((resolve) => {
      timed.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    expect(timed.signal.aborted).toBe(true);
    expect(timed.didExpire()).toBe(true);
    timed.dispose();
  });
});
