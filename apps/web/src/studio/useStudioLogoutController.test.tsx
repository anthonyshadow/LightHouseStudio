// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { useStudioLogoutController } from './useStudioLogoutController';

afterEach(cleanup);

const options = (overrides: Record<string, unknown> = {}) => ({
  projectSourceActivity: null,
  projectSession: null,
  hasTemporaryWork: false,
  hasActiveWork: false,
  cleanupTemporaryState: vi.fn(() => Promise.resolve()),
  releaseMedia: vi.fn(() => Promise.resolve()),
  logout: vi.fn(() => Promise.resolve()),
  onLoggedOut: vi.fn(),
  ...overrides,
});

describe('useStudioLogoutController', () => {
  it('blocks logout during active work and lets the user return to Studio', async () => {
    const cleanupTemporaryState = vi.fn(() => Promise.resolve());
    const logout = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useStudioLogoutController(options({ hasActiveWork: true, cleanupTemporaryState, logout })),
    );

    await act(async () => result.current.request());

    expect(result.current.blockedOpen).toBe(true);
    expect(cleanupTemporaryState).not.toHaveBeenCalled();
    expect(logout).not.toHaveBeenCalled();

    act(() => result.current.dismissBlocked());

    expect(result.current.blockedOpen).toBe(false);
  });

  it('offers and dismisses explicit logout when temporary work would be discarded', async () => {
    const logout = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useStudioLogoutController(options({ hasTemporaryWork: true, logout })),
    );

    await act(async () => result.current.request());

    expect(result.current.promptOpen).toBe(true);
    expect(result.current.failure).toBeNull();
    expect(logout).not.toHaveBeenCalled();

    act(() => result.current.dismissPrompt());

    expect(result.current.promptOpen).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it('flushes a pending Project proposal before a clean logout', async () => {
    const projectSession = {
      hasLocalProposal: true,
      phase: 'dirty',
      flush: vi.fn(() => Promise.resolve(true)),
      discard: vi.fn(),
    } as unknown as ProjectSessionPort;
    const cleanupTemporaryState = vi.fn(() => Promise.resolve());
    const releaseMedia = vi.fn(() => Promise.resolve());
    const logout = vi.fn(() => Promise.resolve());
    const onLoggedOut = vi.fn();
    const { result } = renderHook(() =>
      useStudioLogoutController(
        options({
          projectSession,
          cleanupTemporaryState,
          releaseMedia,
          logout,
          onLoggedOut,
        }),
      ),
    );

    await act(async () => result.current.request());
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledOnce());

    expect(projectSession.flush).toHaveBeenCalledOnce();
    expect(projectSession.discard).not.toHaveBeenCalled();
    expect(cleanupTemporaryState).toHaveBeenCalledOnce();
    expect(releaseMedia).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
    expect(result.current.promptOpen).toBe(false);
  });

  it('aborts staged Project source and discards a conflicted proposal only after confirmation', async () => {
    const abort = vi.fn();
    const projectSession = {
      hasLocalProposal: true,
      phase: 'conflict',
      flush: vi.fn(() => Promise.resolve(false)),
      discard: vi.fn(),
    } as unknown as ProjectSessionPort;
    const logout = vi.fn(() => Promise.resolve());
    const onLoggedOut = vi.fn();
    const { result } = renderHook(() =>
      useStudioLogoutController(
        options({
          projectSourceActivity: {
            projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
            accepted: false,
            busy: true,
            abort,
          },
          projectSession,
          logout,
          onLoggedOut,
        }),
      ),
    );

    await act(async () => result.current.request());

    expect(result.current.promptOpen).toBe(true);
    expect(result.current.hasProjectProposal).toBe(true);
    expect(projectSession.flush).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();

    act(() => result.current.confirmDiscard());
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledOnce());

    expect(abort).toHaveBeenCalledOnce();
    expect(projectSession.discard).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('keeps the user in Studio after cleanup failure and retries the same explicit intent', async () => {
    const cleanupTemporaryState = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('sensitive cleanup detail'))
      .mockResolvedValueOnce();
    const logout = vi.fn(() => Promise.resolve());
    const onLoggedOut = vi.fn();
    const { result } = renderHook(() =>
      useStudioLogoutController(
        options({ cleanupTemporaryState, logout, onLoggedOut, hasTemporaryWork: false }),
      ),
    );

    await act(async () => result.current.request());

    await waitFor(() => expect(result.current.failure).toMatch(/still in Studio/u));
    expect(result.current.failure).not.toContain('sensitive cleanup detail');
    expect(result.current.promptOpen).toBe(true);
    expect(logout).not.toHaveBeenCalled();
    expect(onLoggedOut).not.toHaveBeenCalled();

    act(() => result.current.confirmDiscard());
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledOnce());
    expect(cleanupTemporaryState).toHaveBeenCalledTimes(2);
    expect(logout).toHaveBeenCalledOnce();
  });

  it('turns a rejected Project flush into an explicit discard choice', async () => {
    const projectSession = {
      hasLocalProposal: true,
      phase: 'dirty',
      flush: vi.fn(() => Promise.reject(new Error('offline'))),
    } as unknown as ProjectSessionPort;
    const { result } = renderHook(() => useStudioLogoutController(options({ projectSession })));

    await act(async () => result.current.request());

    expect(result.current.preparing).toBe(false);
    expect(result.current.promptOpen).toBe(true);
  });
});
