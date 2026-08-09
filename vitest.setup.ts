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
