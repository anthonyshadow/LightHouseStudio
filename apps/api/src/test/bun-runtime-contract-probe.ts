import { connect } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { VIDEO_RESULT_MAX_BYTES } from '@studio/contracts';
import { createApp } from '../app.js';
import { MAX_REQUEST_BODY_BYTES } from '../application/application-runtime.js';
import { testConfig } from './fakes.js';

interface ProbeResponse {
  readonly status: number;
  readonly body: string;
  readonly contentType: string | null;
  readonly contentLength: string | null;
  readonly cacheControl: string | null;
  readonly pragma: string | null;
}

export interface BunRuntimeContractProbeResult {
  readonly health: ProbeResponse;
  readonly healthHead: ProbeResponse;
  readonly trailingSlash: ProbeResponse;
  readonly staticAsset: ProbeResponse;
  readonly staticBadHost: ProbeResponse;
  readonly spaHtml: ProbeResponse;
  readonly spaJson: ProbeResponse;
  readonly apiStaticShadow: ProbeResponse;
  readonly bodylessDelete: ProbeResponse;
  readonly duplicateBindRejected: boolean;
  readonly repeatedCloseUsesSamePromise: boolean;
  readonly unauthorizedBodyPulls: number;
  readonly unauthorizedBodyStatus: number;
  readonly unauthorizedDeclaredBody: ProbeResponse;
  readonly unauthorizedOverGlobalCeiling: ProbeResponse;
  readonly maliciousHostOversizedBody: ProbeResponse;
  readonly malformedHostResponses: readonly ProbeResponse[];
  readonly healthAfterMalformedHosts: ProbeResponse;
  readonly authorizedRouteLimitExceeded: ProbeResponse;
  readonly http11AbsoluteFormWithHostStatus: number;
  readonly http10AbsoluteFormWithoutHostStatus: number;
  readonly transportFinishedBody: string;
  readonly transportSettlementStarted: boolean;
  readonly closeWaitedForTransportSettlement: boolean;
}

const responseSnapshot = async (response: Response): Promise<ProbeResponse> => ({
  status: response.status,
  body: await response.text(),
  contentType: response.headers.get('content-type'),
  contentLength: response.headers.get('content-length'),
  cacheControl: response.headers.get('cache-control'),
  pragma: response.headers.get('pragma'),
});

interface RawHeaderRequestOptions {
  readonly contentLength: number;
  readonly host?: string;
  readonly origin?: string;
  readonly cookie?: string;
}

const rawHeaderResponse = async (
  port: number,
  options: RawHeaderRequestOptions,
): Promise<ProbeResponse> =>
  new Promise<ProbeResponse>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (allowIncompleteBody = false): boolean => {
      const response = Buffer.concat(chunks);
      const headerEnd = response.indexOf('\r\n\r\n');
      if (headerEnd === -1) return false;
      const rawHeaders = response.subarray(0, headerEnd).toString('utf8');
      const [statusLine = '', ...headerLines] = rawHeaders.split('\r\n');
      const match = /^HTTP\/1\.1 (\d{3})/u.exec(statusLine);
      if (match === null) {
        settled = true;
        reject(new Error('The Bun listener did not return an HTTP status line.'));
        return true;
      }
      const headers = new Headers();
      for (const line of headerLines) {
        const separator = line.indexOf(':');
        if (separator === -1) continue;
        headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
      const declaredResponseLength = headers.get('content-length');
      const bodyStart = headerEnd + 4;
      const availableBodyLength = response.byteLength - bodyStart;
      const expectedBodyLength =
        declaredResponseLength !== null && /^\d+$/u.test(declaredResponseLength)
          ? Number(declaredResponseLength)
          : undefined;
      if (
        !allowIncompleteBody &&
        (expectedBodyLength === undefined || availableBodyLength < expectedBodyLength)
      ) {
        return false;
      }
      const bodyLength = expectedBodyLength ?? availableBodyLength;
      settled = true;
      socket.destroy();
      resolve({
        status: Number(match[1]),
        body: response.subarray(bodyStart, bodyStart + bodyLength).toString('utf8'),
        contentType: headers.get('content-type'),
        contentLength: declaredResponseLength,
        cacheControl: headers.get('cache-control'),
        pragma: headers.get('pragma'),
      });
      return true;
    };

    socket.setTimeout(3_000);
    socket.once('connect', () => {
      const host = options.host ?? `127.0.0.1:${port}`;
      const origin = options.origin ?? `http://${host}`;
      socket.write(
        [
          'POST /api/videos HTTP/1.1',
          `Host: ${host}`,
          `Origin: ${origin}`,
          'Content-Type: video/mp4',
          `Content-Length: ${options.contentLength}`,
          ...(options.cookie === undefined ? [] : [`Cookie: ${options.cookie}`]),
          'Connection: close',
          '',
          '',
        ].join('\r\n'),
      );
    });
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      chunks.push(chunk);
      finish();
    });
    socket.once('end', () => {
      if (!settled && !finish(true)) {
        reject(new Error('The Bun listener closed without returning an HTTP response.'));
      }
    });
    socket.once('timeout', () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error('The Bun listener waited for a request body after rejecting its headers.'));
    });
    socket.once('error', (error) => {
      if (settled) return;
      if (finish(true)) return;
      settled = true;
      reject(error);
    });
  });

const rawStatus = async (port: number, request: string): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let received = Buffer.alloc(0);
    let settled = false;
    socket.once('connect', () => socket.write(request));
    socket.on('data', (chunk: Buffer) => {
      if (settled) return;
      received = Buffer.concat([received, chunk]);
      const statusLineEnd = received.indexOf('\r\n');
      if (statusLineEnd === -1) return;
      const match = /^HTTP\/1\.[01] (\d{3})/u.exec(
        received.subarray(0, statusLineEnd).toString('utf8'),
      );
      if (match === null) {
        settled = true;
        socket.destroy();
        reject(new Error('The Bun compatibility listener did not return an HTTP status line.'));
        return;
      }
      settled = true;
      socket.destroy();
      resolve(Number(match[1]));
    });
    socket.once('error', (error) => {
      if (!settled) reject(error);
    });
  });

export const runBunRuntimeContractProbe = async (): Promise<BunRuntimeContractProbeResult> => {
  const staticRoot = await mkdtemp(path.join(tmpdir(), 'lightframe-bun-static-'));
  await writeFile(path.join(staticRoot, 'index.html'), '<!doctype html><title>Studio</title>');
  await writeFile(path.join(staticRoot, 'asset.txt'), 'static bytes');
  await mkdir(path.join(staticRoot, 'api'));
  await writeFile(path.join(staticRoot, 'api', 'shadow'), 'must never be served');

  const application = createApp({
    config: testConfig(),
    staticRoot,
  });
  let transportSettlementStarted = false;
  let releaseTransportSettlement: (() => void) | undefined;
  const transportSettlementGate = new Promise<void>((resolve) => {
    releaseTransportSettlement = resolve;
  });
  application.get('/transport-finish-probe', (_request, reply) => {
    const bytes = Buffer.from('transport-finished');
    reply.header('Content-Length', bytes.byteLength);
    return reply.sendStream(Readable.from([bytes]), {
      onComplete: async () => {
        transportSettlementStarted = true;
        await transportSettlementGate;
      },
    });
  });
  application.delete('/bodyless-delete-probe', (_request, reply) => reply.status(204).send());
  const secureApplication = createApp({
    config: testConfig({ demoAuthEnabled: true }),
  });
  let duplicateApplication: ReturnType<typeof createApp> | undefined;

  try {
    await application.listen({ host: '127.0.0.1', port: 0 });
    const address = application.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The Bun listener did not expose its bound address.');
    }
    const origin = `http://127.0.0.1:${address.port}`;

    const health = await responseSnapshot(await fetch(`${origin}/api/health`));
    const healthHead = await responseSnapshot(
      await fetch(`${origin}/api/health`, { method: 'HEAD' }),
    );
    const trailingSlash = await responseSnapshot(await fetch(`${origin}/api/health/`));
    const staticAsset = await responseSnapshot(await fetch(`${origin}/asset.txt`));
    const staticBadHost = await responseSnapshot(
      await fetch(`${origin}/asset.txt`, { headers: { host: 'studio.example.com' } }),
    );
    const spaHtml = await responseSnapshot(
      await fetch(`${origin}/studio/route`, { headers: { accept: 'text/html' } }),
    );
    const spaJson = await responseSnapshot(
      await fetch(`${origin}/studio/route`, { headers: { accept: 'application/json' } }),
    );
    const apiStaticShadow = await responseSnapshot(
      await fetch(`${origin}/api/shadow`, { headers: { accept: 'text/html' } }),
    );
    const bodylessDelete = await responseSnapshot(
      await fetch(`${origin}/bodyless-delete-probe`, { method: 'DELETE' }),
    );

    duplicateApplication = createApp({ config: testConfig() });
    let duplicateBindRejected = false;
    try {
      await duplicateApplication.listen({ host: '127.0.0.1', port: address.port });
    } catch {
      duplicateBindRejected = true;
    }

    await secureApplication.listen({ host: '127.0.0.1', port: 0 });
    const secureAddress = secureApplication.server.address();
    if (secureAddress === null || typeof secureAddress === 'string') {
      throw new Error('The secure Bun listener did not expose its bound address.');
    }

    let unauthorizedBodyPulls = 0;
    const unauthorizedBody = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          unauthorizedBodyPulls += 1;
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const unauthorizedBodyResponse = await secureApplication.inject({
      method: 'POST',
      url: '/api/videos',
      headers: {
        host: 'localhost:4173',
        origin: 'http://localhost:4173',
        'content-type': 'video/mp4',
      },
      payload: unauthorizedBody,
    });
    const unauthorizedDeclaredBody = await rawHeaderResponse(secureAddress.port, {
      contentLength: 1,
    });
    const unauthorizedOverGlobalCeiling = await rawHeaderResponse(secureAddress.port, {
      contentLength: MAX_REQUEST_BODY_BYTES + 1,
    });
    const maliciousHostOversizedBody = await rawHeaderResponse(secureAddress.port, {
      contentLength: Number.MAX_SAFE_INTEGER - 1,
      host: 'studio.example.com',
      origin: 'http://studio.example.com',
    });
    const malformedHostResponses = await Promise.all(
      ['localhost:abc', '[::1', '%', 'localhost:99999'].map((host) =>
        rawHeaderResponse(secureAddress.port, {
          contentLength: 1,
          host,
          origin: `http://127.0.0.1:${secureAddress.port}`,
        }),
      ),
    );
    const healthAfterMalformedHosts = await responseSnapshot(
      await fetch(`http://127.0.0.1:${secureAddress.port}/api/health`),
    );

    const login = await secureApplication.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: 'localhost:4173',
        origin: 'http://localhost:4173',
        'content-type': 'application/json',
      },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const setCookie = login.headers['set-cookie'];
    if (login.statusCode !== 200 || typeof setCookie !== 'string') {
      throw new Error('The Bun boundary probe could not establish an authenticated session.');
    }
    const sessionCookie = setCookie.split(';', 1)[0];
    if (sessionCookie === undefined || sessionCookie.length === 0) {
      throw new Error('The Bun boundary probe received an invalid session cookie.');
    }
    const authorizedRouteLimitExceeded = await rawHeaderResponse(secureAddress.port, {
      contentLength: VIDEO_RESULT_MAX_BYTES + 1,
      cookie: sessionCookie,
    });
    const http11AbsoluteFormWithHostStatus = await rawStatus(
      address.port,
      `GET http://127.0.0.1:${address.port}/api/health HTTP/1.1\r\nHost: 127.0.0.1:${address.port}\r\nConnection: close\r\n\r\n`,
    );
    const http10AbsoluteFormWithoutHostStatus = await rawStatus(
      address.port,
      `GET http://127.0.0.1:${address.port}/api/health HTTP/1.0\r\nConnection: close\r\n\r\n`,
    );

    const transportFinishedBody = await Promise.race([
      fetch(`${origin}/transport-finish-probe`).then(async (response) => response.text()),
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('The response body waited for transport settlement before finishing.'));
        }, 2_000);
        timer.unref?.();
      }),
    ]);

    const firstClose = application.close();
    const secondClose = application.close();
    const repeatedCloseUsesSamePromise = firstClose === secondClose;
    const closeWaitedForTransportSettlement = !(await Promise.race([
      firstClose.then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 50).unref?.();
      }),
    ]));
    releaseTransportSettlement?.();
    await firstClose;

    return {
      health,
      healthHead,
      trailingSlash,
      staticAsset,
      staticBadHost,
      spaHtml,
      spaJson,
      apiStaticShadow,
      bodylessDelete,
      duplicateBindRejected,
      repeatedCloseUsesSamePromise,
      unauthorizedBodyPulls,
      unauthorizedBodyStatus: unauthorizedBodyResponse.statusCode,
      unauthorizedDeclaredBody,
      unauthorizedOverGlobalCeiling,
      maliciousHostOversizedBody,
      malformedHostResponses,
      healthAfterMalformedHosts,
      authorizedRouteLimitExceeded,
      http11AbsoluteFormWithHostStatus,
      http10AbsoluteFormWithoutHostStatus,
      transportFinishedBody,
      transportSettlementStarted,
      closeWaitedForTransportSettlement,
    };
  } finally {
    await Promise.allSettled([
      application.close(),
      secureApplication.close(),
      duplicateApplication?.close() ?? Promise.resolve(),
    ]);
    await rm(staticRoot, { recursive: true, force: true });
  }
};

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await runBunRuntimeContractProbe())}\n`);
}
