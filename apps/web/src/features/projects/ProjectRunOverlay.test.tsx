// @vitest-environment jsdom

import type { ProjectProcessingAttempt } from '@studio/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ProjectRunOverlay, projectRunInFlight } from './ProjectRunOverlay';
import type { ProjectProcessingController } from './useProjectProcessingController';

const now = '2026-08-29T12:00:00.000Z';

const attempt = (overrides: Partial<ProjectProcessingAttempt> = {}): ProjectProcessingAttempt => ({
  operationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  initiatingRevisionNumber: 2,
  phase: 'processing',
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: true,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: null,
  expiresAt: '2026-08-29T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

const controller = (
  overrides: Partial<ProjectProcessingController> = {},
): ProjectProcessingController => ({
  phase: 'idle',
  attempt: null,
  message: null,
  unverifiedOperationId: null,
  busy: false,
  active: false,
  authorityReady: true,
  start: vi.fn(() => Promise.resolve(true)),
  retry: vi.fn(() => Promise.resolve(true)),
  cancel: vi.fn(() => Promise.resolve(true)),
  reconcile: vi.fn(() => Promise.resolve(true)),
  refresh: vi.fn(() => Promise.resolve(true)),
  ...overrides,
});

afterEach(cleanup);

describe('projectRunInFlight', () => {
  it('covers the submission window that has no attempt yet', () => {
    expect(projectRunInFlight(controller({ phase: 'submitting' }))).toBe(true);
  });

  it('covers the accepted run a background poll deliberately reports as idle', () => {
    // The controller keeps `phase: 'idle'` while polling so the surface shows steady progress
    // rather than flickering; `active` is the only signal that the run is still going.
    expect(projectRunInFlight(controller({ active: true, attempt: attempt() }))).toBe(true);
  });

  it('leaves the workspace alone for a run that cannot replace the current media', () => {
    expect(
      projectRunInFlight(controller({ active: true, attempt: attempt({ isCurrent: false }) })),
    ).toBe(false);
  });

  it('leaves the workspace alone while the status is merely being read', () => {
    // `loading` is where this controller starts on mount and returns on every revision change, and
    // `refreshing` is what the check-status controls set. Neither has sent anything, so a scrim
    // over an ordinary Project — every time it is opened, and after every autosave — was a claim
    // the app could not support, and it covered the control that asked for the read.
    expect(projectRunInFlight(controller({ phase: 'loading', busy: true }))).toBe(false);
    expect(projectRunInFlight(controller({ phase: 'refreshing', busy: true }))).toBe(false);
  });

  it('never blocks an unverified submission, which needs the operator to resolve it', () => {
    expect(
      projectRunInFlight(
        controller({
          phase: 'submitting',
          unverifiedOperationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
        }),
      ),
    ).toBe(false);
  });

  it('stays out of the way when nothing is running', () => {
    expect(projectRunInFlight(controller())).toBe(false);
    expect(projectRunInFlight(undefined)).toBe(false);
  });
});

describe('ProjectRunOverlay', () => {
  it('announces the run in the phase vocabulary the rest of the Project already uses', () => {
    render(<ProjectRunOverlay controller={controller({ active: true, attempt: attempt() })} />, {
      wrapper: StudioDesignProvider,
    });

    const overlay = screen.getByRole('status');
    expect(overlay).toHaveTextContent('Character Swap processing');
    expect(overlay).toHaveTextContent('This run is still going');
  });

  it('names the submission window before an attempt exists', () => {
    render(<ProjectRunOverlay controller={controller({ phase: 'submitting' })} />, {
      wrapper: StudioDesignProvider,
    });

    expect(screen.getByRole('status')).toHaveTextContent('Starting this edit…');
  });

  it('offers a way out only when the provider actually accepts one', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn(() => Promise.resolve(true));
    const { rerender } = render(
      <StudioDesignProvider>
        <ProjectRunOverlay controller={controller({ active: true, attempt: attempt() })} />
      </StudioDesignProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <StudioDesignProvider>
        <ProjectRunOverlay
          controller={controller({
            active: true,
            cancel,
            attempt: attempt({ cancellation: 'available' }),
          })}
        />
      </StudioDesignProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove from processing queue' }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
