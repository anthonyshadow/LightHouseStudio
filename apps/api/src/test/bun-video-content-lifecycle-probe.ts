import { connect, type Socket } from 'node:net';
import { access, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AuthenticatedUser } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { ApplicationRuntime, type HttpRequest } from '../application/application-runtime.js';
import { registerRealtimeRoutes } from '../features/realtime/routes.js';
import { registerVideoJobRoutes } from '../features/video-jobs/routes.js';
import type { VideoJobService } from '../features/video-jobs/video-job-service.js';
import type { DecartTokenProvider, TokenRequestScope } from '../providers/decart/token-provider.js';

const OWNER_ID = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const FULL_GET_JOB_ID = '6ff4e0d6-a571-41f5-a26d-8b42e508b298';
const HEAD_JOB_ID = '726fbcfb-1a91-4430-abec-ffcd418788bf';
const CANCEL_JOB_ID = 'db8c9fcf-8db3-43ce-a60a-8e042761c006';
const CANCEL_FILE_BYTES = 64 * 1_024 * 1_024;

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason?: unknown): void;
}

const deferred = <Value>(): Deferred<Value> => {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const withDeadline = async <Value>(
  operation: Promise<Value>,
  description: string,
  timeoutMs = 5_000,
): Promise<Value> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}.`)), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

const waitUntil = async (condition: () => boolean, description: string): Promise<void> => {
  const completion = deferred<void>();
  const startedAt = performance.now();
  const poll = (): void => {
    if (condition()) {
      completion.resolve(undefined);
      return;
    }
    if (performance.now() - startedAt >= 5_000) {
      completion.reject(new Error(`Timed out waiting for ${description}.`));
      return;
    }
    setTimeout(poll, 10);
  };
  poll();
  await completion.promise;
};

const fileWasRemoved = async (filePath: string): Promise<boolean> =>
  access(filePath).then(
    () => false,
    () => true,
  );

const testUser = (now: string): AuthenticatedUser => ({
  id: OWNER_ID,
  login: 'demo@lightframe.local',
  username: 'demo',
  email: 'demo@lightframe.local',
  displayName: 'Demo Creator',
  avatarUrl: null,
  planId: 'free',
  role: 'user',
  status: 'active',
  createdAt: now,
  updatedAt: now,
  lastLoginAt: now,
});

const installTestAuthentication = (application: ApplicationRuntime): void => {
  application.addHook('onRequest', (request: HttpRequest) => {
    const now = new Date().toISOString();
    request.auth = {
      user: testUser(now),
      entitlements: createPhaseOneEntitlements('free', now),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  });
};

const trustedHeaders = (port: number): Record<string, string> => ({
  origin: `http://127.0.0.1:${port}`,
  'x-lightframe-provider-intent': 'video',
});

const requestAndDisconnectAfterBody = async (port: number, requestPath: string): Promise<number> =>
  withDeadline(
    new Promise<number>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1');
      let received = Buffer.alloc(0);
      let headerEnd = -1;
      let settled = false;
      let resumeTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (bodyBytes: number): void => {
        if (settled) return;
        settled = true;
        if (resumeTimer !== undefined) clearTimeout(resumeTimer);
        socket.destroy();
        resolve(bodyBytes);
      };
      socket.once('connect', () => {
        socket.pause();
        socket.write(
          [
            `GET ${requestPath} HTTP/1.1`,
            `Host: 127.0.0.1:${port}`,
            `Origin: http://127.0.0.1:${port}`,
            'X-Lightframe-Provider-Intent: video',
            'Connection: keep-alive',
            '',
            '',
          ].join('\r\n'),
        );
        resumeTimer = setTimeout(() => socket.resume(), 100);
      });
      socket.on('data', (chunk: Buffer) => {
        if (settled) return;
        received = Buffer.concat([received, chunk]);
        if (headerEnd === -1) headerEnd = received.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const bodyBytes = received.byteLength - (headerEnd + 4);
        if (bodyBytes > 0) finish(bodyBytes);
      });
      socket.once('end', () => {
        if (!settled) reject(new Error('The response ended before the client could disconnect.'));
      });
      socket.once('error', (error) => {
        if (!settled) reject(error);
      });
    }),
    'the first video response bytes',
  );

const openStalledProviderRequest = async (port: number): Promise<Socket> => {
  const socket = connect(port, '127.0.0.1');
  await withDeadline(
    new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    }),
    'the provider-wait request socket',
  );
  const body = JSON.stringify({ model: 'lucy-latest' });
  socket.write(
    [
      'POST /api/realtime-token HTTP/1.1',
      `Host: 127.0.0.1:${port}`,
      `Origin: http://127.0.0.1:${port}`,
      'Content-Type: application/json',
      `Content-Length: ${Buffer.byteLength(body)}`,
      'Connection: keep-alive',
      '',
      body,
    ].join('\r\n'),
  );
  return socket;
};

interface VideoLifecycleResult {
  readonly status: number;
  readonly bodyBytes: number;
  readonly contentLength: string | null;
  readonly settleCalls: readonly boolean[];
  readonly fileRemoved: boolean;
}

export interface BunVideoContentLifecycleProbeResult {
  readonly fullGet: VideoLifecycleResult;
  readonly head: VideoLifecycleResult & {
    readonly filePresentBeforeSettlementRelease: boolean;
  };
  readonly disconnectedGet: Omit<VideoLifecycleResult, 'status' | 'contentLength'>;
  readonly providerWait: {
    readonly started: boolean;
    readonly abortCalls: number;
    readonly abortReason: string | null;
  };
}

export const runBunVideoContentLifecycleProbe =
  async (): Promise<BunVideoContentLifecycleProbeResult> => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-bun-video-lifecycle-'));
    const fullGetPath = path.join(directory, 'full-get.mp4');
    const headPath = path.join(directory, 'head.mp4');
    const cancelPath = path.join(directory, 'cancel.mp4');
    const fullGetBytes = Buffer.from('complete-video-response');
    const headBytes = Buffer.from('head-video-response');
    await Promise.all([
      writeFile(fullGetPath, fullGetBytes),
      writeFile(headPath, headBytes),
      writeFile(cancelPath, new Uint8Array()),
    ]);
    await truncate(cancelPath, CANCEL_FILE_BYTES);

    const fileByJob = new Map([
      [FULL_GET_JOB_ID, { path: fullGetPath, sizeBytes: fullGetBytes.byteLength }],
      [HEAD_JOB_ID, { path: headPath, sizeBytes: headBytes.byteLength }],
      [CANCEL_JOB_ID, { path: cancelPath, sizeBytes: CANCEL_FILE_BYTES }],
    ]);
    const settlements = new Map<string, boolean[]>();
    const headSettlementRelease = deferred<void>();
    let headSettlementStarted = false;
    const videoService = {
      available: true,
      content: (jobId: string, ownerId: string) => {
        if (ownerId !== OWNER_ID)
          throw new Error('The probe received the wrong authenticated owner.');
        const file = fileByJob.get(jobId);
        if (file === undefined) throw new Error('The probe received an unknown video job ID.');
        return Promise.resolve({
          path: file.path,
          media: { mimeType: 'video/mp4', sizeBytes: file.sizeBytes },
          settle: async (delivered: boolean) => {
            const calls = settlements.get(jobId) ?? [];
            calls.push(delivered);
            settlements.set(jobId, calls);
            if (jobId === HEAD_JOB_ID && delivered) {
              headSettlementStarted = true;
              await headSettlementRelease.promise;
            }
            await rm(file.path, { force: true });
          },
        });
      },
    } as unknown as VideoJobService;

    const providerStarted = deferred<void>();
    let providerStartedObserved = false;
    let providerAbortCalls = 0;
    let providerAbortReason: string | null = null;
    const stalledProvider: DecartTokenProvider = {
      createToken: (scope: TokenRequestScope) => {
        providerStartedObserved = true;
        providerStarted.resolve(undefined);
        return new Promise((_resolve, reject) => {
          const abort = (): void => {
            providerAbortCalls += 1;
            providerAbortReason = String(scope.signal.reason ?? 'request-aborted');
            reject(new Error('The probe provider request was cancelled.'));
          };
          if (scope.signal.aborted) abort();
          else scope.signal.addEventListener('abort', abort, { once: true });
        });
      },
    };

    const application = new ApplicationRuntime({ logger: false });
    installTestAuthentication(application);
    registerVideoJobRoutes(application, videoService);
    registerRealtimeRoutes(application, stalledProvider, true);

    try {
      await application.listen({ host: '127.0.0.1', port: 0 });
      const address = application.server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('The Bun video lifecycle probe did not receive a listener address.');
      }
      const origin = `http://127.0.0.1:${address.port}`;

      const fullGetResponse = await fetch(`${origin}/api/video-jobs/${FULL_GET_JOB_ID}/content`, {
        headers: trustedHeaders(address.port),
      });
      const receivedFullGetBytes = (await fullGetResponse.arrayBuffer()).byteLength;
      await waitUntil(
        () => (settlements.get(FULL_GET_JOB_ID)?.length ?? 0) === 1,
        'the complete video lease settlement',
      );

      const headResponse = await withDeadline(
        fetch(`${origin}/api/video-jobs/${HEAD_JOB_ID}/content`, {
          method: 'HEAD',
          headers: trustedHeaders(address.port),
        }),
        'the HEAD response before settlement cleanup completes',
      );
      const receivedHeadBytes = (await headResponse.arrayBuffer()).byteLength;
      await waitUntil(() => headSettlementStarted, 'the HEAD video lease settlement');
      const headFilePresentBeforeSettlementRelease = !(await fileWasRemoved(headPath));
      headSettlementRelease.resolve(undefined);
      await withDeadline(
        (async () => {
          while (!(await fileWasRemoved(headPath)))
            await new Promise((resolve) => setTimeout(resolve, 10));
        })(),
        'the HEAD artifact cleanup',
      );

      const disconnectedBodyBytes = await requestAndDisconnectAfterBody(
        address.port,
        `/api/video-jobs/${CANCEL_JOB_ID}/content`,
      );
      await waitUntil(
        () => (settlements.get(CANCEL_JOB_ID)?.length ?? 0) === 1,
        'the disconnected video lease settlement',
      );

      const providerSocket = await openStalledProviderRequest(address.port);
      await withDeadline(providerStarted.promise, 'the stalled provider handler');
      providerSocket.destroy();
      await waitUntil(() => providerAbortCalls === 1, 'the stalled provider cancellation');

      return {
        fullGet: {
          status: fullGetResponse.status,
          bodyBytes: receivedFullGetBytes,
          contentLength: fullGetResponse.headers.get('content-length'),
          settleCalls: settlements.get(FULL_GET_JOB_ID) ?? [],
          fileRemoved: await fileWasRemoved(fullGetPath),
        },
        head: {
          status: headResponse.status,
          bodyBytes: receivedHeadBytes,
          contentLength: headResponse.headers.get('content-length'),
          settleCalls: settlements.get(HEAD_JOB_ID) ?? [],
          fileRemoved: await fileWasRemoved(headPath),
          filePresentBeforeSettlementRelease: headFilePresentBeforeSettlementRelease,
        },
        disconnectedGet: {
          bodyBytes: disconnectedBodyBytes,
          settleCalls: settlements.get(CANCEL_JOB_ID) ?? [],
          fileRemoved: await fileWasRemoved(cancelPath),
        },
        providerWait: {
          started: providerStartedObserved,
          abortCalls: providerAbortCalls,
          abortReason: providerAbortReason,
        },
      };
    } finally {
      headSettlementRelease.resolve(undefined);
      await application.close();
      await rm(directory, { recursive: true, force: true });
    }
  };

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await runBunVideoContentLifecycleProbe())}\n`);
}
