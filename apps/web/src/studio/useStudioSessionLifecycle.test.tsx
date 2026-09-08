// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StudioCreativeLocks, StudioRuntimeStatus } from '../app/shell/studioRuntimeWork';
import type { VoiceProcessingOutcome } from '../features/voice-effects/types';
import { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';
import { ownedTakeArtifact, recordingControllerDouble } from '../test/recordingController';
import { useStudioSessionLifecycle } from './useStudioSessionLifecycle';

type LifecycleOptions = Parameters<typeof useStudioSessionLifecycle>[0];
type LifecycleProcessing = LifecycleOptions['processing'];
type LifecycleSession = LifecycleOptions['session'];
type LifecycleExistingVideo = LifecycleOptions['existingVideo'];
type LifecycleVideoEditor = LifecycleOptions['videoEditor'];
type LifecycleOutfit = LifecycleOptions['outfit'];
type LifecycleCharacter = LifecycleOptions['character'];
type LifecycleProjectWorkingMedia = LifecycleOptions['projectWorkingMedia'];

const voiceOutcome = (): VoiceProcessingOutcome => ({
  status: 'ready',
  artifact: ownedTakeArtifact(),
});

const processingDouble = (cancelProcessing: () => void): LifecycleProcessing => ({
  selection: { kind: 'none' },
  applyLocal: vi.fn(() => Promise.resolve()),
  applyLocalTo: vi.fn(() => Promise.resolve(voiceOutcome())),
  applyElevenLabs: vi.fn(() => Promise.resolve()),
  applyElevenLabsTo: vi.fn(() => Promise.resolve(voiceOutcome())),
  restoreOriginal: vi.fn(),
  cancel: cancelProcessing,
});

/*
 * The ports this hook barely touches, stood in for by the members it actually reads.
 *
 * A `Pick` rather than a free-hand object, so each member is still checked against the real port,
 * and one assertion each rather than several hundred lines of unrelated session, workflow, editor
 * and builder surface. The pattern `useStudioRecordingLaunch.test.tsx` and
 * `useOwnedMediaAcquisition.test.tsx` already use.
 */
const sessionDouble = (stopCamera: () => Promise<void>): LifecycleSession => {
  const double: Pick<LifecycleSession, 'stopCamera'> = { stopCamera };
  return double as LifecycleSession;
};

const existingVideoDouble = (
  reset: (discardTake?: boolean) => boolean,
  workflowCleanup: () => Promise<void>,
): LifecycleExistingVideo => {
  const double: Pick<LifecycleExistingVideo, 'reset' | 'cleanup' | 'providerActive'> = {
    reset,
    cleanup: workflowCleanup,
    providerActive: false,
  };
  return double as LifecycleExistingVideo;
};

const videoEditorDouble = (): LifecycleVideoEditor => {
  const double: Pick<LifecycleVideoEditor, 'dirty' | 'phase'> = { dirty: false, phase: 'closed' };
  return double as LifecycleVideoEditor;
};

const outfitDouble = (updateDirty: (dirty: boolean) => void): LifecycleOutfit => {
  const double: Pick<LifecycleOutfit, 'dirty' | 'updateDirty'> = { dirty: false, updateDirty };
  return double as LifecycleOutfit;
};

const characterDouble = (discardWardrobeDirty: () => void): LifecycleCharacter => {
  const double: Pick<LifecycleCharacter, 'wardrobeDirty' | 'discardWardrobeDirty'> = {
    wardrobeDirty: false,
    discardWardrobeDirty,
  };
  return double as LifecycleCharacter;
};

const projectWorkingMediaDouble = (): LifecycleProjectWorkingMedia => {
  const double: Pick<LifecycleProjectWorkingMedia, 'busy'> = { busy: false };
  return double as LifecycleProjectWorkingMedia;
};

const noCreativeLocks: StudioCreativeLocks = {
  characterActivity: undefined,
  characterOpen: undefined,
  characterRemoval: undefined,
  characterSave: undefined,
};

interface SetupOptions {
  /** What `recording.discard()` answers — false means a take still being finalized. */
  readonly discards?: boolean;
  /** Held open where a case needs to watch the teardown wait on the existing-video cleanup. */
  readonly workflowCleanup?: () => Promise<void>;
}

const setup = ({
  discards = true,
  workflowCleanup = () => Promise.resolve(),
}: SetupOptions = {}) => {
  const collaborators = {
    discard: vi.fn(() => discards),
    cancelProcessing: vi.fn(),
    reset: vi.fn((_discardTake?: boolean) => true),
    workflowCleanup: vi.fn(workflowCleanup),
    updateOutfitDirty: vi.fn((_dirty: boolean) => undefined),
    discardWardrobeDirty: vi.fn(),
    discardSavedVideoWork: vi.fn(),
    discardPendingAdoption: vi.fn(),
    closeOverlay: vi.fn(),
    stopCamera: vi.fn(() => Promise.resolve()),
    report: vi.fn((_status: StudioRuntimeStatus) => undefined),
  };
  const coordinator = new SessionCleanupCoordinator();
  // Every case here starts from a runtime holding a take, which is the only state in which there is
  // anything for `discardTemporaryWork` to refuse to let go of.
  const take = ownedTakeArtifact();
  const options: LifecycleOptions = {
    registry: { cleanup: coordinator, report: collaborators.report },
    creativeLocks: noCreativeLocks,
    session: sessionDouble(collaborators.stopCamera),
    recording: recordingControllerDouble({
      lifecycle: 'recorded',
      original: take,
      presented: take,
      discard: collaborators.discard,
    }),
    processing: processingDouble(collaborators.cancelProcessing),
    recordingActive: false,
    finalizing: false,
    existingVideo: existingVideoDouble(collaborators.reset, collaborators.workflowCleanup),
    videoEditor: videoEditorDouble(),
    outfit: outfitDouble(collaborators.updateOutfitDirty),
    character: characterDouble(collaborators.discardWardrobeDirty),
    projectWorkingMedia: projectWorkingMediaDouble(),
    projectSourceActivity: null,
    projectWorkingMediaActivity: null,
    discardSavedVideoWork: collaborators.discardSavedVideoWork,
    discardPendingAdoption: collaborators.discardPendingAdoption,
    closeOverlay: collaborators.closeOverlay,
  };
  const hook = renderHook(() => useStudioSessionLifecycle(options));

  return { hook, coordinator, ...collaborators };
};

/** Everything the local release lets go of besides the take itself. */
const expectRestOfReleasePerformed = (released: ReturnType<typeof setup>): void => {
  expect(released.discardPendingAdoption).toHaveBeenCalledOnce();
  expect(released.cancelProcessing).toHaveBeenCalledOnce();
  expect(released.updateOutfitDirty).toHaveBeenCalledWith(false);
  expect(released.discardWardrobeDirty).toHaveBeenCalledOnce();
  expect(released.discardSavedVideoWork).toHaveBeenCalledOnce();
  expect(released.closeOverlay).toHaveBeenCalledOnce();
};

afterEach(cleanup);

describe('useStudioSessionLifecycle', () => {
  it('answers true and performs the whole release when the take goes', () => {
    const context = setup();

    expect(context.hook.result.current.discardTemporaryWork()).toBe(true);

    expect(context.reset).toHaveBeenCalledWith(false);
    expect(context.discard).toHaveBeenCalledOnce();
    expectRestOfReleasePerformed(context);
    // The uploaded-video workflow is reset before the take it may be pointing at is dropped.
    const [workflowReset = 0] = context.reset.mock.invocationCallOrder;
    const [takeDiscarded = 0] = context.discard.mock.invocationCallOrder;
    expect(workflowReset).toBeGreaterThan(0);
    expect(takeDiscarded).toBeGreaterThan(workflowReset);
  });

  it('answers false when the runtime keeps a still-finalizing take, and releases the rest anyway', () => {
    const context = setup({ discards: false });

    // The answer is the caller's to act on: a shell that warned about a take must not report it
    // gone. None of the rest is the take, and stopping halfway would strand creative dirt in a
    // runtime nobody can reach any more.
    expect(context.hook.result.current.discardTemporaryWork()).toBe(false);

    expect(context.discard).toHaveBeenCalledOnce();
    expect(context.reset).toHaveBeenCalledWith(false);
    expectRestOfReleasePerformed(context);
  });

  it('ignores the refusal during teardown and still releases the camera', async () => {
    let finishWorkflowCleanup = (): void => undefined;
    const workflowCleanup = () =>
      new Promise<void>((resolve) => {
        finishWorkflowCleanup = () => resolve();
      });
    const context = setup({ discards: false, workflowCleanup });

    const teardown = context.coordinator.run();

    // The existing-video cleanup is started before the local release and awaited after it, so both
    // are in flight while the refusal is being ignored.
    expect(context.workflowCleanup).toHaveBeenCalledOnce();
    expect(context.discard).toHaveBeenCalledOnce();
    expectRestOfReleasePerformed(context);
    expect(context.stopCamera).not.toHaveBeenCalled();

    finishWorkflowCleanup();
    await teardown;

    // The one place a refused discard is knowingly disregarded: the coordinator awaits its tasks
    // with no per-task rescue, so stopping here would skip `release-media` and leave the camera
    // running after logout or expiry.
    expect(context.stopCamera).toHaveBeenCalledOnce();
  });

  it('reports the take it is holding, and reports nothing once the runtime is gone', () => {
    const context = setup();

    expect(context.report).toHaveBeenLastCalledWith({
      work: context.hook.result.current.work,
      creativeLocks: noCreativeLocks,
    });
    expect(context.hook.result.current.work.hasTemporaryTake).toBe(true);

    context.hook.unmount();

    // A runtime that has gone away is holding nothing; the shell must not offer to discard a take
    // whose artifacts it already revoked on its way out.
    const lastCall = context.report.mock.lastCall;
    expect(lastCall?.[0].work.hasTemporaryTake).toBe(false);
  });
});
