import { describe, expect, it } from 'vitest';
import {
  default as viteConfig,
  DEVELOPMENT_API_PROXY,
  DEVELOPMENT_API_PROXY_TIMEOUT_MS,
  DEVELOPMENT_OPTIMIZE_DEPS,
  REACT_COMPILER_OPTIONS,
  REACT_COMPILER_PRESET,
} from './vite.config';

const resolveViteConfig = (command: 'build' | 'serve') =>
  typeof viteConfig === 'function'
    ? viteConfig({ command, mode: 'test', isSsrBuild: false, isPreview: false })
    : viteConfig;

describe('development API proxy', () => {
  it('preserves the browser-facing Host for exact local Origin validation', () => {
    expect(DEVELOPMENT_API_PROXY).toEqual({
      target: 'http://127.0.0.1:4100',
      changeOrigin: false,
      proxyTimeout: DEVELOPMENT_API_PROXY_TIMEOUT_MS,
    });
    expect(DEVELOPMENT_API_PROXY_TIMEOUT_MS).toBe(300_000);
  });
});

describe('development dependency optimization', () => {
  it('pre-bundles the lazily loaded MediaBunny remuxer before a voice conversion requests it', () => {
    const resolvedConfig = resolveViteConfig('serve');

    expect(DEVELOPMENT_OPTIMIZE_DEPS).toEqual({ include: ['mediabunny'] });
    expect(resolvedConfig.optimizeDeps).toEqual(DEVELOPMENT_OPTIMIZE_DEPS);
  });
});

describe('React Compiler adoption', () => {
  it('limits compilation to reviewed presentation boundaries', async () => {
    const resolvedConfig = resolveViteConfig('build');
    const configuredPlugins = await Promise.all(
      (resolvedConfig.plugins ?? []).flat().map((plugin) => Promise.resolve(plugin)),
    );

    expect(REACT_COMPILER_OPTIONS).toEqual({ compilationMode: 'annotation' });
    expect(REACT_COMPILER_PRESET.rolldown.filter?.code).toEqual(/['"]use memo['"]/);
    expect(REACT_COMPILER_PRESET.rolldown.optimizeDeps?.include).toEqual([
      'react/compiler-runtime',
    ]);
    expect(configuredPlugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: '@rolldown/plugin-babel' })]),
    );
  });
});
