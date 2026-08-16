// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { useStudioSessionExpiryController } from './useStudioSessionExpiryController';

afterEach(cleanup);

const options = (overrides: Record<string, unknown> = {}) => ({
  expiring: false,
  projectSourceActivity: null,
  projectSession: null,
  hasTemporaryWork: false,
  hasActiveWork: false,
  runCleanup: vi.fn(() => Promise.resolve()),
  completeSessionEnd: vi.fn(),
  ...overrides,
});

describe('useStudioSessionExpiryController', () => {
  it('ends an expiring session immediately when there is nothing to lose', () => {
    const completeSessionEnd = vi.fn();
    const runCleanup = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useStudioSessionExpiryController(options({ expiring: true, completeSessionEnd, runCleanup })),
    );

    expect(completeSessionEnd).toHaveBeenCalledOnce();
    expect(result.current.noticeOpen).toBe(false);
    expect(runCleanup).not.toHaveBeenCalled();
  });

  it('holds the session open and names what a discardable-work expiry ends', () => {
    const completeSessionEnd = vi.fn();
    const { result } = renderHook(() =>
      useStudioSessionExpiryController(
        options({ expiring: true, hasTemporaryWork: true, completeSessionEnd }),
      ),
    );

    expect(result.current.noticeOpen).toBe(true);
    expect(result.current.hasActiveWork).toBe(false);
    expect(completeSessionEnd).not.toHaveBeenCalled();
  });

  it('reports active work so the notice can say the running operation stops', () => {
    const { result } = renderHook(() =>
      useStudioSessionExpiryController(options({ expiring: true, hasActiveWork: true })),
    );

    expect(result.current.noticeOpen).toBe(true);
    expect(result.current.hasActiveWork).toBe(true);
  });

  it('aborts staged source, discards the Project proposal, cleans up, then ends the session', async () => {
    const abort = vi.fn();
    const projectSession = {
      hasLocalProposal: true,
      phase: 'dirty',
      flush: vi.fn(() => Promise.resolve(true)),
      discard: vi.fn(),
    } as unknown as ProjectSessionPort;
    const runCleanup = vi.fn(() => Promise.resolve());
    const completeSessionEnd = vi.fn();
    const { result } = renderHook(() =>
      useStudioSessionExpiryController(
        options({
          expiring: true,
          hasTemporaryWork: true,
          projectSourceActivity: { projectId: 'p', accepted: false, busy: true, abort },
          projectSession,
          runCleanup,
          completeSessionEnd,
        }),
      ),
    );

    expect(result.current.hasProjectProposal).toBe(true);

    act(() => result.current.acknowledge());
    await waitFor(() => expect(completeSessionEnd).toHaveBeenCalledOnce());

    expect(abort).toHaveBeenCalledOnce();
    expect(projectSession.discard).toHaveBeenCalledOnce();
    expect(runCleanup).toHaveBeenCalledOnce();
    // The session is already gone, so there is nothing to save and nothing to retry.
    expect(projectSession.flush).not.toHaveBeenCalled();
    expect(result.current.noticeOpen).toBe(false);
  });

  it('ends the session even when local cleanup fails', async () => {
    const runCleanup = vi.fn(() => Promise.reject(new Error('sensitive cleanup detail')));
    const completeSessionEnd = vi.fn();
    const { result } = renderHook(() =>
      useStudioSessionExpiryController(
        options({ expiring: true, hasTemporaryWork: true, runCleanup, completeSessionEnd }),
      ),
    );

    act(() => result.current.acknowledge());

    await waitFor(() => expect(completeSessionEnd).toHaveBeenCalledOnce());
    expect(result.current.noticeOpen).toBe(false);
  });

  it('keeps the notice open when a failing poller clears the work flags underneath it', () => {
    const completeSessionEnd = vi.fn();
    const { result, rerender } = renderHook(
      (props: { hasActiveWork: boolean }) =>
        useStudioSessionExpiryController(
          options({ expiring: true, hasActiveWork: props.hasActiveWork, completeSessionEnd }),
        ),
      { initialProps: { hasActiveWork: true } },
    );

    expect(result.current.noticeOpen).toBe(true);

    rerender({ hasActiveWork: false });

    expect(result.current.noticeOpen).toBe(true);
    expect(result.current.hasActiveWork).toBe(true);
    expect(completeSessionEnd).not.toHaveBeenCalled();
  });
});
