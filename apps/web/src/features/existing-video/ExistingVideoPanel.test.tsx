// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ExistingVideoPanel } from './ExistingVideoPanel';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

const workflow = (overrides: Partial<ExistingVideoWorkflow> = {}): ExistingVideoWorkflow => ({
  selection: null,
  steps: [],
  phase: 'empty',
  message: null,
  status: null,
  completedStepCount: 0,
  submittedModels: [],
  acceptedSubmission: false,
  pendingVisual: null,
  retryJob: null,
  comparison: 'result',
  elapsedSeconds: 0,
  active: false,
  providerActive: false,
  selectFile: vi.fn(),
  addStep: vi.fn(),
  updateStep: vi.fn(),
  removeStep: vi.fn(),
  moveStep: vi.fn(),
  submitStep: vi.fn(),
  retryFinalization: vi.fn(),
  retryExistingJob: vi.fn(),
  finishAtCheckpoint: vi.fn(),
  cancelBeforeAcceptance: vi.fn(),
  reset: vi.fn(),
  showOriginal: vi.fn(),
  showResult: vi.fn(),
  ...overrides,
});

afterEach(cleanup);

describe('ExistingVideoPanel', () => {
  it('offers a keyboard-operable picker before any provider or camera work', () => {
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow()}
          videoProcessingAvailable={false}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select video' })).toBeEnabled();
    expect(screen.getByText(/MP4\/H.264/u)).toBeInTheDocument();
    expect(screen.queryByText(/Decart submission/u)).not.toBeInTheDocument();
  });

  it('shows metadata, explicit ordering controls, and the exact request count', () => {
    const addStep = vi.fn();
    const moveStep = vi.fn();
    const source = new File(['video'], 'a very long local source name.mp4', {
      type: 'video/mp4',
    });
    const ready = workflow({
      selection: {
        file: source,
        mimeType: 'video/mp4',
        audioSidecar: null,
        audioUnavailableReason: null,
        metadata: {
          kind: 'uploaded',
          mode: 'local',
          selectedAt: '2026-07-30T12:00:00.000Z',
          displayName: source.name,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: null,
          durationMs: 30_000,
          width: 1_920,
          height: 1_080,
          sizeBytes: 5_000_000,
          hasAudio: false,
        },
      },
      steps: [
        {
          id: 'lucy',
          modelId: 'lucy-2.5',
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
        },
        {
          id: 'vto',
          modelId: 'lucy-vton-3',
          prompt: 'Apply the jacket',
          enhancePrompt: false,
          referenceImage: null,
        },
      ],
      phase: 'ready',
      addStep,
      moveStep,
    });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={ready} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(source.name)).toHaveAttribute('title', source.name);
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getByText(/2 planned Decart submissions/u)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!);
    expect(moveStep).toHaveBeenCalledWith(0, 1);
    expect(
      screen.getByRole('button', { name: 'Start first · 2 planned submissions' }),
    ).toBeEnabled();
  });

  it('keeps recipe fields editable after an accepted job interruption and explains resume semantics', () => {
    const updateStep = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const interrupted = workflow({
      selection: {
        file: source,
        mimeType: 'video/mp4',
        audioSidecar: null,
        audioUnavailableReason: null,
        metadata: {
          kind: 'uploaded',
          mode: 'local',
          selectedAt: '2026-07-30T12:00:00.000Z',
          displayName: source.name,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: null,
          durationMs: 30_000,
          width: 1_920,
          height: 1_080,
          sizeBytes: 5_000_000,
          hasAudio: false,
        },
      },
      steps: [
        {
          id: 'lucy',
          modelId: 'lucy-2.5',
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
        },
      ],
      phase: 'error',
      message: 'The status check was interrupted.',
      acceptedSubmission: true,
      retryJob: { jobId: crypto.randomUUID(), stepIndex: 0 },
      updateStep,
    });

    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={interrupted} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    const prompt = screen.getByPlaceholderText('Describe the character or visual edit');
    expect(prompt).toBeEnabled();
    fireEvent.change(prompt, { target: { value: 'Make the character a robot' } });
    expect(updateStep).toHaveBeenCalledWith('lucy', {
      prompt: 'Make the character a robot',
    });
    expect(screen.getAllByRole('button', { name: 'Remove' })).toEqual([
      expect.objectContaining({ disabled: true }),
      expect.objectContaining({ disabled: true }),
    ]);
    expect(
      screen.getByRole('button', { name: 'Resume accepted job · no new submission' }),
    ).toBeEnabled();
    expect(screen.getByText(/checks and downloads the original accepted recipe/u)).toBeVisible();
  });
});
