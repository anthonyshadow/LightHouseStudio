import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  createClaimedStreamTransportSettlement,
  isStreamPayload,
  responseBody,
  responseBodyWithTransport,
  type StreamPayload,
} from './web-stream.js';

const createReply = (contentType?: string) => {
  const headers = new Headers(
    contentType === undefined ? undefined : { 'content-type': contentType },
  );
  const type = vi.fn((value: string) => {
    headers.set('content-type', value);
  });
  return { headers, type };
};

describe('HTTP response body conversion', () => {
  it('settles a claimed bodyless stream only when its transport finishes', async () => {
    const controller = new AbortController();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const transport = createClaimedStreamTransportSettlement({
      signal: controller.signal,
      onComplete,
      onCancel,
    });

    expect(onComplete).not.toHaveBeenCalled();
    await transport.finish();
    await transport.settled;
    expect(onComplete).toHaveBeenCalledOnce();
    controller.abort('too-late');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels a claimed bodyless stream whose signal was already aborted', async () => {
    const controller = new AbortController();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    controller.abort('head-disconnected');

    const transport = createClaimedStreamTransportSettlement({
      signal: controller.signal,
      onComplete,
      onCancel,
    });
    await transport.settled;

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('head-disconnected');
    await transport.finish();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('recognizes only branded Node-stream payloads', () => {
    const stream = Readable.from(['payload']);
    expect(isStreamPayload({ kind: 'node-stream', stream })).toBe(true);
    expect(isStreamPayload(stream)).toBe(false);
    expect(isStreamPayload({ kind: 'node-stream', stream: 'not-a-stream' })).toBe(false);
    expect(isStreamPayload(null)).toBe(false);
  });

  it('preserves byte bodies and assigns safe default text and JSON content types', () => {
    const reply = createReply();
    const buffer = Buffer.from('bytes');
    const bytes = new Uint8Array([1, 2, 3]);
    const arrayBuffer = new ArrayBuffer(4);

    expect(responseBody(undefined, reply)).toBeNull();
    expect(responseBody(null, reply)).toBeNull();
    expect(responseBody(buffer, reply)).toBe(buffer);
    expect(responseBody(bytes, reply)).toBe(bytes);
    expect(responseBody(arrayBuffer, reply)).toBe(arrayBuffer);
    expect(responseBody('plain', reply)).toBe('plain');
    expect(reply.type).toHaveBeenLastCalledWith('text/plain; charset=utf-8');

    const jsonReply = createReply();
    expect(responseBody({ ok: true }, jsonReply)).toBe('{"ok":true}');
    expect(jsonReply.type).toHaveBeenCalledWith('application/json; charset=utf-8');

    const explicitReply = createReply('application/problem+json');
    expect(responseBody('already-typed', explicitReply)).toBe('already-typed');
    expect(explicitReply.type).not.toHaveBeenCalled();
  });

  it('propagates activity and completes a successful stream exactly once', async () => {
    const onActivity = vi.fn();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const onError = vi.fn();
    const body = responseBody(
      {
        kind: 'node-stream',
        stream: Readable.from([Buffer.from('first'), Buffer.from('-second')]),
        lifecycle: { onActivity, onComplete, onCancel, onError },
      } satisfies StreamPayload,
      createReply(),
    );

    await expect(new Response(body).text()).resolves.toBe('first-second');
    expect(onActivity).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('defers claimed stream success until the HTTP transport finishes', async () => {
    const controller = new AbortController();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const converted = responseBodyWithTransport(
      {
        kind: 'node-stream',
        stream: Readable.from([Buffer.from('delivered')]),
        lifecycle: { signal: controller.signal, onComplete, onCancel },
      } satisfies StreamPayload,
      createReply(),
    );
    if (converted.transport === undefined) throw new Error('Expected transport settlement.');

    converted.transport.claim();
    await expect(new Response(converted.body).text()).resolves.toBe('delivered');
    expect(onComplete).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await converted.transport.finish();
    await converted.transport.settled;
    expect(onComplete).toHaveBeenCalledOnce();
    controller.abort('too-late');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('claims transport ownership before an empty source can reach EOF', async () => {
    const onComplete = vi.fn();
    const converted = responseBodyWithTransport(
      {
        kind: 'node-stream',
        stream: Readable.from([]),
        lifecycle: { onComplete },
      } satisfies StreamPayload,
      createReply(),
      { transportClaimed: true },
    );
    if (converted.transport === undefined) throw new Error('Expected transport settlement.');

    await expect(new Response(converted.body).arrayBuffer()).resolves.toHaveProperty(
      'byteLength',
      0,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onComplete).not.toHaveBeenCalled();

    await converted.transport.finish();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('settles a claimed source-EOF tail disconnect as cancellation', async () => {
    const controller = new AbortController();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const converted = responseBodyWithTransport(
      {
        kind: 'node-stream',
        stream: Readable.from([Buffer.from('buffered-tail')]),
        lifecycle: { signal: controller.signal, onComplete, onCancel },
      } satisfies StreamPayload,
      createReply(),
    );
    if (converted.transport === undefined) throw new Error('Expected transport settlement.');

    converted.transport.claim();
    await expect(new Response(converted.body).text()).resolves.toBe('buffered-tail');
    controller.abort('tail-disconnected');
    await converted.transport.settled;

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('tail-disconnected');
    await converted.transport.finish();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('settles cancellation once and destroys a stream abandoned by its consumer', async () => {
    let emitted = false;
    const stream = new Readable({
      read() {
        if (emitted) return;
        emitted = true;
        this.push(Buffer.from('available'));
      },
    });
    const onComplete = vi.fn();
    const onCancel = vi.fn().mockRejectedValue(new Error('cancel-settlement-failed'));
    const onError = vi.fn();
    const body = responseBody(
      {
        kind: 'node-stream',
        stream,
        lifecycle: { onComplete, onCancel, onError },
      } satisfies StreamPayload,
      createReply(),
    );
    if (!(body instanceof ReadableStream)) throw new Error('Expected a streamed response body.');
    const reader = body.getReader();

    await expect(reader.read()).resolves.toMatchObject({ done: false });
    await reader.cancel('client-stopped');

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledWith('client-stopped');
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(stream.destroyed).toBe(true);
  });

  it('reports source failures through the lifecycle before rejecting the body', async () => {
    const failure = new Error('source-failed');
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const onError = vi.fn().mockRejectedValue(new Error('error-settlement-failed'));
    const stream = new Readable({
      read() {
        this.destroy(failure);
      },
    });
    const body = responseBody(
      { kind: 'node-stream', stream, lifecycle: { onComplete, onCancel, onError } },
      createReply(),
    );

    await expect(new Response(body).text()).rejects.toThrow('source-failed');
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('turns a request abort into one cancellation with the original reason', async () => {
    const stream = new Readable({ read() {} });
    const controller = new AbortController();
    const onCancel = vi.fn().mockRejectedValue(new Error('abort-settlement-failed'));
    const body = responseBody(
      {
        kind: 'node-stream',
        stream,
        lifecycle: { signal: controller.signal, onCancel },
      },
      createReply(),
    );
    expect(body).toBeInstanceOf(ReadableStream);

    controller.abort('socket-disconnected');

    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    expect(onCancel).toHaveBeenCalledWith('socket-disconnected');
    expect(stream.destroyed).toBe(true);
  });

  it('treats a signal aborted before stream construction as cancellation', async () => {
    const stream = Readable.from([Buffer.from('must-not-complete')]);
    const controller = new AbortController();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    controller.abort('already-disconnected');

    const body = responseBody(
      {
        kind: 'node-stream',
        stream,
        lifecycle: { signal: controller.signal, onComplete, onCancel },
      },
      createReply(),
    );
    await expect(new Response(body).arrayBuffer()).resolves.toHaveProperty('byteLength', 0);

    await vi.waitFor(() => expect(onCancel).toHaveBeenCalledOnce());
    expect(onCancel).toHaveBeenCalledWith('already-disconnected');
    expect(onComplete).not.toHaveBeenCalled();
    expect(stream.destroyed).toBe(true);
  });

  it('also converts an unbranded Node stream', async () => {
    const body = responseBody(Readable.from([Buffer.from('raw-stream')]), createReply());
    await expect(new Response(body).text()).resolves.toBe('raw-stream');
  });
});
