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
  pendingChanges: false,
  error: null,
  liveSeconds: 0,
  generationSeconds: 0,
  applying: false,
  startLocal: vi.fn().mockResolvedValue(undefined),
  preflight: vi.fn().mockResolvedValue(undefined),
  startModel: vi.fn().mockResolvedValue(undefined),
  applyChanges: vi.fn().mockResolvedValue(undefined),
  revertDraft: vi.fn(),
  stopModel: vi.fn(),
  resetModel: vi.fn(),
  stopCamera: vi.fn(),
  releaseForRecordedReview: vi.fn().mockResolvedValue(undefined),
  selectMode: vi.fn().mockReturnValue(true),
  canReplaceRecipeDraft: vi.fn().mockReturnValue(true),
  replaceRecipeDraft: vi.fn().mockReturnValue(true),
  updatePrompt: vi.fn(),
  updateEnhancement: vi.fn(),
  updateReferenceImage: vi.fn(),
  updateImage: vi.fn(),
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
    expect(session.selectMode).toHaveBeenCalledWith('lucy-2.5');
  });

  it('preserves the visible portrait guidance and explicit workshop action', async () => {
    const user = userEvent.setup();
    const onOpenWorkshop = vi.fn();
    renderComposer(createSession('lucy-2.5'), onOpenWorkshop);

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
    const session = createSession('lucy-vton-3');
    const view = renderComposer(session);

    expect(view.container.querySelector('[data-scroll-region="recipe-dock"]')).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Start Virtual Try-On AI' });
    expect(start).toBeDisabled();
    expect(start).toHaveAccessibleDescription(
      'Add a garment direction or garment reference to start.',
    );
    expect(session.startModel).not.toHaveBeenCalled();
  });

  it('communicates real preflight and live provider state without changing controllers', () => {
    const applied = {
      mode: 'lucy-2.5' as const,
      prompt: 'Adult field correspondent',
      referenceImage: null,
      referenceIdentity: null,
      enhance: true,
    };
    const view = renderComposer(
      createSession('lucy-2.5', {
        lifecycle: 'ready',
        localStream: {} as MediaStream,
      }),
    );

    expect(screen.getByText('Camera & microphone checked')).toBeInTheDocument();

    view.rerender(
      <StudioDesignProvider>
        <SessionComposer
          session={createSession('lucy-2.5', {
            draft: {
              ...createEmptyDraft('lucy-2.5'),
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
    expect(screen.getByRole('heading', { name: 'Applied recipe' })).toBeInTheDocument();
    expect(screen.getByText('Video ready')).toBeInTheDocument();
  });

  it('locks recipe editing controls while recording', () => {
    const session = createSession('lucy-2.5', {
      draft: { ...createEmptyDraft('lucy-2.5'), prompt: 'Adult presenter' },
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
    const session = createSession('lucy-vton-3', {
      draft: { ...createEmptyDraft('lucy-vton-3'), prompt: 'navy wool jacket' },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderComposer(session);

    await user.click(screen.getByRole('button', { name: 'Clear draft' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(session.resetModel).not.toHaveBeenCalled();
  });

  it('moves focus to intentional actions when async session controls are replaced', async () => {
    const idle = createSession('lucy-2.5', {
      draft: { ...createEmptyDraft('lucy-2.5'), prompt: 'Adult field host' },
    });
    const view = renderComposer(idle);
    screen.getByRole('button', { name: 'Start Character AI' }).focus();

    view.rerender(
      <StudioDesignProvider>
        <SessionComposer
          session={createSession('lucy-2.5', {
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
