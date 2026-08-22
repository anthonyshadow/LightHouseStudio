// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import type {
  PresentedRecordingArtifact,
  RecordingArtifact,
  RecordingLifecycle,
} from '../features/recording/types';
import { useStudioProjectBridge } from './useStudioProjectBridge';

const firstProjectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const secondProjectId = '730c73ca-a6af-4509-83c0-b3c18c1ee81a';

const sourceInput = {
  blob: new Blob(['source'], { type: 'video/mp4' }),
  artifactMetadata: {
    id: 'project-source',
    mimeType: 'video/mp4',
    filename: 'source.mp4',
    sourceModeId: 'local' as const,
    startedAt: '2026-08-12T16:00:00.000Z',
    durationMs: 1_000,
  },
};

const activity = (projectId: string): ProjectSourceActivity => ({
  projectId,
  accepted: false,
  phase: 'idle',
  busy: false,
  abort: null,
});

const session = (projectId: string): ProjectSessionPort => ({
  projectId,
  phase: 'saved',
  current: null,
  proposal: null,
  hasLocalProposal: false,
  message: null,
  propose: vi.fn(),
  flush: vi.fn(),
  retry: vi.fn(),
  discard: vi.fn(),
  getCurrent: vi.fn(() => null),
  acceptCurrent: vi.fn(),
});

afterEach(cleanup);

describe('useStudioProjectBridge', () => {
  it('keeps project media callbacks route-scoped and hides stale activity', () => {
    const presentSource = vi.fn();
    const clearSource = vi.fn();
    const hook = renderHook(
      ({ projectId }) =>
        useStudioProjectBridge({
          projectId,
          recordingLifecycle: 'idle',
          recordingOriginal: null,
          presentSource,
          clearSource,
        }),
      { initialProps: { projectId: firstProjectId } },
    );
    const runtime = hook.result.current.sourceRuntime;

    act(() => {
      runtime.present(firstProjectId, sourceInput);
      hook.result.current.handleSourceActivity(activity(firstProjectId));
      hook.result.current.handleWorkingMediaActivity({
        projectId: firstProjectId,
        busy: true,
      });
      hook.result.current.handleSession(session(firstProjectId));
    });

    expect(presentSource).toHaveBeenCalledWith(sourceInput);
    expect(hook.result.current.sourceActivity?.projectId).toBe(firstProjectId);
    expect(hook.result.current.workingMediaActivity).toEqual({
      projectId: firstProjectId,
      busy: true,
    });
    expect(hook.result.current.session?.projectId).toBe(firstProjectId);

    hook.rerender({ projectId: secondProjectId });
    expect(hook.result.current.sourceRuntime).toBe(runtime);
    expect(hook.result.current.sourceActivity).toBeNull();
    expect(hook.result.current.workingMediaActivity).toBeNull();
    expect(hook.result.current.session).toBeNull();

    act(() => {
      // The left-behind Project can no longer present onto the stage it no longer owns …
      runtime.present(firstProjectId, sourceInput);
      // … but it must still be able to take back the media it put there, which is what its
      // unmounting source controller does after the route has already moved on.
      runtime.clear(firstProjectId);
      runtime.present(secondProjectId, sourceInput);
      runtime.clear(secondProjectId);
    });

    expect(presentSource).toHaveBeenCalledTimes(2);
    expect(clearSource).toHaveBeenCalledTimes(2);
  });

  it('refuses a clear from a Project that never presented onto the stage', () => {
    const presentSource = vi.fn();
    const clearSource = vi.fn();
    const hook = renderHook(() =>
      useStudioProjectBridge({
        projectId: firstProjectId,
        recordingLifecycle: 'idle',
        recordingOriginal: null,
        presentSource,
        clearSource,
      }),
    );

    act(() => hook.result.current.sourceRuntime.present(firstProjectId, sourceInput));
    act(() => hook.result.current.sourceRuntime.clear(secondProjectId));

    expect(presentSource).toHaveBeenCalledOnce();
    expect(clearSource).not.toHaveBeenCalled();
  });

  it('publishes a fresh project recording candidate only for a finalized artifact', () => {
    const media = new Blob(['take'], { type: 'video/webm' });
    const artifact: RecordingArtifact = {
      id: 'take-1',
      media,
      objectUrl: 'blob:take-1',
      mimeType: media.type,
      filename: 'take.webm',
      sourceModeId: 'local',
      startedAt: '2026-08-12T16:00:00.000Z',
      durationMs: 2_000,
      sizeBytes: media.size,
    };
    const hook = renderHook(
      ({
        lifecycle,
        original,
      }: {
        lifecycle: RecordingLifecycle;
        original: RecordingArtifact | null;
      }) =>
        useStudioProjectBridge({
          projectId: firstProjectId,
          recordingLifecycle: lifecycle,
          recordingOriginal: original,
          presentSource: vi.fn(),
          clearSource: vi.fn(),
        }),
      {
        initialProps: {
          lifecycle: 'idle' as RecordingLifecycle,
          original: null as RecordingArtifact | null,
        },
      },
    );

    expect(hook.result.current.recordingCandidate).toBeNull();
    hook.rerender({ lifecycle: 'recorded', original: artifact });

    expect(hook.result.current.recordingCandidate).toMatchObject({ ready: true });
    expect(hook.result.current.recordingCandidate?.file).toMatchObject({
      name: artifact.filename,
      type: artifact.mimeType,
      lastModified: new Date(artifact.startedAt).valueOf(),
    });
    expect(hook.result.current.recordingCandidate?.file).not.toBe(media);
  });

  it('never offers a URL-backed presentation as a recording candidate', () => {
    const remote: PresentedRecordingArtifact = {
      id: 'streamed-1',
      media: {
        kind: 'remote-presentation',
        contentUrl: '/api/projects/p/source/content',
        sizeBytes: 4,
        mimeType: 'video/mp4',
      },
      objectUrl: '/api/projects/p/source/content',
      mimeType: 'video/mp4',
      filename: 'streamed.mp4',
      sourceModeId: 'local',
      startedAt: '2026-08-12T16:00:00.000Z',
      durationMs: 2_000,
      sizeBytes: 4,
    };
    const hook = renderHook(() =>
      useStudioProjectBridge({
        projectId: firstProjectId,
        recordingLifecycle: 'recorded',
        recordingOriginal: remote,
        presentSource: vi.fn(),
        clearSource: vi.fn(),
      }),
    );

    expect(hook.result.current.recordingCandidate).toBeNull();
  });
});
