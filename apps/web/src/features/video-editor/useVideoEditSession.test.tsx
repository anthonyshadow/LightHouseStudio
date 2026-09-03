// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoEditSpec } from '@studio/domain';
import type { RecordingArtifact, UploadedTakeMetadata } from '../recording/types';

const adapters = vi.hoisted(() => ({
  renderVideoEdit: vi.fn(),
  validateEditedVideoOutput: vi.fn(),
}));

vi.mock('./renderVideoEdit', () => ({
  renderVideoEdit: adapters.renderVideoEdit,
  videoEditRenderingSupported: () => true,
}));
vi.mock('./videoEditSupport', () => ({
  videoEditPreviewSupported: () => true,
}));
vi.mock('../existing-video/videoValidation', () => ({
  validateEditedVideoOutput: adapters.validateEditedVideoOutput,
}));

import { useVideoEditSession } from './useVideoEditSession';

const source = () => {
  const media = new Blob(['source'], { type: 'video/mp4' });
  const artifact: RecordingArtifact = {
    id: 'source-artifact',
    kind: 'uploaded',
    parentArtifactId: null,
    media,
    objectUrl: 'blob:source-artifact',
    mimeType: 'video/mp4',
    filename: 'source.mp4',
    sourceModeId: 'local',
    startedAt: '2026-08-04T10:00:00.000Z',
    durationMs: 10_000,
    sizeBytes: media.size,
  };
  const metadata: UploadedTakeMetadata = {
    kind: 'uploaded',
    mode: 'local',
    selectedAt: '2026-08-04T10:00:00.000Z',
    displayName: 'source.mp4',
    container: 'mp4',
    videoCodec: 'avc',
    audioCodec: null,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    sizeBytes: media.size,
    hasAudio: false,
  };
  return { artifact, metadata };
};

const beginSession = () => {
  const hook = renderHook(() => useVideoEditSession());
  act(() => hook.result.current.begin(source()));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
  const editedFile = new File(['edited'], 'source-edited.mp4', { type: 'video/mp4' });
  adapters.validateEditedVideoOutput.mockResolvedValue({
    file: editedFile,
    mimeType: 'video/mp4',
    audioSidecar: null,
    audioUnavailableReason: null,
    metadata: {
      ...source().metadata,
      displayName: editedFile.name,
      sizeBytes: editedFile.size,
    },
  });
});

describe('useVideoEditSession', () => {
  it('resets transient compare modes when a source begins or closes', () => {
    const hook = beginSession();
    act(() => {
      hook.result.current.setShowingBefore(true);
      hook.result.current.setSplitComparison(true);
    });
    expect(hook.result.current.showingBefore).toBe(true);
    expect(hook.result.current.splitComparison).toBe(true);

    act(() => hook.result.current.close());
    expect(hook.result.current.showingBefore).toBe(false);
    expect(hook.result.current.splitComparison).toBe(false);
  });

  it('groups a slider or crop gesture into one undo entry and preserves redo', () => {
    const hook = beginSession();
    act(() => hook.result.current.beginTransaction());
    act(() => {
      hook.result.current.previewSpec({
        ...hook.result.current.draft,
        adjustments: { ...hook.result.current.draft.adjustments, brightness: 20 },
      });
    });
    act(() => {
      hook.result.current.previewSpec({
        ...hook.result.current.draft,
        adjustments: { ...hook.result.current.draft.adjustments, brightness: 45 },
      });
    });
    act(() => hook.result.current.commitTransaction());

    expect(hook.result.current.draft.adjustments.brightness).toBe(45);
    expect(hook.result.current.canUndo).toBe(true);
    act(() => hook.result.current.undo());
    expect(hook.result.current.draft.adjustments.brightness).toBe(0);
    expect(hook.result.current.canUndo).toBe(false);
    act(() => hook.result.current.redo());
    expect(hook.result.current.draft.adjustments.brightness).toBe(45);
  });

  it('caps history at 50 entries', () => {
    const hook = beginSession();
    for (let brightness = 1; brightness <= 55; brightness += 1) {
      act(() => {
        hook.result.current.applySpec({
          ...hook.result.current.draft,
          adjustments: { ...hook.result.current.draft.adjustments, brightness },
        });
      });
    }
    for (let index = 0; index < 50; index += 1) {
      act(() => hook.result.current.undo());
    }
    expect(hook.result.current.draft.adjustments.brightness).toBe(5);
    expect(hook.result.current.canUndo).toBe(false);
  });

  it('coalesces duplicate Save requests and advances through render and validation', async () => {
    let finishRender: ((value: { blob: Blob; mimeType: 'video/mp4' }) => void) | null = null;
    adapters.renderVideoEdit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRender = resolve;
        }),
    );
    const hook = beginSession();
    act(() => {
      hook.result.current.applySpec({
        ...hook.result.current.draft,
        filter: 'vivid',
      });
    });

    act(() => {
      void hook.result.current.startRender();
      void hook.result.current.startRender();
    });
    expect(adapters.renderVideoEdit).toHaveBeenCalledOnce();
    expect(hook.result.current.phase).toBe('rendering');

    await act(async () => {
      finishRender?.({ blob: new Blob(['edited'], { type: 'video/mp4' }), mimeType: 'video/mp4' });
      await Promise.resolve();
    });
    await waitFor(() => expect(hook.result.current.phase).toBe('awaiting-replacement'));
    expect(adapters.validateEditedVideoOutput).toHaveBeenCalledOnce();
  });

  it('neither counts nor renders an untyped subtitle, and renders the finalized draft', async () => {
    adapters.renderVideoEdit.mockResolvedValue({
      blob: new Blob(['edited'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
    });
    const hook = beginSession();
    const untyped = {
      id: 'cue-1',
      text: '',
      startMs: 0,
      endMs: 1_000,
      placement: 'bottom' as const,
    };
    act(() => {
      hook.result.current.applySpec({ ...hook.result.current.draft, subtitles: [untyped] });
    });
    expect(hook.result.current.draft.subtitles).toHaveLength(1);
    expect(hook.result.current.dirty).toBe(false);

    act(() => {
      hook.result.current.applySpec({
        ...hook.result.current.draft,
        subtitles: [{ ...untyped, text: '  Hello  ' }],
      });
    });
    expect(hook.result.current.dirty).toBe(true);
    await act(async () => {
      await hook.result.current.startRender();
    });
    const rendered = { ...untyped, text: 'Hello' };
    expect(adapters.renderVideoEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({ subtitles: [rendered] }) as VideoEditSpec,
      }),
    );
    expect(hook.result.current.candidate?.spec.subtitles).toEqual([rendered]);
  });

  it('removes a subtitle in one history entry and lets go of it as the selection', () => {
    const hook = beginSession();
    const keep = { id: 'cue-1', text: 'Keep', startMs: 0, endMs: 1_000, placement: 'top' as const };
    const drop = {
      id: 'cue-2',
      text: 'Drop',
      startMs: 2_000,
      endMs: 3_000,
      placement: 'top' as const,
    };
    act(() => {
      hook.result.current.applySpec({ ...hook.result.current.draft, subtitles: [keep, drop] });
      hook.result.current.setSelectedSubtitleId('cue-2');
    });

    act(() => hook.result.current.removeSubtitleCue('cue-2'));
    expect(hook.result.current.draft.subtitles).toEqual([keep]);
    expect(hook.result.current.selectedSubtitleId).toBeNull();

    act(() => hook.result.current.setSelectedSubtitleId('cue-1'));
    act(() => hook.result.current.undo());
    expect(hook.result.current.draft.subtitles).toEqual([keep, drop]);
    expect(hook.result.current.selectedSubtitleId).toBe('cue-1');
  });

  it('resets the Subtitles tool to the baseline and forgets the selection when a source begins', () => {
    const hook = beginSession();
    const cue = { id: 'cue-1', text: 'Hi', startMs: 0, endMs: 1_000, placement: 'top' as const };
    act(() => {
      hook.result.current.setActiveTool('subtitles');
      hook.result.current.setSelectedSubtitleId('cue-1');
      hook.result.current.applySpec({ ...hook.result.current.draft, subtitles: [cue] });
    });
    expect(hook.result.current.selectedSubtitleId).toBe('cue-1');
    expect(hook.result.current.dirty).toBe(true);

    act(() => hook.result.current.resetTool());
    expect(hook.result.current.draft.subtitles).toEqual([]);
    expect(hook.result.current.dirty).toBe(false);

    act(() => hook.result.current.begin(source()));
    expect(hook.result.current.selectedSubtitleId).toBeNull();
  });

  it('ignores a stale completion after cancellation and leaves the draft intact', async () => {
    let finishRender: ((value: { blob: Blob; mimeType: 'video/mp4' }) => void) | null = null;
    adapters.renderVideoEdit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRender = resolve;
        }),
    );
    const hook = beginSession();
    act(() => {
      hook.result.current.applySpec({
        ...hook.result.current.draft,
        filter: 'warm',
      });
    });
    act(() => void hook.result.current.startRender());
    act(() => hook.result.current.cancelRender());
    expect(hook.result.current.phase).toBe('editing');

    await act(async () => {
      finishRender?.({ blob: new Blob(['stale'], { type: 'video/mp4' }), mimeType: 'video/mp4' });
      await Promise.resolve();
    });
    expect(adapters.validateEditedVideoOutput).not.toHaveBeenCalled();
    expect(hook.result.current.candidate).toBeNull();
    expect(hook.result.current.draft.filter).toBe('warm');
  });
});
