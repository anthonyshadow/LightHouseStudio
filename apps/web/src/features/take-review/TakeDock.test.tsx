// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import { TakeDock } from './TakeDock';

const artifact = (): RecordingArtifact => {
  const media = new Blob(['take'], { type: 'video/webm' });
  return {
    id: 'take-1',
    media,
    objectUrl: 'blob:take-1',
    mimeType: media.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-18T18:32:00.000Z',
    durationMs: 2_500,
    sizeBytes: media.size,
  };
};

const recording = (): RecordingController => {
  const original = artifact();
  return {
    lifecycle: 'recorded',
    activeSource: null,
    metadata: {
      mode: 'local',
      startedAt: original.startedAt,
      width: 1_920,
      height: 1_080,
      frameRate: 29.97,
      videoSource: 'local',
      audioSource: 'microphone',
      videoSourceLabel: 'FaceTime HD Camera',
      audioSourceLabel: 'Studio Microphone',
    },
    original,
    visual: null,
    processed: null,
    presented: original,
    sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
    recordingError: null,
    processingState: 'idle',
    processingOperation: null,
    processingError: null,
    elapsedSeconds: 2,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(original),
    restorePersistedOriginal: vi.fn().mockReturnValue(original),
    presentRemoteOriginal: vi.fn().mockReturnValue(original),
    replaceSource: vi.fn().mockReturnValue(original),
    discard: vi.fn(() => true),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeVisualProcessing: vi.fn().mockReturnValue(original),
    completeProcessing: vi.fn().mockReturnValue(original),
    failProcessing: vi.fn(),
    repairPresentedObjectUrl: vi.fn().mockReturnValue(false),
    clearVisualProcessing: vi.fn(),
    restoreOriginal: vi.fn(),
  };
};

const processing: VoiceProcessingController = {
  selection: { kind: 'none' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyLocalTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: artifact() }),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  applyElevenLabsTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: artifact() }),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TakeDock metadata', () => {
  it('leads with duration and resolution and keeps every other value one disclosure away', async () => {
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
        />
      </StudioDesignProvider>,
    );

    // Only what a review decision needs is inline.
    const summary = within(screen.getByRole('list', { name: 'Take summary' }));
    expect(summary.getByText('1920 × 1080')).toBeInTheDocument();
    expect(summary.queryByText('29.97 fps')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Take details' })).not.toBeVisible();

    await user.click(screen.getByText('Details'));

    // Nothing was deleted; it is one click away.
    const details = within(screen.getByRole('list', { name: 'Take details' }));
    expect(details.getByText('Local Camera')).toBeInTheDocument();
    expect(details.getByText('Video: FaceTime HD Camera')).toHaveAttribute(
      'title',
      'FaceTime HD Camera',
    );
    expect(details.getByText('Audio: Studio Microphone')).toBeInTheDocument();
    expect(details.getByText('29.97 fps')).toBeInTheDocument();
    expect(screen.queryByText('browser default format')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Recorded take playback')).not.toBeInTheDocument();
  });

  it('shows the panel title once, and keeps the heading as the region label', () => {
    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
        />
      </StudioDesignProvider>,
    );

    const heading = screen.getByRole('heading', { name: 'Latest take' });
    expect(heading).toHaveAttribute('id', 'take-heading');
    expect(screen.getByRole('region', { name: 'Latest take' })).toBeInTheDocument();
  });

  it('discards only after confirmation and delegates overlay closure after acceptance', async () => {
    const user = userEvent.setup();
    const controller = recording();
    const onCloseTake = vi.fn();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onCloseTake={onCloseTake}
        />
      </StudioDesignProvider>,
    );

    const discard = screen.getByRole('button', { name: 'Discard' });
    await user.click(discard);
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(controller.discard).not.toHaveBeenCalled();
    expect(onCloseTake).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard take' }));
    expect(controller.discard).toHaveBeenCalledOnce();
    expect(onCloseTake).toHaveBeenCalledOnce();
  });

  it('offers a retained uploaded-video workflow action when provided', async () => {
    const user = userEvent.setup();
    const onEditVideo = vi.fn();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onEditVideo={onEditVideo}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit video' }));
    expect(onEditVideo).toHaveBeenCalledOnce();
  });

  it('offers Record another take as a menu row that says what the press destroys', async () => {
    const user = userEvent.setup();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onRecordAnotherTake={vi.fn(() => true)}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));

    // The accessible name stays the label; the destruction is announced as the description.
    const retake = screen.getByRole('menuitem', { name: 'Record another take' });
    expect(retake).toHaveAccessibleDescription('Discards this take and starts the camera again.');
    expect(retake).toHaveAttribute('aria-disabled', 'false');
  });

  it('leaves the take standing when the discard is declined, and returns focus to the menu trigger', async () => {
    const user = userEvent.setup();
    const discard = vi.fn(() => true);
    const controller: RecordingController = { ...recording(), discard };
    const onRecordAnotherTake = vi.fn(() => true);

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onRecordAnotherTake={onRecordAnotherTake}
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'More actions for this take' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Record another take' }));

    // The take-review question, verbatim, with the sentence that names the restart.
    expect(
      await screen.findByRole('dialog', { name: 'Discard this take?' }),
    ).toHaveAccessibleDescription(
      'It only exists in this browser tab, so it cannot be recovered once you discard it. The camera starts again so you can record.',
    );

    await user.click(screen.getByRole('button', { name: 'Stay' }));

    expect(discard).not.toHaveBeenCalled();
    expect(onRecordAnotherTake).not.toHaveBeenCalled();
    // Selecting the row closed the menu, so the trigger is the only element that survived it.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('returns focus to the control that opened the dialog, not to the one before it', async () => {
    const user = userEvent.setup();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onRecordAnotherTake={vi.fn(() => true)}
        />
      </StudioDesignProvider>,
    );

    // One press through the menu, declined: it leaves the menu trigger as its return target.
    const trigger = screen.getByRole('button', { name: 'More actions for this take' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Record another take' }));
    await user.click(await screen.findByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(trigger).toHaveFocus());

    // A second press, from a control the earlier one never touched. The dialog they share must
    // answer to this press: focus belongs on Discard, not on the trigger the retake left behind.
    const discard = screen.getByRole('button', { name: 'Discard' });
    await user.click(discard);
    await user.click(await screen.findByRole('button', { name: 'Stay' }));

    await waitFor(() => expect(discard).toHaveFocus());
  });

  it('hands a confirmed retake to one owner, which discards before the surface does anything else', async () => {
    const user = userEvent.setup();
    const discard = vi.fn(() => true);
    const controller: RecordingController = { ...recording(), discard };
    const onCloseTake = vi.fn();
    const onDiscardTake = vi.fn();
    // The double is `restartCapture`: one act that discards, ends the handoff and re-acquires, and
    // answers whether the discard was allowed.
    const onRecordAnotherTake = vi.fn(() => controller.discard());

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onCloseTake={onCloseTake}
          onDiscardTake={onDiscardTake}
          onRecordAnotherTake={onRecordAnotherTake}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));
    await user.click(screen.getByRole('menuitem', { name: 'Record another take' }));
    await user.click(await screen.findByRole('button', { name: 'Discard and record' }));

    expect(onRecordAnotherTake).toHaveBeenCalledOnce();
    // No camera can be asked for before the take is gone, because the take goes first inside the
    // one call this surface makes, and everything else follows it.
    const [discardOrder = 0] = discard.mock.invocationCallOrder;
    const [selectionResetOrder = 0] = onDiscardTake.mock.invocationCallOrder;
    expect(discardOrder).toBeGreaterThan(0);
    expect(selectionResetOrder).toBeGreaterThan(discardOrder);
    // Two idempotent closes already follow the discard, and only one of them owns focus.
    expect(onCloseTake).not.toHaveBeenCalled();
  });

  it('keeps review open with a notice when the restart refuses, and does nothing further', async () => {
    const user = userEvent.setup();
    const discard = vi.fn(() => true);
    const controller: RecordingController = { ...recording(), discard };
    const onCloseTake = vi.fn();
    const onDiscardTake = vi.fn();
    const onRecordAnotherTake = vi.fn(() => false);

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onCloseTake={onCloseTake}
          onDiscardTake={onDiscardTake}
          onRecordAnotherTake={onRecordAnotherTake}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));
    await user.click(screen.getByRole('menuitem', { name: 'Record another take' }));
    await user.click(await screen.findByRole('button', { name: 'Discard and record' }));

    expect(onRecordAnotherTake).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(onDiscardTake).not.toHaveBeenCalled();
    expect(onCloseTake).not.toHaveBeenCalled();
    // Awaited rather than queried: the notice is behind the dismissed dialog's isolation until the
    // overlay finishes leaving.
    // The restart begins with a discard, and the only other thing that could refuse — a browser that
    // cannot capture — is a condition this action is never offered under, so the finalization is the
    // one cause left to name.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This take is still finishing, so nothing was discarded. Try again in a moment.',
    );
    expect(screen.getByRole('button', { name: 'Discard' })).toBeEnabled();
  });

  it('skips the question for a take that is already saved', async () => {
    const user = userEvent.setup();
    const onRecordAnotherTake = vi.fn(() => true);

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          hasUnsavedChanges={false}
          onRecordAnotherTake={onRecordAnotherTake}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));
    await user.click(screen.getByRole('menuitem', { name: 'Record another take' }));

    // Nothing recoverable is destroyed, which is the bargain `Close without saving` already strikes.
    expect(onRecordAnotherTake).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps review open with a notice when a confirmed Discard is refused', async () => {
    const user = userEvent.setup();
    const discard = vi.fn(() => false);
    const controller: RecordingController = { ...recording(), discard };
    const onCloseTake = vi.fn();
    const onDiscardTake = vi.fn();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onCloseTake={onCloseTake}
          onDiscardTake={onDiscardTake}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard take' }));

    expect(discard).toHaveBeenCalledOnce();
    // The operator answered "Discard take" and the take is still there; nothing downstream may act
    // as though it went.
    expect(onDiscardTake).not.toHaveBeenCalled();
    expect(onCloseTake).not.toHaveBeenCalled();
    // This discard is the surface's own, and it refuses for exactly one reason: the same sentence
    // the retake shows, because the retake's refusal is this same discard's.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This take is still finishing, so nothing was discarded. Try again in a moment.',
    );
  });
});
