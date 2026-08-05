// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  LocalProjectRepository,
  ProjectStorageState,
  ProjectSummary,
} from '../features/guided-flow/types';
import { useLegacyProjectAvailability } from './useLegacyProjectAvailability';

const initialStorage: ProjectStorageState = {
  health: 'session-only',
  durable: false,
  notice: 'Durable browser project storage is unavailable.',
};

const readyStorage: ProjectStorageState = {
  health: 'ready',
  durable: true,
  notice: null,
};

const project = (id: string): ProjectSummary => ({
  id,
  title: id,
  revision: 1,
  checkpoint: 'complete',
  characterName: id,
  hasOriginalVideo: false,
  hasProcessedVideo: false,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
});

const repository = (overrides: Partial<LocalProjectRepository> = {}): LocalProjectRepository => ({
  initialize: vi.fn(() => Promise.resolve(readyStorage)),
  getStorageState: vi.fn(() => initialStorage),
  count: vi.fn(() => Promise.resolve(2)),
  list: vi.fn(() => Promise.resolve([project('one'), project('two')])),
  load: vi.fn(() => Promise.resolve(null)),
  loadNewestCharacterDesign: vi.fn(() => Promise.resolve(null)),
  readArtifact: vi.fn(() => Promise.resolve(null)),
  deleteProject: vi.fn(() => Promise.resolve()),
  close: vi.fn(),
  ...overrides,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useLegacyProjectAvailability', () => {
  it('initializes the compatibility repository and synchronizes count and storage', async () => {
    const target = repository();
    const { result } = renderHook(() => useLegacyProjectAvailability({ repository: target }));

    expect(result.current.storage).toEqual(initialStorage);
    expect(result.current.projectCount).toBe(0);

    await waitFor(() => expect(result.current.projectCount).toBe(2));
    expect(result.current.storage).toEqual(readyStorage);

    vi.mocked(target.getStorageState).mockReturnValue({
      health: 'degraded',
      durable: false,
      notice: 'Legacy storage changed to memory-only mode.',
    });
    act(() => result.current.synchronizeProjectCount(1));

    expect(result.current.projectCount).toBe(1);
    expect(result.current.storage).toEqual({
      health: 'degraded',
      durable: false,
      notice: 'Legacy storage changed to memory-only mode.',
    });
  });

  it('settles initialization and count failures without claiming projects are available', async () => {
    const initializationFailure = repository({
      initialize: vi.fn(() => Promise.reject(new Error('IndexedDB unavailable.'))),
    });
    const initialized = renderHook(() =>
      useLegacyProjectAvailability({ repository: initializationFailure }),
    );

    await waitFor(() => expect(initializationFailure.initialize).toHaveBeenCalledOnce());
    await act(() => Promise.resolve());
    expect(initialized.result.current.projectCount).toBe(0);
    expect(initializationFailure.count).not.toHaveBeenCalled();
    initialized.unmount();

    const countFailure = repository({
      count: vi.fn(() => Promise.reject(new Error('Legacy projects could not be counted.'))),
    });
    const counted = renderHook(() => useLegacyProjectAvailability({ repository: countFailure }));

    await waitFor(() => expect(countFailure.count).toHaveBeenCalledOnce());
    await act(() => Promise.resolve());
    expect(counted.result.current.storage).toEqual(readyStorage);
    expect(counted.result.current.projectCount).toBe(0);
    counted.unmount();
  });

  it('ignores late initialization after unmount and closes the owned repository once', async () => {
    const initialization = deferred<ProjectStorageState>();
    const target = repository({
      initialize: vi.fn(() => initialization.promise),
    });
    const { unmount } = renderHook(() => useLegacyProjectAvailability({ repository: target }));

    unmount();
    await act(async () => {
      initialization.resolve(readyStorage);
      await initialization.promise;
    });

    expect(target.count).not.toHaveBeenCalled();
    await waitFor(() => expect(target.close).toHaveBeenCalledOnce());
  });
});
