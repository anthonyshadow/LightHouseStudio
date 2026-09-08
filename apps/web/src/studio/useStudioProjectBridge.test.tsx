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

/** The stage artifact `sourceInput` becomes once the runtime has published it. */
const presentedProjectMedia: PresentedRecordingArtifact = {
  id: sourceInput.artifactMetadata.id,
  media: sourceInput.blob,
  objectUrl: 'blob:project-source',
  mimeType: sourceInput.artifactMetadata.mimeType,
  filename: sourceInput.artifactMetadata.filename,
  sourceModeId: sourceInput.artifactMetadata.sourceModeId,
  startedAt: sourceInput.artifactMetadata.startedAt,
  durationMs: sourceInput.artifactMetadata.durationMs,
  sizeBytes: sourceInput.blob.size,
};

/**
 * The three inputs a case here moves between renders. Everything else the bridge takes is either
 * fixed for the file or a port the case hands in.
 */
type BridgeProps = {
  readonly projectId: string;
  readonly lifecycle: RecordingLifecycle;
  readonly original: PresentedRecordingArtifact | null;
};

type BridgePorts = Pick<
  Parameters<typeof useStudioProjectBridge>[0],
  'presentSource' | 'clearSource'
>;

/**
 * One rendering for every case, with the defaults an idle stage holding nothing.
 *
 * `rerender` takes only what moves and fills the rest back from the initial render, so what a case
 * shows is the change it is about rather than the two inputs it is carrying along unchanged.
 */
const renderBridge = (ports: BridgePorts, initial: Partial<BridgeProps> = {}) => {
  const props: BridgeProps = {
    projectId: firstProjectId,
    lifecycle: 'idle',
    original: null,
    ...initial,
  };
  const { rerender, ...hook } = renderHook(
    ({ projectId, lifecycle, original }: BridgeProps) =>
      useStudioProjectBridge({
        projectId,
        recordingLifecycle: lifecycle,
        recordingOriginal: original,
        ...ports,
      }),
    { initialProps: props },
  );

  return { ...hook, rerender: (next: Partial<BridgeProps>) => rerender({ ...props, ...next }) };
};

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
    const clearSource = vi.fn(() => true);
    const hook = renderBridge({ presentSource, clearSource });
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
    const clearSource = vi.fn(() => true);
    const hook = renderBridge({ presentSource, clearSource });

    act(() => hook.result.current.sourceRuntime.present(firstProjectId, sourceInput));
    act(() => hook.result.current.sourceRuntime.clear(secondProjectId));

    expect(presentSource).toHaveBeenCalledOnce();
    expect(clearSource).not.toHaveBeenCalled();
  });

  it('finishes a clear the runtime refused once the take that refused it releases the stage', () => {
    let finalizing = true;
    const presentSource = vi.fn();
    // Answers like `recording.discard`: `false` means a take is still finalizing and owns the
    // stage, and nothing else.
    const clearSource = vi.fn(() => !finalizing);
    const hook = renderBridge(
      { presentSource, clearSource },
      { lifecycle: 'stopping', original: presentedProjectMedia },
    );
    const runtime = hook.result.current.sourceRuntime;

    act(() => {
      runtime.present(firstProjectId, sourceInput);
      // The unmounting source controller's passive cleanup, refused mid-finalization.
      runtime.clear(firstProjectId);
    });
    expect(clearSource).toHaveBeenCalledOnce();

    // Finalization ended without publishing over the Project's media, so the clear is still owed
    // and is now free to complete rather than waiting for a `present` that never comes.
    finalizing = false;
    hook.rerender({ lifecycle: 'error' });
    expect(clearSource).toHaveBeenCalledTimes(2);

    // The bridge's record of the stage recovered with the stage itself: a Project that no longer
    // holds it, and is no longer the route's Project, can no longer clear it.
    hook.rerender({ projectId: secondProjectId, lifecycle: 'error' });
    act(() => hook.result.current.sourceRuntime.clear(firstProjectId));
    expect(clearSource).toHaveBeenCalledTimes(2);
  });

  it('settles a refused clear without discarding the take that replaced the Project media', () => {
    const newTake: PresentedRecordingArtifact = {
      ...presentedProjectMedia,
      id: 'video-second-take',
      objectUrl: 'blob:video-second-take',
    };
    const presentSource = vi.fn();
    const clearSource = vi.fn(() => false);
    const hook = renderBridge(
      { presentSource, clearSource },
      { lifecycle: 'stopping', original: presentedProjectMedia },
    );

    act(() => {
      hook.result.current.sourceRuntime.present(firstProjectId, sourceInput);
      hook.result.current.sourceRuntime.clear(firstProjectId);
    });
    expect(clearSource).toHaveBeenCalledOnce();

    // The take finished and published over the Project's media: the stage owes the Project
    // nothing, and the fresh take the operator has not reviewed must survive.
    hook.rerender({ lifecycle: 'recorded', original: newTake });
    expect(clearSource).toHaveBeenCalledOnce();

    hook.rerender({ projectId: secondProjectId, lifecycle: 'recorded', original: newTake });
    act(() => hook.result.current.sourceRuntime.clear(firstProjectId));
    expect(clearSource).toHaveBeenCalledOnce();
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
    const hook = renderBridge({ presentSource: vi.fn(), clearSource: vi.fn(() => true) });

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
    const hook = renderBridge(
      { presentSource: vi.fn(), clearSource: vi.fn(() => true) },
      { lifecycle: 'recorded', original: remote },
    );

    expect(hook.result.current.recordingCandidate).toBeNull();
  });
});
