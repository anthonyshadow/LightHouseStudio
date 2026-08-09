import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, open, readdir, rm, stat } from 'node:fs/promises';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ApplicationRuntime, type HttpRequest } from '../application/application-runtime.js';
import { isSpooledAudioUpload, type SpooledAudioUpload } from '../application/spooled-upload.js';
import { parseVideoJobMultipart } from '../features/video-jobs/multipart.js';
import { AppError } from '../http/app-error.js';

const UPLOAD_LIMIT_BYTES = 300_000_000;
const MULTIPART_LIMIT_BYTES = 310_551_296;
const CLIENT_CHUNK_BYTES = 1_024 * 1_024;
const REAL_SOCKET_CANCEL_BYTES = 16 * CLIENT_CHUNK_BYTES;
const UPLOAD_DIRECTORY_PREFIX = 'lightframe-voice-upload-';
const executeFile = promisify(execFile);

interface RawResponse {
  readonly status: number;
  readonly body: string;
}

interface UploadResponseBody {
  readonly byteLength: number;
  readonly checksumSha256: string;
  readonly cleanupConfirmed: boolean;
  readonly baselineRssBytes: number;
  readonly peakRssBytes: number;
}

interface MultipartResponseBody {
  readonly byteLength: number;
  readonly cleanupConfirmed: boolean;
  readonly operation: string;
  readonly baselineRssBytes: number;
  readonly peakRssBytes: number;
}

interface ProbeState {
  readonly newUploadDirectories: readonly string[];
  readonly rssBytes: number;
}

interface InternalCancelResult {
  readonly temporaryDirectoryObserved: boolean;
  readonly cleanupConfirmed: boolean;
  readonly bodyCancelObserved: boolean;
  readonly status: number;
}

interface ChildReadyMessage {
  readonly type: 'ready';
  readonly port: number;
  readonly cancelled: InternalCancelResult;
}

export interface BunMediaBoundaryProbeResult {
  readonly exact: {
    readonly status: number;
    readonly byteLength: number;
    readonly checksumSha256: string;
    readonly cleanupConfirmed: boolean;
    readonly durationMs: number;
    readonly baselineRssBytes: number;
    readonly peakRssBytes: number;
    readonly peakRssDeltaBytes: number;
    readonly clientPeakQueuedBytes: number;
    readonly clientDrainEvents: number;
  };
  readonly declaredOverLimit: {
    readonly status: number;
    readonly errorCode: string | undefined;
  };
  readonly multipart: {
    readonly status: number;
    readonly byteLength: number;
    readonly cleanupConfirmed: boolean;
    readonly operation: string;
    readonly durationMs: number;
    readonly baselineRssBytes: number;
    readonly peakRssBytes: number;
    readonly peakRssDeltaBytes: number;
  };
  readonly cancelled: {
    readonly temporaryDirectoryObserved: boolean;
    readonly cleanupConfirmed: boolean;
    readonly bodyCancelObserved: boolean;
    readonly status: number;
  };
  readonly realSocketCancel: {
    readonly bytesSent: number;
    readonly temporaryDirectoryObserved: boolean;
    readonly cleanupConfirmed: boolean;
  };
  readonly finalNewUploadDirectories: readonly string[];
  readonly totalDurationMs: number;
}

const listUploadDirectories = async (): Promise<readonly string[]> =>
  (await readdir(tmpdir(), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(UPLOAD_DIRECTORY_PREFIX))
    .map((entry) => entry.name)
    .sort();

const pathWasRemoved = async (candidate: string): Promise<boolean> =>
  stat(candidate).then(
    () => false,
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT',
  );

const wasRemoved = (upload: SpooledAudioUpload): Promise<boolean> => pathWasRemoved(upload.path);

const installProbeErrorHandler = (application: ApplicationRuntime): void => {
  application.setErrorHandler((error, _request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError(500, 'internal_error', 'The probe could not complete the request.');
    reply.status(appError.statusCode).send({
      error: { code: appError.code, message: appError.message },
    });
  });
};

const waitForUploadDirectories = async (
  predicate: (directories: readonly string[]) => boolean,
  timeoutMs = 5_000,
): Promise<readonly string[]> => {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const directories = await listUploadDirectories();
    if (predicate(directories)) return directories;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The media probe temporary-directory state did not converge.');
};

const runInternalCancelProbe = async (
  application: ApplicationRuntime,
): Promise<InternalCancelResult> => {
  const before = new Set(await listUploadDirectories());
  const controller = new AbortController();
  let bodyCancelObserved = false;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      streamController.enqueue(new Uint8Array(CLIENT_CHUNK_BYTES));
    },
    cancel() {
      bodyCancelObserved = true;
    },
  });
  const pending = application.handle(
    new Request('http://localhost/probe/media', {
      method: 'POST',
      headers: {
        host: 'localhost',
        'content-type': 'application/octet-stream',
        'x-probe-case': 'internal-cancel',
      },
      body,
      signal: controller.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }),
  );
  const active = await waitForUploadDirectories((directories) =>
    directories.some((directory) => !before.has(directory)),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort('probe-client-disconnected');
  const response = await pending;
  const cleaned = await waitForUploadDirectories((directories) =>
    directories.every((directory) => before.has(directory)),
  );
  return {
    temporaryDirectoryObserved: active.some((directory) => !before.has(directory)),
    cleanupConfirmed: cleaned.every((directory) => before.has(directory)),
    bodyCancelObserved,
    status: response.status,
  };
};

const runServer = async (): Promise<never> => {
  const initialUploadDirectories = new Set(await listUploadDirectories());
  const application = new ApplicationRuntime({
    connectionTimeoutMs: 30_000,
    receiveTimeoutMs: 30_000,
  });
  let measuringUpload = false;
  let baselineRssBytes = process.memoryUsage.rss();
  let peakRssBytes = baselineRssBytes;

  application.addHook('onRequest', (request: HttpRequest) => {
    if (
      request.method === 'POST' &&
      ((request.url === '/probe/media' && request.headers['x-probe-case'] === 'exact') ||
        (request.url === '/probe/multipart' && request.headers['x-probe-case'] === 'multipart'))
    ) {
      measuringUpload = true;
      baselineRssBytes = process.memoryUsage.rss();
      peakRssBytes = baselineRssBytes;
    }
  });
  application.post(
    '/probe/media',
    {
      bodyLimit: UPLOAD_LIMIT_BYTES,
      bodyParser: 'spooled',
      acceptedContentTypes: ['application/octet-stream'],
    },
    async (request) => {
      if (!isSpooledAudioUpload(request.body)) {
        throw new Error('The media probe route did not receive a spooled upload.');
      }
      const upload = request.body;
      const byteLength = upload.byteLength;
      const checksumSha256 = upload.checksumSha256;
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
      await upload.cleanup();
      const cleanupConfirmed = await wasRemoved(upload);
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
      measuringUpload = false;
      return {
        byteLength,
        checksumSha256,
        cleanupConfirmed,
        baselineRssBytes,
        peakRssBytes,
      } satisfies UploadResponseBody;
    },
  );
  application.post(
    '/probe/multipart',
    {
      bodyLimit: MULTIPART_LIMIT_BYTES,
      bodyParser: 'multipart',
    },
    async (request) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-media-multipart-probe-'));
      const inputPath = path.join(directory, 'input.video');
      const referencePath = path.join(directory, 'reference.image');
      try {
        const parsed = await parseVideoJobMultipart(
          request.raw,
          { inputPath, referencePath },
          MULTIPART_LIMIT_BYTES,
          request.signal,
        );
        request.markBodyReceived();
        const input = await stat(inputPath);
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
        await rm(directory, { recursive: true, force: true });
        const cleanupConfirmed = await pathWasRemoved(directory);
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
        measuringUpload = false;
        return {
          byteLength: input.size,
          cleanupConfirmed,
          operation: parsed.recipe.operation,
          baselineRssBytes,
          peakRssBytes,
        } satisfies MultipartResponseBody;
      } catch (error) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        measuringUpload = false;
        throw error;
      }
    },
  );
  application.get('/probe/state', async () => {
    const currentUploadDirectories = await listUploadDirectories();
    return {
      newUploadDirectories: currentUploadDirectories.filter(
        (directory) => !initialUploadDirectories.has(directory),
      ),
      rssBytes: process.memoryUsage.rss(),
    } satisfies ProbeState;
  });
  installProbeErrorHandler(application);
  const internalCancelResult = await runInternalCancelProbe(application);

  const sample = setInterval(() => {
    if (measuringUpload) {
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage.rss());
    }
  }, 5);
  sample.unref();

  const close = async (): Promise<never> => {
    clearInterval(sample);
    await application.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());

  await application.listen({ host: '127.0.0.1', port: 0 });
  const address = application.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The media probe server did not expose its bound address.');
  }
  process.stdout.write(
    `${JSON.stringify({ type: 'ready', port: address.port, cancelled: internalCancelResult })}\n`,
  );
  return await new Promise<never>(() => undefined);
};

const parseRawResponse = (bytes: Buffer): RawResponse => {
  const headerEnd = bytes.indexOf('\r\n\r\n');
  if (headerEnd === -1) throw new Error('The media probe received an incomplete HTTP response.');
  const headers = bytes.subarray(0, headerEnd).toString('utf8');
  const status = /^HTTP\/1\.1 (\d{3})/u.exec(headers)?.[1];
  if (status === undefined) throw new Error('The media probe received an invalid HTTP status.');
  return {
    status: Number(status),
    body: bytes.subarray(headerEnd + 4).toString('utf8'),
  };
};

const requestHeaders = (port: number, contentLength: number, probeCase: string): string =>
  [
    'POST /probe/media HTTP/1.1',
    `Host: 127.0.0.1:${port}`,
    'Content-Type: application/octet-stream',
    `Content-Length: ${contentLength}`,
    `X-Probe-Case: ${probeCase}`,
    'Connection: close',
    '',
    '',
  ].join('\r\n');

type StreamingUploadResponse = RawResponse & {
  readonly peakQueuedBytes: number;
  readonly drainEvents: number;
};

const uploadExactBody = async (port: number): Promise<StreamingUploadResponse> =>
  new Promise((resolve, reject) => {
    const reusableChunk = Buffer.alloc(CLIENT_CHUNK_BYTES, 0x61);
    let peakQueuedBytes = 0;
    let drainEvents = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clientRequest.destroy();
      reject(error);
    };
    const clientRequest = httpRequest({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/probe/media',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': UPLOAD_LIMIT_BYTES,
        'X-Probe-Case': 'exact',
        Expect: '100-continue',
        Connection: 'close',
      },
    });
    clientRequest.setTimeout(40_000, () => fail(new Error('The media upload timed out.')));
    clientRequest.once('error', fail);
    clientRequest.once('response', (response) => {
      const responseChunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => responseChunks.push(chunk));
      response.once('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(responseChunks).toString('utf8'),
          peakQueuedBytes,
          drainEvents,
        });
      });
    });
    clientRequest.once('continue', () => {
      void (async () => {
        const writeChunk = async (chunk: Buffer): Promise<void> => {
          const accepted = clientRequest.write(chunk);
          peakQueuedBytes = Math.max(
            peakQueuedBytes,
            clientRequest.writableLength,
            accepted ? 0 : chunk.byteLength,
          );
          if (!accepted) {
            drainEvents += 1;
            await once(clientRequest, 'drain');
          }
        };
        let sent = 0;
        while (sent < UPLOAD_LIMIT_BYTES) {
          const remaining = UPLOAD_LIMIT_BYTES - sent;
          const chunk =
            remaining >= reusableChunk.byteLength
              ? reusableChunk
              : reusableChunk.subarray(0, remaining);
          await writeChunk(chunk);
          sent += chunk.byteLength;
        }
        clientRequest.end();
      })().catch((error: unknown) =>
        fail(error instanceof Error ? error : new Error('The media upload failed.')),
      );
    });
    clientRequest.flushHeaders();
  });

const multipartRecipe = JSON.stringify({
  operation: 'character-swap',
  inputKind: 'character',
  prompt: 'Change the lighting',
  enhancePrompt: false,
  hasReferenceImage: false,
  outputResolution: '720p',
});

const uploadMultipartBody = async (port: number): Promise<RawResponse> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-multipart-source-'));
  const fixturePath = path.join(directory, 'source.mp4');
  const fixture = await open(fixturePath, 'wx', 0o600);
  try {
    await fixture.truncate(UPLOAD_LIMIT_BYTES);
  } finally {
    await fixture.close();
  }
  try {
    const { stdout } = await executeFile(
      'curl',
      [
        '--silent',
        '--show-error',
        '--max-time',
        '40',
        '--http1.1',
        '--header',
        'X-Probe-Case: multipart',
        '--form-string',
        `request=${multipartRecipe}`,
        '--form',
        `data=@${fixturePath};type=video/mp4;filename=source.mp4`,
        '--write-out',
        '\n%{http_code}',
        `http://127.0.0.1:${port}/probe/multipart`,
      ],
      { encoding: 'utf8', maxBuffer: 1_024 * 1_024, timeout: 45_000 },
    );
    const separator = stdout.lastIndexOf('\n');
    if (separator === -1) throw new Error('The multipart curl probe did not return a status.');
    return {
      status: Number(stdout.slice(separator + 1)),
      body: stdout.slice(0, separator),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const requestWithDeclaredLength = async (
  port: number,
  contentLength: number,
): Promise<RawResponse> =>
  new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    const responseChunks: Buffer[] = [];
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(5_000, () => fail(new Error('The declared-length request timed out.')));
    socket.on('data', (chunk: Buffer) => responseChunks.push(chunk));
    socket.once('error', fail);
    socket.once('end', () => {
      if (settled) return;
      settled = true;
      try {
        resolve(parseRawResponse(Buffer.concat(responseChunks)));
      } catch (error) {
        reject(
          error instanceof Error ? error : new Error('The HTTP response could not be parsed.'),
        );
      }
    });
    socket.once('connect', () => {
      socket.write(requestHeaders(port, contentLength, 'declared-over-limit'));
    });
  });

const readState = async (port: number): Promise<ProbeState> => {
  const response = await fetch(`http://127.0.0.1:${port}/probe/state`, {
    signal: AbortSignal.timeout(1_000),
  });
  if (!response.ok) throw new Error(`The media probe state route returned ${response.status}.`);
  return (await response.json()) as ProbeState;
};

const pollState = async (
  port: number,
  predicate: (state: ProbeState) => boolean,
  timeoutMs: number,
): Promise<ProbeState | undefined> => {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const state = await readState(port);
      if (predicate(state)) return state;
    } catch {
      // The probe reports a bounded visibility gap instead of hanging or
      // weakening the deterministic ApplicationRuntime.handle cancellation proof.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
};

const beginRealSocketCancel = async (
  port: number,
): Promise<{ readonly request: ClientRequest; readonly bytesSent: number }> =>
  new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/probe/media',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': UPLOAD_LIMIT_BYTES,
        'X-Probe-Case': 'real-socket-cancel',
        Expect: '100-continue',
        Connection: 'close',
      },
    });
    let resolved = false;
    request.setTimeout(5_000, () => {
      if (!resolved) request.destroy(new Error('The partial upload handshake timed out.'));
    });
    request.on('error', (error) => {
      if (!resolved) reject(error);
    });
    request.once('response', (response) => {
      response.resume();
      if (!resolved) reject(new Error(`The partial upload returned ${response.statusCode}.`));
    });
    request.once('continue', () => {
      void (async () => {
        const chunk = Buffer.alloc(CLIENT_CHUNK_BYTES, 0x64);
        let sent = 0;
        while (sent < REAL_SOCKET_CANCEL_BYTES) {
          if (!request.write(chunk)) await once(request, 'drain');
          sent += chunk.byteLength;
        }
        resolved = true;
        resolve({ request, bytesSent: sent });
      })().catch((error: unknown) =>
        reject(error instanceof Error ? error : new Error('The partial upload failed.')),
      );
    });
    request.flushHeaders();
  });

const runRealSocketCancelProbe = async (
  port: number,
): Promise<BunMediaBoundaryProbeResult['realSocketCancel']> => {
  const pending = await beginRealSocketCancel(port);
  const active = await pollState(port, (state) => state.newUploadDirectories.length > 0, 2_000);
  if (active !== undefined) await new Promise((resolve) => setTimeout(resolve, 50));
  pending.request.destroy(new Error('probe-client-disconnected'));
  const cleaned = await pollState(port, (state) => state.newUploadDirectories.length === 0, 3_000);
  return {
    bytesSent: pending.bytesSent,
    temporaryDirectoryObserved: active !== undefined,
    cleanupConfirmed: cleaned !== undefined,
  };
};

const waitForChildReady = async (
  child: ChildProcessWithoutNullStreams,
  stderr: () => string,
): Promise<ChildReadyMessage> => {
  let stdout = '';
  return await new Promise<ChildReadyMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`The media probe server did not start. ${stderr()}`.trim()));
    }, 10_000);
    const onData = (chunk: Buffer): void => {
      stdout += chunk.toString('utf8');
      const newline = stdout.indexOf('\n');
      if (newline === -1) return;
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      try {
        const ready = JSON.parse(stdout.slice(0, newline)) as ChildReadyMessage;
        if (ready.type !== 'ready' || !Number.isInteger(ready.port)) {
          throw new Error('The media probe server returned an invalid readiness message.');
        }
        resolve(ready);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error('The media probe readiness message could not be parsed.'),
        );
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(
        new Error(`The media probe server exited before readiness (${String(code)}). ${stderr()}`),
      );
    });
  });
};

const stopChild = async (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), 3_000);
  });
  const outcome = await Promise.race([exited, timeout]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);
  if (outcome === 'timeout') {
    child.kill('SIGKILL');
    await exited;
  }
};

export const runBunMediaBoundaryProbe = async (): Promise<BunMediaBoundaryProbeResult> => {
  const totalStartedAt = performance.now();
  const probePath = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, ['--no-env-file', probePath, '--server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let childStderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    childStderr += chunk.toString('utf8');
  });

  try {
    const { port, cancelled } = await waitForChildReady(child, () => childStderr);
    const exactStartedAt = performance.now();
    const exactResponse = await uploadExactBody(port);
    const exactDurationMs = performance.now() - exactStartedAt;
    const exactBody = JSON.parse(exactResponse.body) as UploadResponseBody;

    const declaredOverLimitResponse = await requestWithDeclaredLength(port, UPLOAD_LIMIT_BYTES + 1);
    const declaredOverLimitBody = JSON.parse(declaredOverLimitResponse.body) as {
      readonly error?: { readonly code?: string };
    };

    const multipartStartedAt = performance.now();
    const multipartResponse = await uploadMultipartBody(port);
    const multipartDurationMs = performance.now() - multipartStartedAt;
    const multipartBody = JSON.parse(multipartResponse.body) as MultipartResponseBody;

    const realSocketCancel = await runRealSocketCancelProbe(port);
    const cleanedState = await readState(port);

    return {
      exact: {
        status: exactResponse.status,
        byteLength: exactBody.byteLength,
        checksumSha256: exactBody.checksumSha256,
        cleanupConfirmed: exactBody.cleanupConfirmed,
        durationMs: exactDurationMs,
        baselineRssBytes: exactBody.baselineRssBytes,
        peakRssBytes: exactBody.peakRssBytes,
        peakRssDeltaBytes: exactBody.peakRssBytes - exactBody.baselineRssBytes,
        clientPeakQueuedBytes: exactResponse.peakQueuedBytes,
        clientDrainEvents: exactResponse.drainEvents,
      },
      declaredOverLimit: {
        status: declaredOverLimitResponse.status,
        errorCode: declaredOverLimitBody.error?.code,
      },
      multipart: {
        status: multipartResponse.status,
        byteLength: multipartBody.byteLength,
        cleanupConfirmed: multipartBody.cleanupConfirmed,
        operation: multipartBody.operation,
        durationMs: multipartDurationMs,
        baselineRssBytes: multipartBody.baselineRssBytes,
        peakRssBytes: multipartBody.peakRssBytes,
        peakRssDeltaBytes: multipartBody.peakRssBytes - multipartBody.baselineRssBytes,
      },
      cancelled,
      realSocketCancel,
      finalNewUploadDirectories: cleanedState.newUploadDirectories,
      totalDurationMs: performance.now() - totalStartedAt,
    };
  } finally {
    await stopChild(child);
  }
};

if (import.meta.main) {
  if (process.argv.includes('--server')) await runServer();
  else process.stdout.write(`${JSON.stringify(await runBunMediaBoundaryProbe())}\n`);
}
