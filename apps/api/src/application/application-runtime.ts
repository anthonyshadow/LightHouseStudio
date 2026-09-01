import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server as NodeServer } from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { staticPlugin } from '@elysiajs/static';
import { opentelemetry } from '@elysia/opentelemetry';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-node';
import { Elysia, type HTTPMethod } from 'elysia';
import pino, { type Logger } from 'pino';
import type { AuthenticatedUser, EntitlementSnapshot } from '@studio/contracts';
import { isSpooledUpload } from './spooled-upload.js';
import { AppError } from '../http/app-error.js';
import { currentTraceId, SanitizingSpanExporter } from '../observability/telemetry.js';
import {
  parseBody,
  requestInterruptionError,
  type BodyReaderOptions,
} from '../http/body-reader.js';
import {
  createClaimedStreamTransportSettlement,
  isStreamPayload,
  responseBodyWithTransport,
  type StreamLifecycle,
  type StreamPayload,
  type StreamTransportSettlement,
} from '../http/web-stream.js';

export type { StreamLifecycle } from '../http/web-stream.js';

export const MAX_REQUEST_BODY_BYTES = 310_551_296;
// Defensive only if this Elysia instance is ever listened to directly. The
// production node:http compatibility listener delegates body limits to routes.
const DIRECT_ELYSIA_MAX_REQUEST_BODY_BYTES = Number.MAX_SAFE_INTEGER;
const DEFAULT_JSON_BODY_BYTES = 1_024 * 1_024;
const DEFAULT_RECEIVE_TIMEOUT_MS = 100_000;

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
} as const;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const incomingRequestHasBody = (request: IncomingMessage): boolean => {
  const method = request.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return false;
  if (request.headers['transfer-encoding'] !== undefined) return true;
  const contentLength = request.headers['content-length'];
  return contentLength !== undefined && /^\d+$/u.test(contentLength) && Number(contentLength) > 0;
};

const requireLoopbackHost = (request: Request, allowModuleSentinel: boolean): void => {
  const host = request.headers.get('host');
  // Elysia precomputes always-static responses with an internal sentinel request.
  // The caller permits it only while the static plugin modules are initializing.
  if (allowModuleSentinel && host === null && new URL(request.url).hostname === 'ely.sia') return;
  if (
    host === null ||
    host.includes(',') ||
    host.includes('/') ||
    host.includes('\\') ||
    host.includes('@') ||
    host.includes('?') ||
    host.includes('#')
  ) {
    throw new AppError(
      421,
      'forbidden_origin',
      'This local Studio server accepts only loopback hosts.',
    );
  }
  let parsedHost: URL | undefined;
  try {
    parsedHost = new URL(`http://${host}`);
  } catch {
    parsedHost = undefined;
  }
  if (
    parsedHost === undefined ||
    parsedHost.username !== '' ||
    parsedHost.password !== '' ||
    parsedHost.pathname !== '/' ||
    parsedHost.search !== '' ||
    parsedHost.hash !== '' ||
    !LOOPBACK_HOSTNAMES.has(parsedHost.hostname.toLowerCase())
  ) {
    throw new AppError(
      421,
      'forbidden_origin',
      'This local Studio server accepts only loopback hosts.',
    );
  }
};

export interface RequestAuthentication {
  readonly user: AuthenticatedUser;
  readonly entitlements: EntitlementSnapshot;
  readonly expiresAt: string;
}

export interface HttpRequest {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | undefined>;
  readonly cookies: Record<string, string | undefined>;
  readonly params: Record<string, string>;
  readonly query: Record<string, string | readonly string[]>;
  readonly raw: Request;
  readonly signal: AbortSignal;
  readonly markBodyReceived: () => void;
  readonly routeOptions: { readonly url: string };
  readonly log: Logger;
  readonly traceId?: string;
  body: unknown;
  auth: RequestAuthentication | null;
}

export interface CookieWriteOptions {
  readonly path?: string;
  readonly httpOnly?: boolean;
  readonly sameSite?: 'strict' | 'lax' | 'none';
  readonly secure?: boolean;
  readonly maxAge?: number;
}

export class HttpReply {
  readonly startedAt = performance.now();
  readonly headers = new Headers(SECURITY_HEADERS);
  statusCode = 200;
  payload: unknown;
  sent = false;

  constructor(
    private readonly runtime: ApplicationRuntime,
    readonly request: HttpRequest,
  ) {
    this.headers.set('X-Request-ID', request.id);
    if (request.traceId !== undefined) this.headers.set('X-Trace-ID', request.traceId);
  }

  get elapsedTime(): number {
    return performance.now() - this.startedAt;
  }

  header(name: string, value: string | number): this {
    this.headers.set(name, String(value));
    return this;
  }

  type(contentType: string): this {
    return this.header('Content-Type', contentType);
  }

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  code(statusCode: number): this {
    return this.status(statusCode);
  }

  send(payload?: unknown): this {
    this.payload = payload;
    this.sent = true;
    return this;
  }

  sendStream(stream: Readable, lifecycle?: StreamLifecycle): this {
    return this.send({
      kind: 'node-stream',
      stream,
      lifecycle: this.runtime.streamLifecycle(this.request, lifecycle),
    } satisfies StreamPayload);
  }

  setCookie(name: string, value: string, options: CookieWriteOptions = {}): this {
    this.headers.append('Set-Cookie', serializeCookie(name, value, options));
    return this;
  }

  clearCookie(name: string, options: CookieWriteOptions = {}): this {
    this.headers.append(
      'Set-Cookie',
      serializeCookie(name, '', { ...options, maxAge: 0 }, new Date(0)),
    );
    return this;
  }

  async sendFile(relativePath: string): Promise<this> {
    const file = await this.runtime.openStaticFile(relativePath);
    if (file === null) throw new AppError(404, 'not_found', 'No API route matches this request.');
    this.type(file.contentType);
    this.header('Content-Length', file.size);
    return this.sendStream(file.stream);
  }
}

export interface RouteOptions extends BodyReaderOptions {
  readonly bodyLimit?: number;
  readonly onRequest?: (request: HttpRequest, reply: HttpReply) => void | Promise<void>;
}

export type RouteHandler = (request: HttpRequest, reply: HttpReply) => unknown;

type OnRequestHook = (request: HttpRequest, reply: HttpReply) => void | Promise<void>;
type OnSendHook = (request: HttpRequest, reply: HttpReply, payload: unknown) => unknown;
type OnCloseHook = () => void | Promise<void>;
type ErrorHandler = (error: Error, request: HttpRequest, reply: HttpReply) => void | Promise<void>;
type NotFoundHandler = (request: HttpRequest, reply: HttpReply) => void | Promise<void>;

export interface InjectOptions {
  readonly method: string;
  readonly url: string;
  readonly headers?: Record<string, string | number | readonly string[] | undefined>;
  readonly payload?: unknown;
}

export interface InjectResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly rawPayload: Buffer;
  json<Value = unknown>(): Value;
}

export interface ApplicationRuntimeOptions {
  readonly logger?: boolean;
  readonly hostname?: string;
  readonly port?: number;
  readonly connectionTimeoutMs?: number;
  readonly requestTimeoutMs?: number;
  readonly receiveTimeoutMs?: number;
  readonly staticRoot?: string;
  readonly telemetry?: {
    readonly exporterEndpoint: string;
    readonly sampleRatio: number;
    readonly serviceName: string;
  };
}

interface RuntimeServerFacade {
  readonly timeout: number;
  readonly requestTimeout: number;
  address(): string | { address: string; family: string; port: number } | null;
}

class ActivityMonitor {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private released = false;
  private operationStarted = false;
  private readonly abortFromSource: () => void;

  constructor(
    private readonly source: AbortSignal,
    receiveTimeoutMs: number,
    private readonly operationTimeoutMs: number,
  ) {
    this.signal = this.controller.signal;
    this.abortFromSource = (): void => {
      const reason = this.source.reason as unknown;
      this.controller.abort(reason ?? 'client-disconnected');
    };
    if (this.source.aborted) this.abortFromSource();
    else this.source.addEventListener('abort', this.abortFromSource, { once: true });
    this.schedule(receiveTimeoutMs, 'request-receive-timeout');
  }

  private schedule(timeoutMs: number, reason: string): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.controller.abort(reason);
    }, timeoutMs);
    this.timer.unref?.();
  }

  startOperation(): void {
    if (this.released || this.controller.signal.aborted || this.operationStarted) return;
    this.operationStarted = true;
    this.schedule(this.operationTimeoutMs, 'request-inactivity-timeout');
  }

  touch(): void {
    if (this.released || this.controller.signal.aborted || !this.operationStarted) return;
    this.schedule(this.operationTimeoutMs, 'request-inactivity-timeout');
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.source.removeEventListener('abort', this.abortFromSource);
  }
}

interface ElysiaRouteContext {
  readonly request: Request;
  readonly params: Record<string, string>;
  readonly server?: { timeout(request: Request, seconds: number): void } | null;
}

interface HeadRoute {
  readonly path: string;
  readonly match: (pathname: string) => Record<string, string> | undefined;
  readonly options: RouteOptions;
  readonly handler: RouteHandler;
}

const headRouteMatcher = (
  routePath: string,
): ((pathname: string) => Record<string, string> | undefined) => {
  const routeSegments = routePath.split('/');
  return (pathname) => {
    const pathnameSegments = pathname.split('/');
    if (pathnameSegments.length !== routeSegments.length) return undefined;
    const params: Record<string, string> = {};
    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index] ?? '';
      const pathnameSegment = pathnameSegments[index] ?? '';
      if (!routeSegment.startsWith(':')) {
        if (routeSegment !== pathnameSegment) return undefined;
        continue;
      }
      if (pathnameSegment === '') return undefined;
      try {
        params[routeSegment.slice(1)] = decodeURIComponent(pathnameSegment);
      } catch {
        return undefined;
      }
    }
    return params;
  };
};

const serializeCookie = (
  name: string,
  value: string,
  options: CookieWriteOptions,
  expires?: Date,
): string => {
  const segments = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options.path !== undefined) segments.push(`Path=${options.path}`);
  if (options.maxAge !== undefined) segments.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (expires !== undefined) segments.push(`Expires=${expires.toUTCString()}`);
  if (options.httpOnly === true) segments.push('HttpOnly');
  if (options.secure === true) segments.push('Secure');
  if (options.sameSite !== undefined) {
    const value = `${options.sameSite[0]?.toUpperCase()}${options.sameSite.slice(1)}`;
    segments.push(`SameSite=${value}`);
  }
  return segments.join('; ');
};

const parseCookies = (header: string | null): Record<string, string | undefined> => {
  const cookies: Record<string, string | undefined> = {};
  if (header === null) return cookies;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    try {
      const decodedName = decodeURIComponent(name);
      if (!(decodedName in cookies)) cookies[decodedName] = decodeURIComponent(value);
    } catch {
      if (!(name in cookies)) cookies[name] = value;
    }
  }
  return cookies;
};

const runWithinRequestLifetime = async <Result>(
  operation: Promise<Result>,
  signal: AbortSignal,
): Promise<Result> => {
  if (signal.aborted) {
    throw requestInterruptionError(signal.reason as unknown);
  }
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abort = () => {
      reject(requestInterruptionError(signal.reason as unknown));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([operation, interrupted]);
  } finally {
    if (abort !== undefined) signal.removeEventListener('abort', abort);
  }
};

const queryObject = (url: URL): Record<string, string | readonly string[]> => {
  const result: Record<string, string | readonly string[]> = {};
  for (const [name, value] of url.searchParams) {
    const current = result[name];
    result[name] =
      current === undefined
        ? value
        : typeof current === 'string'
          ? [current, value]
          : [...current, value];
  }
  return result;
};

const requestHeaders = (headers: Headers): Record<string, string | undefined> => {
  const result: Record<string, string | undefined> = {};
  for (const [name, value] of headers) result[name.toLowerCase()] = value;
  return result;
};

const contentTypeForPath = (filePath: string): string => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff2':
      return 'font/woff2';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
};

const isStringArray = (value: string | number | readonly string[]): value is readonly string[] =>
  Array.isArray(value);

const isAddressInUseError = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  typeof error.code === 'string' &&
  error.code === 'EADDRINUSE';

const randomEphemeralPort = (): number => {
  const value = crypto.getRandomValues(new Uint16Array(1))[0] ?? 0;
  return 49_152 + (value % 16_384);
};

const watchBunSocketClosure = (socket: NodeJS.EventEmitter, onClosed: () => void): (() => void) => {
  if ((globalThis as { readonly Bun?: unknown }).Bun === undefined) return () => undefined;
  const handleSymbol = Object.getOwnPropertySymbols(socket).find(
    (candidate) => candidate.description === 'handle',
  );
  if (handleSymbol === undefined) return () => undefined;
  const possibleHandle = (socket as unknown as Record<symbol, unknown>)[handleSymbol];
  if (typeof possibleHandle !== 'object' || possibleHandle === null) return () => undefined;

  const closed = (): boolean => {
    try {
      return 'closed' in possibleHandle && possibleHandle.closed === true;
    } catch {
      return false;
    }
  };
  if (closed()) {
    onClosed();
    return () => undefined;
  }

  // Bun 1.3.14's node:http compatibility socket does not emit a public close
  // after a complete request body when the handler is still waiting to send
  // headers. Its feature-detected native handle does expose the closed bit.
  let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    if (!closed()) return;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    onClosed();
  }, 50);
  timer.unref?.();
  return () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
};

export class ApplicationRuntime {
  readonly log: Logger;
  readonly server: RuntimeServerFacade;
  private readonly elysia: Elysia;
  private readonly onRequestHooks: OnRequestHook[] = [];
  private readonly onSendHooks: OnSendHook[] = [];
  private readonly onCloseHooks: OnCloseHook[] = [];
  private errorHandler: ErrorHandler | undefined;
  private notFoundHandler: NotFoundHandler | undefined;
  private nodeServer: NodeServer | undefined;
  private closePromise: Promise<void> | undefined;
  private readonly hostname: string;
  private readonly port: number;
  private readonly connectionTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly receiveTimeoutMs: number;
  private readonly staticRoot: string | undefined;
  private readonly activityMonitors = new WeakMap<HttpRequest, ActivityMonitor>();
  private readonly transportOwnedRequests = new WeakSet<Request>();
  private readonly requestStreamSettlements = new WeakMap<Request, StreamTransportSettlement>();
  private readonly pendingTransportSettlements = new Set<Promise<void>>();
  private readonly headRoutes: HeadRoute[] = [];
  private allowModuleSentinel = true;
  private modulePreparation: Promise<void> | undefined;

  constructor(options: ApplicationRuntimeOptions = {}) {
    this.hostname = options.hostname ?? '127.0.0.1';
    this.port = options.port ?? 0;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 100_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_RECEIVE_TIMEOUT_MS;
    this.receiveTimeoutMs = options.receiveTimeoutMs ?? this.requestTimeoutMs;
    this.staticRoot =
      options.staticRoot === undefined ? undefined : path.resolve(options.staticRoot);
    this.log = pino({ enabled: options.logger ?? false });
    this.elysia = new Elysia({
      strictPath: true,
      systemRouter: false,
      nativeStaticResponse: false,
      normalize: false,
      serve: {
        hostname: this.hostname,
        port: this.port,
        reusePort: false,
        maxRequestBodySize: DIRECT_ELYSIA_MAX_REQUEST_BODY_BYTES,
        idleTimeout: 5,
      },
    });
    if (options.telemetry !== undefined) {
      void this.elysia.use(
        opentelemetry({
          serviceName: options.telemetry.serviceName,
          instrumentations: [],
          recordBody: false,
          resourceDetectors: [],
          sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(options.telemetry.sampleRatio),
          }),
          spanProcessors: [
            new BatchSpanProcessor(
              new SanitizingSpanExporter(
                new OTLPTraceExporter({ url: options.telemetry.exporterEndpoint }),
              ),
            ),
          ],
        }),
      );
    }
    this.elysia.onRequest((context) => {
      requireLoopbackHost(context.request, this.allowModuleSentinel);
      if (context.request.method !== 'HEAD') return;
      const pathname = new URL(context.request.url).pathname;
      for (const route of this.headRoutes) {
        const params = route.match(pathname);
        if (params === undefined) continue;
        return this.dispatchRoute(
          { request: context.request, params, server: context.server },
          route.path,
          route.options,
          route.handler,
        );
      }
    });
    this.elysia.onError(async ({ request, error, set }) => {
      const response = await this.dispatchNotFoundOrError(request, error);
      set.status = response.status;
      return response;
    });
    if (this.staticRoot !== undefined) {
      void this.elysia.use(
        staticPlugin({
          assets: this.staticRoot,
          prefix: '/',
          alwaysStatic: true,
          indexHTML: false,
          etag: false,
          maxAge: null,
          directive: 'no-store',
          ignorePatterns: ['.DS_Store', '.git', '.env', /[\\/]api(?:[\\/]|$)/u],
          headers: {
            ...SECURITY_HEADERS,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
          silent: true,
        }),
      );
    }
    this.server = {
      timeout: this.connectionTimeoutMs,
      requestTimeout: this.requestTimeoutMs,
      address: () => this.address(),
    };
  }

  addHook(name: 'onRequest', hook: OnRequestHook): this;
  addHook(name: 'onSend', hook: OnSendHook): this;
  addHook(name: 'onClose', hook: OnCloseHook): this;
  addHook(
    name: 'onRequest' | 'onSend' | 'onClose',
    hook: OnRequestHook | OnSendHook | OnCloseHook,
  ): this {
    if (name === 'onRequest') this.onRequestHooks.push(hook as OnRequestHook);
    else if (name === 'onSend') this.onSendHooks.push(hook);
    else this.onCloseHooks.push(hook as OnCloseHook);
    return this;
  }

  setErrorHandler(handler: ErrorHandler): this {
    this.errorHandler = handler;
    return this;
  }

  setNotFoundHandler(handler: NotFoundHandler): this {
    this.notFoundHandler = handler;
    return this;
  }

  get(path: string, handler: RouteHandler): this;
  get(path: string, options: RouteOptions, handler: RouteHandler): this;
  get(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler): this {
    this.register('GET', path, optionsOrHandler, handler);
    this.register('HEAD', path, optionsOrHandler, handler);
    return this;
  }

  post(path: string, handler: RouteHandler): this;
  post(path: string, options: RouteOptions, handler: RouteHandler): this;
  post(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler): this {
    return this.register('POST', path, optionsOrHandler, handler);
  }

  put(path: string, handler: RouteHandler): this;
  put(path: string, options: RouteOptions, handler: RouteHandler): this;
  put(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler): this {
    return this.register('PUT', path, optionsOrHandler, handler);
  }

  patch(path: string, handler: RouteHandler): this;
  patch(path: string, options: RouteOptions, handler: RouteHandler): this;
  patch(path: string, optionsOrHandler: RouteOptions | RouteHandler, handler?: RouteHandler): this {
    return this.register('PATCH', path, optionsOrHandler, handler);
  }

  delete(path: string, handler: RouteHandler): this;
  delete(path: string, options: RouteOptions, handler: RouteHandler): this;
  delete(
    path: string,
    optionsOrHandler: RouteOptions | RouteHandler,
    handler?: RouteHandler,
  ): this {
    return this.register('DELETE', path, optionsOrHandler, handler);
  }

  private register(
    method: HTTPMethod,
    path: string,
    optionsOrHandler: RouteOptions | RouteHandler,
    possibleHandler?: RouteHandler,
  ): this {
    const options = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler;
    const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : possibleHandler;
    if (handler === undefined) throw new TypeError(`Missing handler for ${method} ${path}`);
    if (method === 'HEAD') {
      this.headRoutes.push({ path, match: headRouteMatcher(path), options, handler });
    }
    this.elysia.route(
      method,
      path,
      (context: ElysiaRouteContext) => this.dispatchRoute(context, path, options, handler),
      { parse: 'none' },
    );
    return this;
  }

  private createRequest(
    request: Request,
    params: Record<string, string>,
    route: string,
    onOperationStart: () => void = () => undefined,
  ): HttpRequest {
    const url = new URL(request.url);
    const monitor = new ActivityMonitor(
      request.signal,
      this.receiveTimeoutMs,
      this.connectionTimeoutMs,
    );
    const id = crypto.randomUUID();
    const traceId = currentTraceId();
    const result: HttpRequest = {
      id,
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: requestHeaders(request.headers),
      cookies: parseCookies(request.headers.get('cookie')),
      params,
      query: queryObject(url),
      raw: request,
      signal: monitor.signal,
      markBodyReceived: () => {
        monitor.startOperation();
        onOperationStart();
      },
      routeOptions: { url: route },
      log: this.log.child({ requestId: id, ...(traceId === undefined ? {} : { traceId }) }),
      ...(traceId === undefined ? {} : { traceId }),
      body: undefined,
      auth: null,
    };
    this.activityMonitors.set(result, monitor);
    return result;
  }

  streamLifecycle(request: HttpRequest, lifecycle?: StreamLifecycle): StreamLifecycle {
    const monitor = this.activityMonitors.get(request);
    const signal =
      lifecycle?.signal === undefined
        ? request.signal
        : AbortSignal.any([request.signal, lifecycle.signal]);
    return {
      signal,
      onActivity: () => {
        monitor?.touch();
        lifecycle?.onActivity?.();
      },
      onComplete: async () => {
        try {
          await lifecycle?.onComplete?.();
        } finally {
          monitor?.release();
        }
      },
      onCancel: async (reason) => {
        try {
          await lifecycle?.onCancel?.(reason);
        } finally {
          monitor?.release();
        }
      },
      onError: async (error) => {
        try {
          await lifecycle?.onError?.(error);
        } finally {
          monitor?.release();
        }
      },
    };
  }

  private async runOnRequest(request: HttpRequest, reply: HttpReply): Promise<void> {
    for (const hook of this.onRequestHooks) await hook(request, reply);
  }

  private prepareModules(): Promise<void> {
    this.modulePreparation ??= (async () => {
      try {
        await this.elysia.modules;
      } finally {
        this.allowModuleSentinel = false;
      }
    })();
    return this.modulePreparation;
  }

  private async dispatchRoute(
    context: ElysiaRouteContext,
    path: string,
    options: RouteOptions,
    handler: RouteHandler,
  ): Promise<Response> {
    const request = this.createRequest(context.request, context.params, path, () => {
      context.server?.timeout(context.request, 0);
    });
    const reply = new HttpReply(this, request);
    try {
      context.server?.timeout(
        context.request,
        Math.max(1, Math.ceil(this.receiveTimeoutMs / 1_000)),
      );
      await runWithinRequestLifetime(
        (async () => {
          await this.runOnRequest(request, reply);
          await options.onRequest?.(request, reply);
          request.body = await parseBody(
            context.request,
            options.bodyLimit ?? DEFAULT_JSON_BODY_BYTES,
            options,
            request.signal,
          );
        })(),
        request.signal,
      );
      if (options.bodyParser !== 'multipart') request.markBodyReceived();
      const result = await runWithinRequestLifetime(
        Promise.resolve(handler(request, reply)),
        request.signal,
      );
      this.activityMonitors.get(request)?.touch();
      const payload = reply.sent ? reply.payload : result === reply ? reply.payload : result;
      return await this.toResponse(request, reply, payload);
    } catch (error) {
      if (isSpooledUpload(request.body)) await request.body.cleanup().catch(() => undefined);
      return this.handleError(error, request, reply);
    }
  }

  private async handleError(
    error: unknown,
    request: HttpRequest,
    reply: HttpReply,
  ): Promise<Response> {
    const normalized = error instanceof Error ? error : new Error('Unknown application failure');
    if (this.errorHandler !== undefined) {
      try {
        await this.errorHandler(normalized, request, reply);
        return await this.toResponse(request, reply, reply.payload);
      } catch (handlerError) {
        this.log.error(
          { errorClass: handlerError instanceof Error ? handlerError.name : 'UnknownError' },
          'API error handler failed',
        );
      }
    }
    reply.status(500).send({
      error: { code: 'internal_error', message: 'The server could not complete the request.' },
    });
    return this.toResponse(request, reply, reply.payload);
  }

  private async dispatchNotFoundOrError(request: Request, error: unknown): Promise<Response> {
    const appRequest = this.createRequest(request, {}, '<unmatched>');
    const reply = new HttpReply(this, appRequest);
    try {
      await this.runOnRequest(appRequest, reply);
      const errorCode =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined;
      const isNotFound =
        error instanceof Error &&
        (errorCode === 'NOT_FOUND' || error.name === 'NotFoundError' || error.name === 'NOT_FOUND');
      if (!isNotFound) return this.handleError(error, appRequest, reply);
      if (this.notFoundHandler !== undefined) {
        await this.notFoundHandler(appRequest, reply);
        return this.toResponse(appRequest, reply, reply.payload);
      }
      reply.status(404).send({
        error: { code: 'not_found', message: 'No API route matches this request.' },
      });
      return this.toResponse(appRequest, reply, reply.payload);
    } catch (caught) {
      return this.handleError(caught, appRequest, reply);
    }
  }

  async openStaticFile(
    relativePath: string,
  ): Promise<{ stream: ReadStream; size: number; contentType: string } | null> {
    if (this.staticRoot === undefined) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(relativePath);
    } catch {
      return null;
    }
    const resolved = path.resolve(this.staticRoot, decoded);
    if (resolved !== this.staticRoot && !resolved.startsWith(`${this.staticRoot}${path.sep}`)) {
      return null;
    }
    const metadata = await stat(resolved).catch(() => null);
    if (metadata === null || !metadata.isFile()) return null;
    return {
      stream: createReadStream(resolved),
      size: metadata.size,
      contentType: contentTypeForPath(resolved),
    };
  }

  private async toResponse(
    request: HttpRequest,
    reply: HttpReply,
    initialPayload: unknown,
  ): Promise<Response> {
    let payload = initialPayload;
    for (const hook of this.onSendHooks) payload = await hook(request, reply, payload);
    const streamPayload = isStreamPayload(payload)
      ? payload
      : payload instanceof Readable
        ? ({
            kind: 'node-stream',
            stream: payload,
            lifecycle: this.streamLifecycle(request),
          } satisfies StreamPayload)
        : undefined;
    let body: BodyInit | null;
    let transport: StreamTransportSettlement | undefined;
    if (request.method === 'HEAD' && streamPayload !== undefined) {
      const transportOwned = this.transportOwnedRequests.has(request.raw);
      if (transportOwned) {
        transport = createClaimedStreamTransportSettlement(streamPayload.lifecycle);
      }
      await new Promise<void>((resolve) => {
        const closed = (): void => {
          streamPayload.stream.off('close', closed);
          streamPayload.stream.off('error', closed);
          resolve();
        };
        streamPayload.stream.once('close', closed);
        streamPayload.stream.once('error', closed);
        streamPayload.stream.destroy();
        if (streamPayload.stream.closed) closed();
      });
      if (!transportOwned) await streamPayload.lifecycle?.onComplete?.();
      body = null;
    } else {
      const converted = responseBodyWithTransport(streamPayload ?? payload, reply, {
        transportClaimed: this.transportOwnedRequests.has(request.raw),
      });
      body = converted.body;
      transport = converted.transport;
    }
    if (reply.statusCode === 204 || reply.statusCode === 304) body = null;
    if (body !== null && !isStreamPayload(payload) && !(payload instanceof Readable)) {
      const length =
        typeof body === 'string'
          ? Buffer.byteLength(body)
          : body instanceof ArrayBuffer
            ? body.byteLength
            : ArrayBuffer.isView(body)
              ? body.byteLength
              : undefined;
      if (length !== undefined && !reply.headers.has('Content-Length')) {
        reply.header('Content-Length', length);
      }
    }
    if (request.method === 'HEAD') body = null;
    const response = new Response(body, {
      status: reply.statusCode,
      headers: reply.headers,
    });
    if (transport !== undefined) this.requestStreamSettlements.set(request.raw, transport);
    if (streamPayload === undefined) this.activityMonitors.get(request)?.release();
    return response;
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    const headers = new Headers();
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      if (value === undefined) continue;
      if (isStringArray(value)) {
        for (const item of value) headers.append(name, item);
      } else {
        headers.set(name, String(value));
      }
    }
    if (!headers.has('host')) headers.set('host', 'localhost');
    let body: BodyInit | undefined;
    if (options.payload !== undefined) {
      if (
        typeof options.payload === 'string' ||
        options.payload instanceof ArrayBuffer ||
        options.payload instanceof Uint8Array ||
        options.payload instanceof Blob ||
        options.payload instanceof FormData ||
        options.payload instanceof URLSearchParams ||
        options.payload instanceof ReadableStream
      ) {
        body = options.payload as BodyInit;
      } else {
        body = JSON.stringify(options.payload);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    }
    const request = new Request(new URL(options.url, 'http://localhost'), {
      method: options.method,
      headers,
      ...(body === undefined ? {} : { body, duplex: 'half' }),
    });
    const response = await this.handle(request);
    const rawPayload = Buffer.from(await response.arrayBuffer());
    const responseHeaders: Record<string, string> = {};
    for (const [name, value] of response.headers) responseHeaders[name.toLowerCase()] = value;
    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: rawPayload.toString('utf8'),
      rawPayload,
      json: <Value = unknown>() => JSON.parse(rawPayload.toString('utf8')) as Value,
    };
  }

  async handle(request: Request): Promise<Response> {
    await this.prepareModules();
    return this.elysia.handle(request);
  }

  async listen(options: { readonly host?: string; readonly port?: number } = {}): Promise<void> {
    if (this.closePromise !== undefined) throw new Error('The application has already closed.');
    const hostname = options.host ?? this.hostname;
    const port = options.port ?? this.port;
    const normalizedHostname = hostname.toLowerCase();
    if (!LOOPBACK_HOSTNAMES.has(normalizedHostname)) {
      throw new Error('The local Studio API may listen only on a loopback hostname.');
    }
    await this.prepareModules();
    // Bun.serve changes fixed-length fs-backed streams to chunked responses and
    // provides no response-finish hook for delivery leases. Bun's node:http
    // listener preserves both contracts while Elysia still owns routing/hooks.
    const bunAvailable = (globalThis as { readonly Bun?: unknown }).Bun !== undefined;
    const attempts = bunAvailable && port === 0 ? 20 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const listenPort = bunAvailable && port === 0 ? randomEphemeralPort() : port;
      const listenerUrlHostname =
        hostname.startsWith('[') || !hostname.includes(':') ? hostname : `[${hostname}]`;
      try {
        await new Promise<void>((resolve, reject) => {
          const server = createServer((incoming, outgoing) => {
            const abortController = new AbortController();
            const abort = (): void => abortController.abort('client-disconnected');
            let stopWatchingSocket = (): void => undefined;
            let responseStreamSettlement: StreamTransportSettlement | undefined;
            const cleanupDisconnectListeners = (): void => {
              stopWatchingSocket();
              incoming.off('aborted', abortAndCleanup);
              incoming.socket.off('end', abortAndCleanup);
              incoming.socket.off('error', abortAndCleanup);
              incoming.socket.off('close', socketClosed);
              outgoing.off('error', abortAndCleanup);
              outgoing.off('finish', responseFinished);
              outgoing.off('close', responseClosed);
            };
            const responseFinished = (): void => {
              const settlement = responseStreamSettlement;
              cleanupDisconnectListeners();
              if (settlement === undefined) return;
              void settlement.finish().catch((error: unknown) => {
                this.log.error(
                  { errorClass: error instanceof Error ? error.name : 'UnknownError' },
                  'Response stream lifecycle settlement failed',
                );
              });
            };
            const abortAndCleanup = (): void => {
              abort();
              cleanupDisconnectListeners();
            };
            const responseClosed = (): void => {
              if (!outgoing.writableFinished) abort();
              cleanupDisconnectListeners();
            };
            const socketClosed = (): void => {
              if (!outgoing.writableFinished) abort();
              cleanupDisconnectListeners();
            };
            incoming.once('aborted', abortAndCleanup);
            incoming.socket.once('end', abortAndCleanup);
            incoming.socket.once('error', abortAndCleanup);
            incoming.socket.once('close', socketClosed);
            outgoing.once('error', abortAndCleanup);
            outgoing.once('finish', responseFinished);
            outgoing.once('close', responseClosed);
            stopWatchingSocket = watchBunSocketClosure(incoming.socket, abortAndCleanup);
            const listenerPort = incoming.socket.localPort ?? listenPort;
            const requestUrl = new URL(
              incoming.url ?? '/',
              `http://${listenerUrlHostname}:${listenerPort}`,
            );
            const hasBody = incomingRequestHasBody(incoming);
            const request = new Request(requestUrl, {
              method: incoming.method ?? 'GET',
              headers: incoming.headers,
              signal: abortController.signal,
              ...(hasBody
                ? {
                    body: Readable.toWeb(incoming) as unknown as BodyInit,
                    duplex: 'half',
                  }
                : {}),
            } as RequestInit & { duplex?: 'half' });
            // Claim stream lifecycle ownership before Elysia constructs the
            // response. Otherwise an empty source can reach EOF before the
            // listener observes the Response and incorrectly settle success.
            this.transportOwnedRequests.add(request);
            void this.elysia.handle(request).then(
              (response) => {
                this.transportOwnedRequests.delete(request);
                const settlement = this.requestStreamSettlements.get(request);
                this.requestStreamSettlements.delete(request);
                if (settlement !== undefined) {
                  settlement.claim();
                  responseStreamSettlement = settlement;
                  this.pendingTransportSettlements.add(settlement.settled);
                  void settlement.settled.then(() => {
                    this.pendingTransportSettlements.delete(settlement.settled);
                  });
                }
                outgoing.statusCode = response.status;
                const responseHeaders = response.headers as Headers & {
                  getSetCookie?: () => string[];
                };
                for (const [name, value] of response.headers) {
                  if (name.toLowerCase() !== 'set-cookie') outgoing.setHeader(name, value);
                }
                const cookies = responseHeaders.getSetCookie?.();
                if (cookies !== undefined && cookies.length > 0)
                  outgoing.setHeader('Set-Cookie', cookies);
                if (response.body === null || incoming.method === 'HEAD') {
                  outgoing.end();
                  return;
                }
                const source = Readable.fromWeb(
                  response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
                );
                source.once('error', () => outgoing.destroy());
                source.pipe(outgoing);
              },
              () => {
                this.transportOwnedRequests.delete(request);
                this.requestStreamSettlements.delete(request);
                if (!outgoing.headersSent) outgoing.statusCode = 500;
                outgoing.end();
              },
            );
          });
          server.requestTimeout = this.requestTimeoutMs;
          server.timeout = this.connectionTimeoutMs;
          server.keepAliveTimeout = 5_000;
          server.once('error', reject);
          server.listen(listenPort, hostname, () => {
            server.off('error', reject);
            this.nodeServer = server;
            resolve();
          });
        });
        return;
      } catch (error) {
        if (
          !bunAvailable ||
          port !== 0 ||
          !isAddressInUseError(error) ||
          attempt === attempts - 1
        ) {
          throw error;
        }
      }
    }
    throw new Error('The local Studio API could not reserve a loopback port.');
  }

  private address(): string | { address: string; family: string; port: number } | null {
    if (this.nodeServer !== undefined) return this.nodeServer.address();
    const server = this.elysia.server;
    if (server === null) return null;
    const hostname = server.hostname ?? this.hostname;
    return {
      address: hostname,
      family: hostname.includes(':') ? 'IPv6' : 'IPv4',
      port: server.port ?? this.port,
    };
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.closePromise = (async () => {
      if (this.nodeServer !== undefined) {
        await new Promise<void>((resolve, reject) => {
          this.nodeServer?.close((error) => (error === undefined ? resolve() : reject(error)));
        });
        this.nodeServer = undefined;
      } else if (this.elysia.server !== null) {
        await this.elysia.stop();
      }
      if (this.pendingTransportSettlements.size > 0) {
        await Promise.all([...this.pendingTransportSettlements]);
      }
      for (const hook of this.onCloseHooks) await hook();
    })();
    return this.closePromise;
  }
}
