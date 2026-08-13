// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ExistingVideoActionBar } from './ExistingVideoActionBar';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

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

const renderBar = (value: ExistingVideoWorkflow) =>
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
        onFinish={vi.fn()}
        onEditSelected={vi.fn()}
        onStartOver={vi.fn()}
        onRequestDiscard={vi.fn()}
      />
    </StudioDesignProvider>,
  );

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
});
