import { delay, http, HttpResponse, type HttpHandler, type JsonBodyType } from 'msw';

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type JsonStep =
  | Readonly<{ body: JsonBodyType; status?: number; headers?: HeadersInit }>
  | Readonly<{ kind: 'network-error' }>
  | Readonly<{ kind: 'pending' }>;

type RequestObserver = (request: Request) => void | Promise<void>;
type ApiResolver = (context: { request: Request }) => Response | Promise<Response>;

export const captureRequests = (): Readonly<{
  requests: Request[];
  observe: RequestObserver;
}> => {
  const requests: Request[] = [];
  return {
    requests,
    observe(request) {
      requests.push(request);
    },
  };
};

const apiRoute = (pathname: string): string => `*${pathname}`;

const apiHandler = (method: ApiMethod, pathname: string, resolver: ApiResolver): HttpHandler => {
  switch (method) {
    case 'GET':
      return http.get(apiRoute(pathname), resolver);
    case 'POST':
      return http.post(apiRoute(pathname), resolver);
    case 'PUT':
      return http.put(apiRoute(pathname), resolver);
    case 'PATCH':
      return http.patch(apiRoute(pathname), resolver);
    case 'DELETE':
      return http.delete(apiRoute(pathname), resolver);
  }
};

const respond = async (step: JsonStep): Promise<Response> => {
  if ('kind' in step) {
    if (step.kind === 'network-error') return HttpResponse.error();
    await delay('infinite');
    return new HttpResponse(null, { status: 504 });
  }
  return HttpResponse.json(step.body, {
    status: step.status ?? 200,
    ...(step.headers ? { headers: step.headers } : {}),
  });
};

const sequenceHandler = (
  method: ApiMethod,
  pathname: string,
  stepOrSteps: JsonStep | readonly JsonStep[],
  observe?: RequestObserver,
): HttpHandler => {
  const steps = (Array.isArray(stepOrSteps) ? stepOrSteps : [stepOrSteps]) as readonly JsonStep[];
  if (steps.length === 0) throw new Error(`MSW scenario for ${method} ${pathname} has no steps.`);
  let index = 0;
  const resolver = async ({ request }: { request: Request }) => {
    await observe?.(request.clone());
    const step = steps[Math.min(index, steps.length - 1)]!;
    index += 1;
    return respond(step);
  };
  return apiHandler(method, pathname, resolver);
};

export const jsonScenario = (
  method: ApiMethod,
  pathname: string,
  steps: JsonStep | readonly JsonStep[],
  observe?: RequestObserver,
): HttpHandler => sequenceHandler(method, pathname, steps, observe);

/**
 * A request that never settles, observed through the intercepted request itself.
 *
 * Every other scenario hands its observer `request.clone()` so the observer can read a body the
 * resolver still needs. A clone is the wrong thing to watch for cancellation: its `AbortSignal`
 * only *follows* the real one, and the runtime keeps that link alive weakly, so once the throwaway
 * clone is collected the clone's signal silently stops aborting. A test asserting on it then fails
 * whenever a collection happens to land in between.
 */
export const pendingRequestScenario = (
  method: ApiMethod,
  pathname: string,
  observe: RequestObserver,
): HttpHandler =>
  apiHandler(method, pathname, async ({ request }) => {
    await observe(request);
    await delay('infinite');
    return new HttpResponse(null, { status: 504 });
  });

export const providerAvailabilityScenario = (
  steps: JsonStep | readonly JsonStep[],
  observe?: RequestObserver,
): HttpHandler => sequenceHandler('GET', '/api/capabilities', steps, observe);

export const galleryPaginationScenario = (
  pages: Readonly<Record<string, unknown>>,
  observe?: RequestObserver,
): HttpHandler =>
  http.get(apiRoute('/api/videos'), async ({ request }) => {
    await observe?.(request.clone());
    const cursor = new URL(request.url).searchParams.get('cursor') ?? '';
    if (!(cursor in pages)) {
      return HttpResponse.json(
        { error: { code: 'unexpected_cursor', message: `Unexpected cursor: ${cursor}` } },
        { status: 400 },
      );
    }
    return HttpResponse.json(pages[cursor] as JsonBodyType);
  });

export const authenticationExpiryScenario = (
  pathname: string,
  observe?: RequestObserver,
): HttpHandler =>
  sequenceHandler(
    'GET',
    pathname,
    {
      body: {
        error: { code: 'authentication_required', message: 'Sign in to continue.' },
      },
      status: 401,
    },
    observe,
  );

export const videoJobPollingScenario = (
  jobId: string,
  statuses: readonly JsonBodyType[],
  observe?: RequestObserver,
): HttpHandler =>
  sequenceHandler(
    'GET',
    `/api/video-jobs/${encodeURIComponent(jobId)}`,
    statuses.map((body) => ({ body })),
    observe,
  );

export const malformedContractScenario = (
  method: ApiMethod,
  pathname: string,
  observe?: RequestObserver,
): HttpHandler =>
  responseScenario(
    method,
    pathname,
    '{not-json',
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
    observe,
  );

export function responseScenario(
  method: ApiMethod,
  pathname: string,
  body: BodyInit | null,
  init?: ResponseInit,
  observe?: RequestObserver,
): HttpHandler {
  const resolver = async ({ request }: { request: Request }) => {
    await observe?.(request.clone());
    return new HttpResponse(body, init);
  };
  return apiHandler(method, pathname, resolver);
}

export const serverConflictScenario = (
  method: ApiMethod,
  pathname: string,
  code = 'conflict',
  message = 'The server state changed before this request completed.',
  observe?: RequestObserver,
): HttpHandler =>
  sequenceHandler(method, pathname, { body: { error: { code, message } }, status: 409 }, observe);

export const uploadFailureScenario = (pathname: string, observe?: RequestObserver): HttpHandler =>
  sequenceHandler(
    'POST',
    pathname,
    {
      body: {
        error: { code: 'invalid_image_upload', message: 'The upload could not be completed.' },
      },
      status: 503,
    },
    observe,
  );
