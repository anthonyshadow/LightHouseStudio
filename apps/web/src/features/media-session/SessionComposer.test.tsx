// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioSessionController } from './types';
import { StudioDesignProvider } from '../../ui';
import { createEmptyDraft, type StudioMode } from './types';
import { SessionComposer } from './SessionComposer';

afterEach(cleanup);

const createSession = (
  mode: StudioMode,
  overrides: Partial<StudioSessionController> = {},
): StudioSessionController => ({
  draft: createEmptyDraft(mode),
  applied: null,
  lifecycle: 'idle',
  localStream: null,
  remoteStream: null,
  displayStream: null,
  transformedVideoUsable: false,
  realtimeSessionTiming: null,
  pendingChanges: false,
  error: null,
  applying: false,
  microphoneEnabled: true,
  cameraEnabled: true,
  startLocal: vi.fn().mockResolvedValue(undefined),
  preflight: vi.fn().mockResolvedValue(undefined),
  startModel: vi.fn().mockResolvedValue(undefined),
  applyChanges: vi.fn().mockResolvedValue(undefined),
  revertDraft: vi.fn(),
  stopModel: vi.fn(),
  completeExpectedModelSession: vi.fn(),
  resetModel: vi.fn(),
  stopCamera: vi.fn(),
  releaseForRecordedReview: vi.fn().mockResolvedValue(undefined),
  toggleMicrophone: vi.fn(),
  toggleCamera: vi.fn(),
  selectMode: vi.fn().mockReturnValue(true),
  canReplaceRecipeDraft: vi.fn().mockReturnValue(true),
  replaceRecipeDraft: vi.fn().mockReturnValue(true),
  updatePrompt: vi.fn(),
  updateEnhancement: vi.fn(),
  updateReferenceImage: vi.fn(),
  clearError: vi.fn(),
  ...overrides,
});

const renderComposer = (session: StudioSessionController, onOpenWorkshop = vi.fn()) =>
  render(
    <StudioDesignProvider>
      <SessionComposer session={session} recording={false} onOpenWorkshop={onOpenWorkshop} />
    </StudioDesignProvider>,
  );

describe('SessionComposer', () => {
  it('keeps local capture private until the user explicitly selects or starts something', async () => {
    const user = userEvent.setup();
    const session = createSession('local');
    renderComposer(session);

    expect(screen.getByText('Private local capture')).toBeInTheDocument();
    expect(screen.queryByText(/Starting AI sends live camera/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Character · Lucy 2.5' }));
    expect(session.selectMode).toHaveBeenCalledWith('lucy-latest');
  });

  it('preserves the visible portrait guidance and explicit workshop action', async () => {
    const user = userEvent.setup();
    const onOpenWorkshop = vi.fn();
    renderComposer(createSession('lucy-latest'), onOpenWorkshop);

    expect(screen.getByLabelText('Optional portrait reference')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(
      screen.getByText(/Use a clear, well-lit portrait for the most consistent character/u),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open structured prompt workshop' }));
    expect(onOpenWorkshop).toHaveBeenCalledOnce();
  });

  it('keeps the action footer persistent and explains why an empty AI draft cannot start', () => {
    const session = createSession('lucy-vton-latest');
    const view = renderComposer(session);

    expect(view.container.querySelector('[data-scroll-region="ai-settings"]')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Start Virtual Try-On AI' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(
      'Add a garment direction or garment reference to start.',
    );
    expect(session.startModel).not.toHaveBeenCalled();
    expect(screen.getByText('Virtual Try-On guidance')).toBeInTheDocument();
    expect(
      screen.getByText(/does not predict fit, sizing, fabric behavior, or purchase accuracy/i),
    ).toBeInTheDocument();
  });

  it('shares the complete Decart disclosure beside direct AI Start', () => {
    renderComposer(
      createSession('lucy-latest', {
        draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Adult field host' },
      }),
    );

    const disclosure = screen.getByLabelText('Decart start disclosure');
    expect(disclosure).toHaveTextContent('live camera and microphone media');
    expect(disclosure).toHaveTextContent('complete applied settings');
    expect(disclosure).toHaveTextContent('Decart');
    expect(disclosure).toHaveTextContent('at most 300 seconds');
    expect(disclosure).toHaveTextContent('Stop AI ends usage');
  });

  it('keeps Project configuration and preflight available while provider Start is gated', async () => {
    const user = userEvent.setup();
    const session = createSession('lucy-latest', {
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Prepared Project character' },
    });
    render(
      <StudioDesignProvider>
        <SessionComposer
          session={session}
          recording={false}
          modelStartBlockedReason="Project provider processing is unavailable until recoverable Project processing is enabled."
          onOpenWorkshop={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const start = screen.getByRole('button', { name: 'Start Character AI' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(
      'Project provider processing is unavailable until recoverable Project processing is enabled.',
    );
    await user.click(screen.getByRole('button', { name: 'Check camera & mic' }));
    expect(session.preflight).toHaveBeenCalledOnce();
    expect(session.startModel).not.toHaveBeenCalled();
  });

  it('communicates real preflight and live provider state without changing controllers', () => {
    const applied = {
      mode: 'lucy-latest' as const,
      prompt: 'Adult field correspondent',
      referenceImage: null,
      referenceIdentity: null,
      enhance: true,
    };
    const view = renderComposer(
      createSession('lucy-latest', {
        lifecycle: 'ready',
        localStream: {} as MediaStream,
      }),
    );

    expect(screen.getByText('Camera & microphone checked')).toBeInTheDocument();

    view.rerender(
      <StudioDesignProvider>
        <SessionComposer
          session={createSession('lucy-latest', {
            draft: {
              ...createEmptyDraft('lucy-latest'),
              prompt: 'Adult field correspondent',
              enhance: true,
            },
            applied,
            lifecycle: 'generating',
            localStream: {} as MediaStream,
            remoteStream: {} as MediaStream,
            transformedVideoUsable: true,
          })}
          recording={false}
          onOpenWorkshop={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText('Character AI is live')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Applied settings' })).toBeInTheDocument();
    expect(screen.getByText('Video ready')).toBeInTheDocument();
  });

  it('locks AI setting controls while recording', () => {
    const session = createSession('lucy-latest', {
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Adult presenter' },
    });
    render(
      <StudioDesignProvider>
        <SessionComposer session={session} recording onOpenWorkshop={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByLabelText('Character direction')).toBeDisabled();
    expect(screen.getByLabelText('Optional portrait reference')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start Character AI' })).toBeDisabled();
  });

  it('does not reset a populated draft when the user declines confirmation', async () => {
    const user = userEvent.setup();
    const session = createSession('lucy-vton-latest', {
      draft: { ...createEmptyDraft('lucy-vton-latest'), prompt: 'navy wool jacket' },
    });
    renderComposer(session);

    await user.click(screen.getByRole('button', { name: 'Clear draft' }));
    await user.click(screen.getByRole('button', { name: 'Stay' }));

    expect(session.resetModel).not.toHaveBeenCalled();
  });

  it('moves focus to intentional actions when async session controls are replaced', async () => {
    const idle = createSession('lucy-latest', {
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Adult field host' },
    });
    const view = renderComposer(idle);
    screen.getByRole('button', { name: 'Start Character AI' }).focus();

    view.rerender(
      <StudioDesignProvider>
        <SessionComposer
          session={createSession('lucy-latest', {
            draft: idle.draft,
            lifecycle: 'requesting-token',
            localStream: {} as MediaStream,
          })}
          recording={false}
          onOpenWorkshop={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel AI start' })).toHaveFocus(),
    );

    view.rerender(
      <StudioDesignProvider>
        <SessionComposer session={idle} recording={false} onOpenWorkshop={vi.fn()} />
      </StudioDesignProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start Character AI' })).toHaveFocus(),
    );
  });
});
