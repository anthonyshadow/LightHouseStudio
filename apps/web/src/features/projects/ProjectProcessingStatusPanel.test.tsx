// @vitest-environment jsdom

import type { ProjectProcessingAttempt } from '@studio/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ProjectProcessingStatusPanel } from './ProjectProcessingStatusPanel';
import type { ProjectProcessingController } from './useProjectProcessingController';

const now = '2026-08-14T12:00:00.000Z';

const attempt = (overrides: Partial<ProjectProcessingAttempt> = {}): ProjectProcessingAttempt => ({
  operationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  initiatingRevisionNumber: 2,
  phase: 'accepted',
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: true,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: null,
  expiresAt: '2026-08-14T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

const processingController = (
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

const renderPanel = (controller: ProjectProcessingController) =>
  render(<ProjectProcessingStatusPanel controller={controller} />, {
    wrapper: StudioDesignProvider,
  });

afterEach(cleanup);

describe('ProjectProcessingStatusPanel', () => {
  it('locks an unverified submission to its exact operation and checks without resubmitting', async () => {
    const refresh = vi.fn(() => Promise.resolve(true));
    renderPanel(
      processingController({
        phase: 'error',
        message: 'The response could not be verified.',
        unverifiedOperationId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
        refresh,
      }),
    );
    const user = userEvent.setup();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Submission status is unverified');
    expect(alert).toHaveTextContent('without starting another potentially billable submission');
    await user.click(screen.getByRole('button', { name: 'Check same operation' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('reconciles an operation error and marks an accepted earlier revision as retained history', async () => {
    const reconcile = vi.fn(() => Promise.resolve(true));
    const controller = processingController({
      phase: 'error',
      attempt: attempt({
        phase: 'needs-attention',
        ambiguous: true,
        nextPollAfterMs: null,
        error: { code: 'submission_ambiguous', message: 'Provider status is unknown.' },
      }),
      message: 'Check this exact operation.',
      reconcile,
    });
    const { rerender } = renderPanel(controller);
    const user = userEvent.setup();

    expect(screen.getByRole('alert')).toHaveTextContent('Submission needs attention');
    await user.click(screen.getByRole('button', { name: 'Check same operation' }));
    expect(reconcile).toHaveBeenCalledOnce();

    rerender(
      <ProjectProcessingStatusPanel
        controller={processingController({
          attempt: attempt({ isCurrent: false, nextPollAfterMs: 5_000 }),
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('earlier Project revision');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers an explicit local queue removal for an active Project attempt', async () => {
    const cancel = vi.fn(() => Promise.resolve(true));
    renderPanel(
      processingController({
        phase: 'idle',
        attempt: attempt({ cancellation: 'available' }),
        cancel,
      }),
    );
    const user = userEvent.setup();

    expect(screen.getByRole('status')).toHaveTextContent(
      'The provider may still finish remote work or charge',
    );
    await user.click(screen.getByRole('button', { name: 'Remove from processing queue' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('refreshes a current completed result when the Project summary needs another read', async () => {
    const refresh = vi.fn(() => Promise.resolve(true));
    renderPanel(
      processingController({
        attempt: attempt({
          phase: 'complete',
          nextPollAfterMs: null,
          blocksArchive: false,
          completedAt: now,
          result: {
            assetId: '5efcc6c3-e82c-419a-8807-c0026170fb75',
            retainedAt: now,
            historical: false,
            media: {
              mimeType: 'video/mp4',
              container: 'mp4',
              videoCodec: 'avc',
              audioCodec: 'aac',
              durationMs: 10_000,
              width: 1_280,
              height: 720,
              sizeBytes: 1_024,
              hasAudio: true,
            },
            contentUrl:
              '/api/projects/18b120ac-1578-46e3-8c3d-42307772f391/processing/result/content',
          },
        }),
        message: 'The current Project media could not be refreshed yet.',
        refresh,
      }),
    );
    const user = userEvent.setup();

    expect(screen.getByRole('status')).toHaveTextContent('Result ready');
    await user.click(screen.getByRole('button', { name: 'Refresh retained result' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('distinguishes passive loading, unavailable status, and ready authority', async () => {
    const refresh = vi.fn(() => Promise.resolve(true));
    const { rerender } = renderPanel(processingController({ phase: 'loading', busy: true }));

    expect(screen.getByRole('status')).toHaveTextContent('Checking Project processing');
    expect(screen.getByRole('status')).toHaveTextContent('never submits provider work');

    rerender(
      <ProjectProcessingStatusPanel
        controller={processingController({
          phase: 'error',
          message: 'The local status API is unavailable.',
          refresh,
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Processing status unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Retry status check' }));
    expect(refresh).toHaveBeenCalledOnce();

    rerender(<ProjectProcessingStatusPanel controller={processingController()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Recoverable Project processing ready');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Voice and live starts remain unavailable',
    );
  });
});
