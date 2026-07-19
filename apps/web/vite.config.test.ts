import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_API_PROXY, DEVELOPMENT_API_PROXY_TIMEOUT_MS } from './vite.config';

describe('development API proxy', () => {
  it('preserves the browser-facing Host for exact local Origin validation', () => {
    expect(DEVELOPMENT_API_PROXY).toEqual({
      target: 'http://127.0.0.1:4100',
      changeOrigin: false,
      proxyTimeout: DEVELOPMENT_API_PROXY_TIMEOUT_MS,
    });
    expect(DEVELOPMENT_API_PROXY_TIMEOUT_MS).toBe(210_000);
  });
});
