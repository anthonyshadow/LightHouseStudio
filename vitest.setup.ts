import '@testing-library/jest-dom/vitest';
import { TEST_NETWORK_POLICY } from '@studio/testing';
import { afterEach, beforeEach, vi } from 'vitest';

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

beforeEach(() => {
  vi.stubGlobal('fetch', blockedFetch);
  vi.stubGlobal('WebSocket', BlockedWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
