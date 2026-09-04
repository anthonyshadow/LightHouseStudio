// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createDefaultVideoEditSpec, type SubtitleCue, type VideoEditSpec } from '@studio/domain';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { VideoEditSession } from './useVideoEditSession';
import { formatVideoEditTime } from './types';
import { VideoEditWorkspace } from './VideoEditWorkspace';
import { projectVideoEditOutcome } from '../../studio/projectVideoEditOutcome';

afterEach(cleanup);

const source = {
  artifact: {
    id: 'source-video',
    media: new Blob(['video'], { type: 'video/mp4' }),
    objectUrl: 'blob:source-video',
    mimeType: 'video/mp4',
    filename: 'source.mp4',
    sourceModeId: 'local' as const,
    startedAt: '2026-08-04T12:00:00.000Z',
    durationMs: 10_000,
    sizeBytes: 5,
  },
  metadata: {
    kind: 'uploaded' as const,
    mode: 'local' as const,
    selectedAt: '2026-08-04T12:00:00.000Z',
    displayName: 'source.mp4',
    container: 'mp4' as const,
    videoCodec: 'avc' as const,
    audioCodec: null,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    sizeBytes: 5,
    hasAudio: false,
  },
};

const createSession = (overrides: Partial<VideoEditSession> = {}): VideoEditSession => {
  const draft = createDefaultVideoEditSpec(source.metadata.durationMs);
  return {
    source,
    baseline: draft,
    draft,
    activeTool: 'trim',
    selectedSubtitleId: null,
    showingBefore: false,
    splitComparison: false,
    playheadMs: 2_500,
    phase: 'editing',
    progress: 0,
    error: null,
    candidate: null,
    dirty: true,
    supported: true,
    canUndo: true,
    canRedo: true,
    begin: vi.fn(),
    close: vi.fn(),
    setActiveTool: vi.fn(),
    setSelectedSubtitleId: vi.fn(),
    setShowingBefore: vi.fn(),
    setSplitComparison: vi.fn(),
    setPlayheadMs: vi.fn(),
    applySpec: vi.fn(),
    beginTransaction: vi.fn(),
    previewSpec: vi.fn(),
    commitTransaction: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    resetTool: vi.fn(),
    resetAll: vi.fn(),
    removeSubtitleCue: vi.fn(),
    startRender: vi.fn(() => Promise.resolve()),
    cancelRender: vi.fn(),
    resumeEditing: vi.fn(),
    beginCommit: vi.fn(),
    failCommit: vi.fn(),
    completeCommit: vi.fn(),
    ...overrides,
  };
};

const renderWorkspace = (session: VideoEditSession, onRequestDiscard = vi.fn()) => {
  const videoRef = createRef<HTMLVideoElement>();
  return render(
    <StudioDesignProvider>
      <video ref={videoRef} data-testid="editor-source-video">
        <track kind="captions" />
      </video>
      <VideoEditWorkspace
        session={session}
        videoRef={videoRef}
        onRequestDiscard={onRequestDiscard}
      />
    </StudioDesignProvider>,
  );
};

const subtitleCue = (id: string, text: string, startMs: number, endMs: number): SubtitleCue => ({
  id,
  text,
  startMs,
  endMs,
  placement: 'bottom',
});

const renderProjectWorkspace = (
  session: VideoEditSession,
  appliedProjectEdit: VideoEditSpec | null,
) =>
  render(
    <StudioDesignProvider>
      <VideoEditWorkspace
        session={session}
        videoRef={createRef<HTMLVideoElement>()}
        onRequestDiscard={vi.fn()}
        outcome={projectVideoEditOutcome(appliedProjectEdit)}
      />
    </StudioDesignProvider>,
  );

describe('VideoEditWorkspace', () => {
  it('formats editor time consistently for controls and playback', () => {
    expect(formatVideoEditTime(-1)).toBe('00:00');
    expect(formatVideoEditTime(65_999)).toBe('01:05');
  });

  it('operates trim, history, before/after, save, reset, discard, and tool navigation controls', () => {
    const session = createSession();
    const onRequestDiscard = vi.fn();
    renderWorkspace(session, onRequestDiscard);

    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Start time' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Start time' }), {
      target: { value: '1000' },
    });
    fireEvent.pointerUp(screen.getByRole('slider', { name: 'Start time' }));
    expect(session.beginTransaction).toHaveBeenCalled();
    expect(session.previewSpec).toHaveBeenCalledWith(
      expect.objectContaining({ trim: { startMs: 1_000, endMs: 10_000 } }),
    );
    expect(session.commitTransaction).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Set start to playhead' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set end to playhead' }));
    const compare = screen.getByRole('button', {
      name: 'Hold to show original. Keyboard shortcut C.',
    });
    fireEvent.pointerDown(compare, { pointerId: 1 });
    fireEvent.pointerUp(compare, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save edited video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));

    expect(session.applySpec).toHaveBeenCalledTimes(2);
    expect(session.setShowingBefore).toHaveBeenNthCalledWith(1, true);
    expect(session.setShowingBefore).toHaveBeenNthCalledWith(2, false);
    expect(session.undo).toHaveBeenCalledOnce();
    expect(session.redo).toHaveBeenCalledOnce();
    expect(session.resetTool).toHaveBeenCalledOnce();
    expect(session.resetAll).toHaveBeenCalledOnce();
    expect(session.startRender).toHaveBeenCalledOnce();
    expect(onRequestDiscard).toHaveBeenCalledOnce();
    expect(session.setActiveTool).toHaveBeenCalledWith('crop');
  });

  it('uses the persistent stage video for timeline playback, frame stepping, and trim handles', () => {
    const session = createSession();
    renderWorkspace(session);
    const video = screen.getByTestId<HTMLVideoElement>('editor-source-video');
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    Object.defineProperties(video, {
      paused: { configurable: true, value: true },
      play: { configurable: true, value: play },
      pause: { configurable: true, value: pause },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Play edited preview' }));
    expect(play).toHaveBeenCalledOnce();

    const playhead = screen.getByRole('slider', {
      name: 'Timeline playhead. Use left and right arrows to step one frame.',
    });
    fireEvent.change(playhead, { target: { value: '1200' } });
    expect(video.currentTime).toBe(1.2);
    expect(session.setPlayheadMs).toHaveBeenCalledWith(1_200);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag trim in point' }), {
      key: 'ArrowRight',
    });
    fireEvent.keyUp(screen.getByRole('button', { name: 'Drag trim in point' }), {
      key: 'ArrowRight',
    });
    expect(session.beginTransaction).toHaveBeenCalled();
    expect(session.previewSpec).toHaveBeenCalled();
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('holds compare from the C key, toggles split, and collapses the inspector with Escape', () => {
    const session = createSession();
    renderWorkspace(session);

    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyUp(window, { key: 'c' });
    expect(session.setShowingBefore).toHaveBeenNthCalledWith(1, true);
    expect(session.setShowingBefore).toHaveBeenNthCalledWith(2, false);

    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    expect(session.setSplitComparison).toHaveBeenCalledWith(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it.each([
    ['crop', '1:1'],
    ['rotate', 'Rotate right'],
    ['rotate', 'Flip horizontal'],
    ['lighting', 'Brightness'],
    ['filters', 'Warm'],
    ['audio', 'Level'],
    ['audio', 'Mute'],
  ] as const)('applies %s control %s', (activeTool, controlName) => {
    const session = createSession({ activeTool });
    renderWorkspace(session);
    const sliderPreview: Partial<Record<typeof controlName, Partial<VideoEditSpec>>> = {
      Brightness: {
        adjustments: expect.objectContaining({ brightness: 20 }) as VideoEditSpec['adjustments'],
      },
      Level: { audio: { level: 20, muted: false } },
    };
    const expected = sliderPreview[controlName];
    const control = expected
      ? screen.getByRole('slider', { name: controlName })
      : screen.getByRole('button', { name: controlName });

    if (expected) {
      fireEvent.pointerDown(control);
      fireEvent.change(control, { target: { value: '20' } });
      fireEvent.pointerUp(control);
      expect(session.previewSpec).toHaveBeenCalledWith(expect.objectContaining(expected));
      expect(session.commitTransaction).toHaveBeenCalled();
    } else {
      fireEvent.click(control);
      expect(session.applySpec).toHaveBeenCalled();
    }
  });

  it('mutes without forgetting the level, and shows the muted state as pressed', () => {
    const session = createSession({ activeTool: 'audio' });
    renderWorkspace(session);
    const mute = screen.getByRole('button', { name: 'Mute' });
    expect(mute).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('slider', { name: 'Level' })).toHaveValue('100');

    fireEvent.click(mute);
    expect(session.applySpec).toHaveBeenCalledWith(
      expect.objectContaining({ audio: { level: 100, muted: true } }),
    );

    const draft = {
      ...createDefaultVideoEditSpec(source.metadata.durationMs),
      audio: { level: 35, muted: true },
    };
    cleanup();
    renderWorkspace(createSession({ activeTool: 'audio', draft }));
    expect(screen.getByRole('button', { name: 'Muted' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'Level' })).toHaveValue('35');
  });

  it('announces progress and errors while preserving a usable unsupported state', () => {
    const rendering = createSession({ phase: 'rendering', progress: 0.42 });
    const view = renderWorkspace(rendering);
    expect(screen.getByText('Rendering locally').closest('[role="status"]')).toHaveTextContent(
      'Rendering locally42%',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel render' }));
    expect(rendering.cancelRender).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <VideoEditWorkspace
          session={createSession({ supported: false, phase: 'error', error: 'Render failed.' })}
          videoRef={createRef<HTMLVideoElement>()}
          onRequestDiscard={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByText('Local editor unavailable')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Render failed.');
    expect(screen.getByRole('button', { name: 'Save edited video' })).toBeDisabled();
  });

  it('labels a Project render as temporary and shows the exact applied edit baseline', () => {
    const session = createSession();
    renderProjectWorkspace(session, session.draft);

    expect(
      screen.getByText('Temporary Render preview').closest('[role="status"]'),
    ).toHaveTextContent('Rendering saves nothing yet');
    expect(screen.getByText('Applied Project edit').closest('[role="status"]')).toHaveTextContent(
      'New controls start from that render',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Render preview' }));
    expect(session.startRender).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Save edited video' })).not.toBeInTheDocument();
  });

  it('says when the applied Project edit burned subtitles in, and what that means', () => {
    const session = createSession();
    renderProjectWorkspace(session, {
      ...session.draft,
      subtitles: [subtitleCue('cue-1', 'Hello', 0, 1_000), subtitleCue('cue-2', 'World', 1, 2)],
    });
    const notice = screen.getByText('Applied Project edit').closest('[role="status"]');
    expect(notice).toHaveTextContent('with 2 subtitles burned in');
    expect(notice).toHaveTextContent('edit again from a cut that does not carry them');
  });

  it('adds a subtitle at the playhead and opens it for typing', () => {
    const session = createSession({ activeTool: 'subtitles' });
    renderWorkspace(session);
    expect(screen.getByText(/No subtitles yet/u)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add subtitle at playhead' }));
    expect(session.applySpec).toHaveBeenCalledWith(
      expect.objectContaining({
        subtitles: [
          expect.objectContaining({ text: '', startMs: 2_500, endMs: 4_500, placement: 'bottom' }),
        ],
      }),
    );
    const added = vi.mocked(session.applySpec).mock.calls[0]![0].subtitles[0]!;
    expect(session.setSelectedSubtitleId).toHaveBeenCalledWith(added.id);
  });

  it('edits the selected subtitle as one undo entry per focus, repositions, seeks to and deletes it', () => {
    const cue = subtitleCue('cue-1', 'Hello', 1_000, 2_000);
    const session = createSession({
      activeTool: 'subtitles',
      draft: { ...createDefaultVideoEditSpec(source.metadata.durationMs), subtitles: [cue] },
      selectedSubtitleId: 'cue-1',
    });
    renderWorkspace(session);
    const video = screen.getByTestId<HTMLVideoElement>('editor-source-video');

    const text = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.focus(text);
    fireEvent.change(text, { target: { value: 'Hello there' } });
    fireEvent.blur(text);
    expect(session.beginTransaction).toHaveBeenCalledOnce();
    expect(session.previewSpec).toHaveBeenCalledWith(
      expect.objectContaining({ subtitles: [{ ...cue, text: 'Hello there' }] }),
    );
    expect(session.commitTransaction).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Top' }));
    expect(session.applySpec).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtitles: [{ ...cue, placement: 'top' }] }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Set end to playhead' }));
    expect(session.applySpec).toHaveBeenLastCalledWith(
      expect.objectContaining({ subtitles: [{ ...cue, endMs: 2_500 }] }),
    );

    const row = within(screen.getByRole('list', { name: 'Subtitles' })).getByRole('button');
    expect(row).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(row);
    expect(session.setSelectedSubtitleId).toHaveBeenCalledWith('cue-1');
    expect(session.setPlayheadMs).toHaveBeenCalledWith(1_000);
    expect(video.currentTime).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Delete subtitle' }));
    expect(session.removeSubtitleCue).toHaveBeenCalledExactlyOnceWith('cue-1');
  });

  it('keeps Escape from collapsing the inspector while a subtitle is being typed', () => {
    const cue = subtitleCue('cue-1', 'Hello', 1_000, 2_000);
    const session = createSession({
      activeTool: 'subtitles',
      draft: { ...createDefaultVideoEditSpec(source.metadata.durationMs), subtitles: [cue] },
      selectedSubtitleId: 'cue-1',
    });
    renderWorkspace(session);

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Text' }), { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Collapse inspector' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows subtitles as a lane of cue buttons that select, nudge, move and delete', () => {
    const first = subtitleCue('cue-1', 'Hello', 1_000, 3_000);
    const second = subtitleCue('cue-2', 'World', 2_000, 4_000);
    const session = createSession({
      draft: {
        ...createDefaultVideoEditSpec(source.metadata.durationMs),
        subtitles: [first, second],
      },
    });
    renderWorkspace(session);
    const lane = screen.getByRole('group', { name: 'Subtitles on the timeline' });
    const blocks = within(lane).getAllByRole('button');
    expect(blocks).toHaveLength(2);
    // The two overlap, so the second takes a row of its own.
    expect(blocks[0]).toHaveAttribute('data-row', '0');
    expect(blocks[1]).toHaveAttribute('data-row', '1');
    expect(blocks[0]).toHaveAccessibleName('Subtitle 1: Hello, 00:01.00 to 00:03.00');

    fireEvent.click(blocks[0]!);
    expect(session.setSelectedSubtitleId).toHaveBeenCalledWith('cue-1');
    expect(session.setPlayheadMs).toHaveBeenCalledWith(1_000);

    fireEvent.keyDown(blocks[0]!, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyUp(blocks[0]!, { key: 'ArrowRight', shiftKey: true });
    expect(session.beginTransaction).toHaveBeenCalled();
    const nudged = vi.mocked(session.previewSpec).mock.calls.at(-1)![0].subtitles[0]!;
    expect(nudged.startMs).toBeCloseTo(1_000 + 10 * (1_000 / 30));
    expect(nudged.endMs - nudged.startMs).toBeCloseTo(2_000);
    expect(session.commitTransaction).toHaveBeenCalled();

    const track = screen.getByLabelText('Editable video timeline');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1_000,
      bottom: 44,
      left: 0,
      width: 1_000,
      height: 44,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(blocks[1]!, { pointerId: 1, clientX: 300 });
    fireEvent.pointerMove(blocks[1]!, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(blocks[1]!, { pointerId: 1 });
    const moved = vi.mocked(session.previewSpec).mock.calls.at(-1)![0].subtitles[1]!;
    expect(moved.startMs).toBeCloseTo(3_000);
    expect(moved.endMs).toBeCloseTo(5_000);

    fireEvent.keyDown(blocks[1]!, { key: 'Delete' });
    expect(session.removeSubtitleCue).toHaveBeenCalledExactlyOnceWith('cue-2');
  });
});
