import { describe, expect, it, vi } from 'vitest';
import {
  EnvironmentProfileError,
  loadSelectedEnvironmentFile,
  selectedEnvironmentFile,
} from './environment-file.js';

describe('environment profile loading', () => {
  it('selects the explicit development file and validates NODE_ENV after loading', () => {
    const environment: NodeJS.ProcessEnv = { LIGHTFRAME_ENV: 'development' };
    const load = vi.fn((_path: string, target: NodeJS.ProcessEnv) => {
      target.NODE_ENV = 'development';
    });

    expect(
      loadSelectedEnvironmentFile({
        repositoryRoot: '/workspace/lightframe',
        environment,
        pathExists: () => true,
        load,
      }),
    ).toBe('development');
    expect(load).toHaveBeenCalledWith(
      selectedEnvironmentFile('/workspace/lightframe', 'development'),
      environment,
    );
  });

  it('supports an explicit process-only production smoke without reading a file', () => {
    const load = vi.fn();
    expect(
      loadSelectedEnvironmentFile({
        repositoryRoot: '/workspace/lightframe',
        environment: {
          LIGHTFRAME_ENV: 'production',
          LIGHTFRAME_ENV_SOURCE: 'process',
          NODE_ENV: 'production',
        },
        load,
      }),
    ).toBe('production');
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps unit and integration tests independent from operator environment files', () => {
    expect(
      loadSelectedEnvironmentFile({
        repositoryRoot: '/workspace/lightframe',
        environment: { NODE_ENV: 'test' },
        load: vi.fn(),
      }),
    ).toBeNull();
  });

  it.each([
    [{}, 'Set LIGHTFRAME_ENV'],
    [{ LIGHTFRAME_ENV: 'staging' }, 'LIGHTFRAME_ENV must'],
    [{ LIGHTFRAME_ENV: 'development' }, 'environment file is missing'],
    [
      {
        LIGHTFRAME_ENV: 'production',
        LIGHTFRAME_ENV_SOURCE: 'process',
        NODE_ENV: 'development',
      },
      'requires NODE_ENV=production',
    ],
  ] as const)('fails closed for an invalid or incomplete profile %#', (environment, message) => {
    expect(() =>
      loadSelectedEnvironmentFile({
        repositoryRoot: '/workspace/lightframe',
        environment: { ...environment },
        pathExists: () => false,
        load: vi.fn(),
      }),
    ).toThrowError(EnvironmentProfileError);
    expect(() =>
      loadSelectedEnvironmentFile({
        repositoryRoot: '/workspace/lightframe',
        environment: { ...environment },
        pathExists: () => false,
        load: vi.fn(),
      }),
    ).toThrow(message);
  });
});
