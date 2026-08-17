// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createDefaultVideoEditSpec, type VideoEditSpec } from '@studio/domain';
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
    showingBefore: false,
    playheadMs: 2_500,
    phase: 'editing',
    progress: 0,
    error: null,
    candidate: null,
    lastApplied: null,
    dirty: true,
    supported: true,
    canUndo: true,
    canRedo: true,
    begin: vi.fn(),
    close: vi.fn(),
    setActiveTool: vi.fn(),
    setShowingBefore: vi.fn(),
    setPlayheadMs: vi.fn(),
    applySpec: vi.fn(),
    beginTransaction: vi.fn(),
    previewSpec: vi.fn(),
    commitTransaction: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    resetTool: vi.fn(),
    resetAll: vi.fn(),
    startRender: vi.fn(() => Promise.resolve()),
    cancelRender: vi.fn(),
    resumeEditing: vi.fn(),
    beginCommit: vi.fn(),
    failCommit: vi.fn(),
    completeCommit: vi.fn(),
    ...overrides,
  };
};

const renderWorkspace = (session: VideoEditSession, onRequestDiscard = vi.fn()) =>
  render(
    <StudioDesignProvider>
      <VideoEditWorkspace session={session} onRequestDiscard={onRequestDiscard} />
    </StudioDesignProvider>,
  );

const renderProjectWorkspace = (
  session: VideoEditSession,
  appliedProjectEdit: VideoEditSpec | null,
) =>
  render(
    <StudioDesignProvider>
      <VideoEditWorkspace
        session={session}
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
    fireEvent.click(screen.getByRole('button', { name: 'Preview before' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo video edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redo video edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset tool' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save edited video' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crop' }));

    expect(session.applySpec).toHaveBeenCalledTimes(2);
    expect(session.setShowingBefore).toHaveBeenCalledWith(true);
    expect(session.undo).toHaveBeenCalledOnce();
    expect(session.redo).toHaveBeenCalledOnce();
    expect(session.resetTool).toHaveBeenCalledOnce();
    expect(session.resetAll).toHaveBeenCalledOnce();
    expect(session.startRender).toHaveBeenCalledOnce();
    expect(onRequestDiscard).toHaveBeenCalledOnce();
    expect(session.setActiveTool).toHaveBeenCalledWith('crop');
  });

  it.each([
    ['crop', '1:1'],
    ['rotate', 'Rotate right'],
    ['rotate', 'Flip horizontal'],
    ['lighting', 'Brightness'],
    ['filters', 'Warm'],
  ] as const)('applies %s control %s', (activeTool, controlName) => {
    const session = createSession({ activeTool });
    renderWorkspace(session);
    const control =
      controlName === 'Brightness'
        ? screen.getByRole('slider', { name: controlName })
        : screen.getByRole('button', { name: controlName });

    if (controlName === 'Brightness') {
      fireEvent.pointerDown(control);
      fireEvent.change(control, { target: { value: '20' } });
      fireEvent.pointerUp(control);
      expect(session.previewSpec).toHaveBeenCalledWith(
        expect.objectContaining({
          adjustments: expect.objectContaining({ brightness: 20 }) as VideoEditSpec['adjustments'],
        }),
      );
      expect(session.commitTransaction).toHaveBeenCalled();
    } else {
      fireEvent.click(control);
      expect(session.applySpec).toHaveBeenCalled();
    }
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
    ).toHaveTextContent('Rendering does not save Project media');
    expect(screen.getByText('Applied Project edit').closest('[role="status"]')).toHaveTextContent(
      'New controls start from that rendered baseline',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Render preview' }));
    expect(session.startRender).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Save edited video' })).not.toBeInTheDocument();
  });
});
