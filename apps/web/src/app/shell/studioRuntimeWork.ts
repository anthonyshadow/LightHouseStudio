import type { ProjectSessionPort } from '../../features/projects/useProjectSession';
import type { ProjectSourceActivity } from '../../features/projects/useProjectSourceController';
import type { SessionCleanupCoordinator } from '../../orchestration/lifecycle/SessionCleanupCoordinator';

/**
 * What the authenticated shell knows about in-memory Studio work.
 *
 * The shell outlives the Studio runtime, so logout and session expiry cannot read the capture
 * graph's controllers directly — the runtime reports these signals up instead. Everything here is
 * a fact about work that would be lost, never a controller: the shell decides what to warn about,
 * the runtime decides what it is holding.
 *
 * This module must stay a leaf. `check-module-graph.mjs` counts dynamic `import()` as an edge, so
 * the shell already reaches the runtime; importing anything of the shell's back here would close
 * the cycle and fail `check:modules`.
 */
export interface StudioRuntimeWork {
  readonly hasTemporaryTake: boolean;
  readonly voiceProcessingActive: boolean;
  readonly creativeWorkDirty: boolean;
  /** True while a take is recording or finalizing, or a provider holds an accepted submission. */
  readonly recordingOrFinalizing: boolean;
  readonly videoRenderingActive: boolean;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly projectSession: ProjectSessionPort | null;
}

/** What the shell reports while no Studio runtime is mounted: nothing transient is being held. */
export const NO_STUDIO_RUNTIME_WORK: StudioRuntimeWork = Object.freeze({
  hasTemporaryTake: false,
  voiceProcessingActive: false,
  creativeWorkDirty: false,
  recordingOrFinalizing: false,
  videoRenderingActive: false,
  projectSourceActivity: null,
  projectSession: null,
});

/**
 * Why the Studio is currently refusing a creative edit, in the operator's words.
 *
 * The Character and Outfit builders are reachable from Project routes, which own no capture graph,
 * so they live in the shell — but what they are allowed to do still depends on whether media is
 * live. Every one of these is `undefined` with no runtime mounted, which is correct rather than
 * merely permissive: nothing can be recording without the graph that records.
 */
export interface StudioCreativeLocks {
  readonly characterActivity: string | undefined;
  readonly characterOpen: string | undefined;
  readonly characterRemoval: string | undefined;
  readonly characterSave: string | undefined;
}

export const NO_STUDIO_CREATIVE_LOCKS: StudioCreativeLocks = Object.freeze({
  characterActivity: undefined,
  characterOpen: undefined,
  characterRemoval: undefined,
  characterSave: undefined,
});

/** Everything the runtime tells the shell about itself, reported as one value. */
export interface StudioRuntimeStatus {
  readonly work: StudioRuntimeWork;
  readonly creativeLocks: StudioCreativeLocks;
}

export const NO_STUDIO_RUNTIME_STATUS: StudioRuntimeStatus = Object.freeze({
  work: NO_STUDIO_RUNTIME_WORK,
  creativeLocks: NO_STUDIO_CREATIVE_LOCKS,
});

/** Work the operator can be asked to discard. */
export const hasDiscardableStudioWork = (work: StudioRuntimeWork): boolean =>
  work.hasTemporaryTake ||
  work.voiceProcessingActive ||
  work.creativeWorkDirty ||
  (work.projectSourceActivity?.busy ?? false);

/** Work that must not be abandoned, so logout blocks rather than prompts. */
export const hasUninterruptibleStudioWork = (work: StudioRuntimeWork): boolean =>
  work.recordingOrFinalizing || work.videoRenderingActive;

/**
 * The seam the Studio runtime registers itself through.
 *
 * `cleanup` is the shell's existing {@link SessionCleanupCoordinator}: the runtime registers its
 * ordered teardown steps and the returned disposer unregisters them, so a runtime that unmounts
 * cannot leave the shell trying to release media that is already gone.
 */
export interface StudioRuntimeRegistry {
  readonly cleanup: SessionCleanupCoordinator;
  readonly report: (status: StudioRuntimeStatus) => void;
}
