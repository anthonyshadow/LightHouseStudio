// @vitest-environment jsdom

import type { ProjectProcessingAttempt } from '@studio/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ExistingVideoActionBar } from './ExistingVideoActionBar';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';
import type { ProjectProcessingController } from '../projects/useProjectProcessingController';

afterEach(cleanup);

const workflow = (providerBacked: boolean) =>
  ({
    steps: providerBacked
      ? [
          {
            id: 'step-one',
            modelId: 'lucy-latest',
            savedRecipeId: 'character-one',
            prompt: 'Prepared Character',
            enhancePrompt: false,
            referenceImage: null,
            inputKind: 'character',
            outputResolution: '720p',
          },
        ]
      : [],
    voiceSelection: providerBacked
      ? null
      : { kind: 'local', effect: 'warm-studio', voiceName: 'Warm studio' },
    phase: 'ready',
    retryJob: null,
    pendingVisual: null,
    active: false,
    acceptedSubmission: false,
    result: null,
    comparison: 'original',
    submitPlan: vi.fn(() => Promise.resolve()),
  }) as unknown as ExistingVideoWorkflow;

const renderBar = (
  value: ExistingVideoWorkflow,
  projectProcessing?: ProjectProcessingController,
  onRequestDiscard = vi.fn(),
) =>
  render(
    <StudioDesignProvider>
      <ExistingVideoActionBar
        workflow={value}
        videoProcessingAvailable
        activeVisualCapability={{
          available: true,
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptInput: 'editable',
          promptEnhancement: true,
          terminalFailureRelease: 'automatic',
          outputResolutions: ['720p'],
        }}
        providerStartBlockedReason="Project provider processing is unavailable until recoverable Project processing is enabled."
        {...(projectProcessing ? { projectProcessing } : {})}
        onFinish={vi.fn()}
        onEditSelected={vi.fn()}
        onStartOver={vi.fn()}
        onRequestDiscard={onRequestDiscard}
      />
    </StudioDesignProvider>,
  );

const projectController = (
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

const processingAttempt = (
  overrides: Partial<ProjectProcessingAttempt> = {},
): ProjectProcessingAttempt => ({
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
  createdAt: '2026-08-13T12:00:00.000Z',
  updatedAt: '2026-08-13T12:00:00.000Z',
  acceptedAt: '2026-08-13T12:00:00.000Z',
  completedAt: null,
  expiresAt: '2026-08-13T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

describe('ExistingVideoActionBar Project gate', () => {
  it('blocks provider-backed submission with truthful copy', () => {
    const value = workflow(true);
    renderBar(value);
    expect(screen.getByRole('button', { name: 'Apply Character Swap' })).toBeDisabled();
    expect(
      screen.getByText(
        'Project provider processing is unavailable until recoverable Project processing is enabled.',
      ),
    ).toBeInTheDocument();
    expect(value.submitPlan).not.toHaveBeenCalled();
  });

  it('does not block the existing on-device Voice-only path', async () => {
    const user = userEvent.setup();
    const value = workflow(false);
    renderBar(value);
    const button = screen.getByRole('button', { name: 'Apply Warm studio locally' });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(value.submitPlan).toHaveBeenCalledOnce();
  });

  it('keeps on-device Voice available while an earlier Project visual attempt is retained remotely', async () => {
    const user = userEvent.setup();
    const value = workflow(false);
    renderBar(
      value,
      projectController({
        attempt: processingAttempt({ phase: 'processing', isCurrent: false }),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Apply Warm studio locally' }));

    expect(value.submitPlan).toHaveBeenCalledOnce();
  });

  it('routes Project visual Start through the Project command instead of the legacy workflow', async () => {
    const user = userEvent.setup();
    const value = workflow(true);
    const controller = projectController();
    renderBar(value, controller);

    await user.click(screen.getByRole('button', { name: 'Start Project Character Swap' }));

    expect(controller.start).toHaveBeenCalledWith('character-swap');
    expect(value.submitPlan).not.toHaveBeenCalled();
  });

  it('withholds Start until the durable operation authority has actually been read', () => {
    const value = workflow(true);
    const controller = projectController({ authorityReady: false });
    renderBar(value, controller);

    expect(screen.getByRole('button', { name: 'Start Project Character Swap' })).toBeDisabled();
    expect(screen.getByText(/Start stays unavailable until that is known/u)).toBeInTheDocument();
    expect(controller.start).not.toHaveBeenCalled();
  });

  it('keeps Project provider Voice gated because it has no durable reconnect identity', () => {
    const value = {
      ...workflow(false),
      voiceSelection: { kind: 'elevenlabs', voiceId: 'voice-one', voiceName: 'Narrator' },
    } as unknown as ExistingVideoWorkflow;
    renderBar(value, projectController());

    expect(screen.getByRole('button', { name: 'Project processing unavailable' })).toBeDisabled();
    expect(screen.getByText(/Project provider Voice remains unavailable/u)).toBeInTheDocument();
    expect(value.submitPlan).not.toHaveBeenCalled();
  });

  it('requires explicit duplicate-cost confirmation before retrying ambiguity', async () => {
    const user = userEvent.setup();
    const controller = projectController({
      attempt: processingAttempt({
        phase: 'needs-attention',
        ambiguous: true,
        retryPolicy: 'explicit-cost-confirmation',
        acceptedAt: null,
        completedAt: '2026-08-13T12:00:00.000Z',
        nextPollAfterMs: null,
        error: {
          code: 'submission_ambiguous',
          message: 'Submission may have been accepted.',
        },
      }),
    });
    renderBar(workflow(true), controller);

    await user.click(screen.getByRole('button', { name: 'Retry as new provider attempt' }));
    expect(screen.getAllByText(/may duplicate that cost/u)).not.toHaveLength(0);
    expect(controller.retry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Acknowledge cost and retry' }));
    expect(controller.retry).toHaveBeenCalledOnce();
  });

  it('offers cancellation only when the Project authority advertises verified support', async () => {
    const user = userEvent.setup();
    const controller = projectController({
      attempt: processingAttempt({ cancellation: 'available' }),
    });
    renderBar(workflow(true), controller);

    await user.click(screen.getByRole('button', { name: 'Cancel provider operation' }));

    expect(controller.cancel).toHaveBeenCalledOnce();
  });

  it('can clear the local editor while an earlier unsupported provider operation continues', async () => {
    const user = userEvent.setup();
    const onRequestDiscard = vi.fn();
    const controller = projectController({
      attempt: processingAttempt({
        capability: 'virtual-try-on',
        phase: 'processing',
        isCurrent: false,
        cancellation: 'unsupported',
      }),
    });
    renderBar(workflow(true), controller, onRequestDiscard);

    await user.click(screen.getByRole('button', { name: 'Clear local editor' }));

    expect(onRequestDiscard).toHaveBeenCalledOnce();
    expect(controller.cancel).not.toHaveBeenCalled();
  });
});
