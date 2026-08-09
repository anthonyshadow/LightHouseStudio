import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationRuntime, MAX_REQUEST_BODY_BYTES } from '../application/application-runtime.js';
import { AppError, installErrorHandling } from './errors.js';

describe('API error handling', () => {
  const apps: ApplicationRuntime[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  const requestAppError = async (upstreamStatus: number) => {
    const app = new ApplicationRuntime({ logger: false });
    apps.push(app);
    app.get('/failure', () => {
      throw new AppError(502, 'provider_failure', 'The provider request failed safely.', {
        upstreamStatus,
      });
    });
    installErrorHandling(app);
    return app.inject({ method: 'GET', url: '/failure' });
  };

  it('preserves the valid upstream HTTP status boundaries in the safe envelope', async () => {
    for (const status of [400, 599]) {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
          upstreamStatus: status,
        },
      });
    }
  });

  it('omits every invalid upstream status without breaking the safe envelope', async () => {
    for (const status of [0, 399, 400.5, 600, Number.NaN, Number.POSITIVE_INFINITY]) {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
        },
      });
    }
  });

  it('bounds handlers that ignore cancellation with the application inactivity watchdog', async () => {
    const app = new ApplicationRuntime({ logger: false, connectionTimeoutMs: 10 });
    apps.push(app);
    app.get('/stalled', () => new Promise(() => undefined));
    installErrorHandling(app);

    const response = await app.inject({ method: 'GET', url: '/stalled' });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      error: {
        code: 'request_timeout',
        message: 'The request timed out before it could complete.',
      },
    });
  });

  it('uses a distinct absolute receive deadline for multipart uploads', async () => {
    const app = new ApplicationRuntime({
      logger: false,
      connectionTimeoutMs: 1_000,
      receiveTimeoutMs: 10,
    });
    apps.push(app);
    app.post('/multipart', { bodyParser: 'multipart' }, async (request) => {
      const reader = request.raw.body?.getReader();
      if (reader === undefined) throw new Error('missing test body');
      await reader.read();
      request.markBodyReceived();
      return { ok: true };
    });
    installErrorHandling(app);
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => undefined),
    });
    const request = new Request('http://localhost/multipart', {
      method: 'POST',
      headers: { host: 'localhost', 'content-type': 'multipart/form-data; boundary=test' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await app.handle(request);

    expect(response.status).toBe(408);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'request_timeout',
        message: 'The request body was not received before the deadline.',
      },
    });
  });

  it('starts a fresh operation budget after most of the receive budget is consumed', async () => {
    const app = new ApplicationRuntime({
      logger: false,
      connectionTimeoutMs: 50,
      receiveTimeoutMs: 50,
    });
    apps.push(app);
    app.post(
      '/phases',
      {
        bodyLimit: 16,
        bodyParser: 'buffer',
        acceptedContentTypes: ['application/octet-stream'],
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ok: true };
      },
    );
    installErrorHandling(app);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });

    const response = await app.handle(
      new Request('http://localhost/phases', {
        method: 'POST',
        headers: { host: 'localhost', 'content-type': 'application/octet-stream' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('cancels a quiet response stream when its operation becomes inactive', async () => {
    const app = new ApplicationRuntime({ logger: false, connectionTimeoutMs: 10 });
    apps.push(app);
    const stream = new Readable({ read: () => undefined });
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    app.get('/quiet-stream', (_request, reply) =>
      reply.sendStream(stream, { onCancel, onComplete }),
    );
    installErrorHandling(app);

    const response = await app.handle(
      new Request('http://localhost/quiet-stream', { headers: { host: 'localhost' } }),
    );

    await expect(response.text()).resolves.toBe('');
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
    expect(stream.destroyed).toBe(true);
  });

  it('supports streamed request payloads through the inject compatibility facade', async () => {
    const app = new ApplicationRuntime({ logger: false });
    apps.push(app);
    app.post(
      '/streamed-upload',
      {
        bodyLimit: 16,
        bodyParser: 'buffer',
        acceptedContentTypes: ['application/octet-stream'],
      },
      (request) => ({ bytes: Buffer.isBuffer(request.body) ? request.body.byteLength : -1 }),
    );
    installErrorHandling(app);
    const payload = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/streamed-upload',
      headers: { 'content-type': 'application/octet-stream' },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bytes: 3 });
  });

  it('preserves application-owned cancellation status while racing a stalled handler', async () => {
    const app = new ApplicationRuntime({ logger: false, connectionTimeoutMs: 1_000 });
    apps.push(app);
    app.get('/aborted', () => new Promise(() => undefined));
    installErrorHandling(app);
    const controller = new AbortController();
    const responsePromise = app.handle(
      new Request('http://localhost/aborted', {
        headers: { host: 'localhost' },
        signal: controller.signal,
      }),
    );
    setTimeout(() => controller.abort('test-disconnect'), 10);

    const response = await responsePromise;

    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'request_aborted',
        message: 'The request was interrupted before it completed.',
      },
    });
  });

  it('enforces the exact application body ceiling without listener pre-parsing', async () => {
    const app = new ApplicationRuntime({ logger: false });
    apps.push(app);
    app.post(
      '/upload',
      {
        bodyLimit: MAX_REQUEST_BODY_BYTES,
        bodyParser: 'buffer',
        acceptedContentTypes: ['application/octet-stream'],
      },
      () => ({ ok: true }),
    );
    installErrorHandling(app);

    const response = await app.handle(
      new Request('http://localhost/upload', {
        method: 'POST',
        headers: {
          host: 'localhost',
          'content-type': 'application/octet-stream',
          'content-length': String(MAX_REQUEST_BODY_BYTES + 1),
        },
        body: 'x',
      }),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'payload_too_large' },
    });
  });
});
