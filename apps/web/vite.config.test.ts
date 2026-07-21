import { describe, expect, it } from 'vitest';
import {
  default as viteConfig,
  DEVELOPMENT_API_PROXY,
  DEVELOPMENT_API_PROXY_TIMEOUT_MS,
  DEVELOPMENT_OPTIMIZE_DEPS,
} from './vite.config';

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

describe('development dependency optimization', () => {
  it('pre-bundles the lazily loaded MediaBunny remuxer before a voice conversion requests it', () => {
    const resolvedConfig =
      typeof viteConfig === 'function'
        ? viteConfig({ command: 'serve', mode: 'test', isSsrBuild: false, isPreview: false })
        : viteConfig;

    expect(DEVELOPMENT_OPTIMIZE_DEPS).toEqual({ include: ['mediabunny'] });
    expect(resolvedConfig.optimizeDeps).toEqual(DEVELOPMENT_OPTIMIZE_DEPS);
  });
});
