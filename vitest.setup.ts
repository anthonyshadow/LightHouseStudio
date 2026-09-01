import '@testing-library/jest-dom/vitest';
import type { SetupServerApi } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';

const TEST_NETWORK_POLICY = 'deny-external';

const blockedFetch: typeof fetch = (input, init) => {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
  return Promise.reject(
    new Error(
      `Unexpected network request blocked by the ${TEST_NETWORK_POLICY} test harness: ${method} ${target}`,
    ),
  );
};

class BlockedWebSocket {
  constructor(url: string | URL) {
    throw new Error(
      `Unexpected WebSocket blocked by the ${TEST_NETWORK_POLICY} test harness: ${String(url)}`,
    );
  }
}

// Node 26 exposes inert `localStorage`/`sessionStorage` globals unless `--localstorage-file` is
// given, and Vitest's DOM environments skip any window key that already exists on the Node global.
// Web Storage therefore never reaches `window` there, and DOM tests silently exercise the
// storage-unavailable fallbacks instead of real persistence. Restore a per-file in-memory Storage
// whenever the environment left one that cannot be used.
const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      values.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      values.delete(String(key));
    },
    clear: () => {
      values.clear();
    },
  } satisfies Storage;
};

const restoreWebStorage = (name: 'localStorage' | 'sessionStorage'): void => {
  if (typeof globalThis.document === 'undefined') return;
  let existing: unknown;
  try {
    existing = globalThis[name];
  } catch {
    existing = undefined;
  }
  if (typeof (existing as Storage | undefined)?.getItem === 'function') return;
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: createMemoryStorage(),
  });
};

restoreWebStorage('localStorage');
restoreWebStorage('sessionStorage');

// `findBy*` and `waitFor` default to a 1s budget, which assumes the DOM update being waited on is
// cheap. Here the first assertion after a render often also waits for a `lazy()` boundary to fetch,
// transform and evaluate a code-split module graph on demand: measured at ~0.45s for the Studio
// runtime with the runner otherwise idle, and 0.86-1.18s once a full run saturates its workers —
// a coin flip against the default, and worse on CI's smaller runners. Tests whose subject is not
// the boundary load the module themselves rather than spend an assertion waiting for it; this is
// the margin for the rest. It stays well under the 5s `testTimeout` so a genuinely missing element
// still fails with the queried DOM instead of timing the whole test out.
if (typeof globalThis.document !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  configure({ asyncUtilTimeout: 2_500 });
}

let usesMockApiServer = false;
let mockApiServer: SetupServerApi | undefined;

beforeAll(async () => {
  usesMockApiServer = expect.getState().testPath?.includes('/apps/web/') ?? false;
  if (!usesMockApiServer) return;
  ({ mockApiServer } = await import('./apps/web/src/test/msw/server'));
  mockApiServer.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  if (!usesMockApiServer) vi.stubGlobal('fetch', blockedFetch);
  vi.stubGlobal('WebSocket', BlockedWebSocket);
});

afterEach(() => {
  mockApiServer?.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(() => {
  mockApiServer?.close();
  mockApiServer = undefined;
});
