import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ownedRecordingArtifact,
  type PresentedRecordingArtifact,
  type RecordingLifecycle,
} from '../features/recording/types';
import type { ProjectRecordingCandidate } from '../features/projects/ProjectRouteSurface';
import type { ProjectWorkingMediaActivity } from '../features/projects/ProjectWorkingMediaSection';
import type {
  ProjectSourceActivity,
  ProjectStageSourceRuntime,
} from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';

interface UseStudioProjectBridgeOptions {
  readonly projectId: string | null;
  readonly recordingLifecycle: RecordingLifecycle;
  readonly recordingOriginal: PresentedRecordingArtifact | null;
  readonly presentSource: (input: Parameters<ProjectStageSourceRuntime['present']>[1]) => void;
  /** Answers whether the stage is now clear; `false` means a take is still finalizing. */
  readonly clearSource: () => boolean;
}

export const useStudioProjectBridge = ({
  projectId,
  recordingLifecycle,
  recordingOriginal,
  presentSource,
  clearSource,
}: UseStudioProjectBridgeOptions) => {
  const projectIdRef = useRef(projectId);
  /** The Project whose media is on the stage right now, which outlives its route being left. */
  const presentedProjectIdRef = useRef<string | null>(null);
  /**
   * Which artifact that Project put there. A take published after a refused clear takes the same
   * stage slot, so identity is the only thing that tells the Project's own media apart from a take
   * the operator has yet to see.
   */
  const presentedArtifactIdRef = useRef<string | null>(null);
  /** A clear this port accepted and the runtime refused, still owed to whoever asked for it. */
  const clearOwedRef = useRef(false);
  const presentSourceRef = useRef(presentSource);
  const clearSourceRef = useRef(clearSource);
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const [workingMediaActivity, setWorkingMediaActivity] =
    useState<ProjectWorkingMediaActivity | null>(null);
  const [session, setSession] = useState<ProjectSessionPort | null>(null);

  useLayoutEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useLayoutEffect(() => {
    presentSourceRef.current = presentSource;
    clearSourceRef.current = clearSource;
  }, [clearSource, presentSource]);

  /** The stage holds nothing of this Project's, and nothing is owed on its behalf. */
  const releaseStage = useCallback(() => {
    presentedProjectIdRef.current = null;
    presentedArtifactIdRef.current = null;
    clearOwedRef.current = false;
  }, []);

  const sourceRuntime = useMemo<ProjectStageSourceRuntime>(
    () => ({
      kind: 'stage',
      present: (candidateProjectId, input) => {
        if (projectIdRef.current !== candidateProjectId) return;
        presentedProjectIdRef.current = candidateProjectId;
        presentedArtifactIdRef.current = input.artifactMetadata.id;
        // Fresh media settles any clear still owed: what the refusal meant to take off the stage
        // is no longer on it.
        clearOwedRef.current = false;
        presentSourceRef.current(input);
      },
      /**
       * A Project may always relinquish media it put on the stage, even once the route has moved
       * on. The unmounting source controller clears in a passive cleanup, by which point the
       * layout effect above has already retargeted `projectIdRef` — so matching only that would
       * drop the one clear that matters and strand the Project's source as a phantom take.
       *
       * The clear itself may refuse while a take is still finalizing, so the ref is released only
       * once the stage actually is — nulling it first was that same phantom take by another name.
       * A refusal is recorded rather than propagated: this port answers `void`, and the source
       * controller has already declared the Project sourceless by the time it hears anything, so
       * the debt is settled by the effect below instead of by giving that controller a failure
       * phase it has nothing left to retry from.
       */
      clear: (candidateProjectId) => {
        if (
          projectIdRef.current !== candidateProjectId &&
          presentedProjectIdRef.current !== candidateProjectId
        ) {
          return;
        }
        if (!clearSourceRef.current()) {
          clearOwedRef.current = true;
          return;
        }
        releaseStage();
      },
    }),
    [releaseStage],
  );

  /**
   * Finishes a refused clear, so the two owners cannot sit permanently disagreeing: the source
   * controller has already gone on treating the Project as sourceless, and this side is the only
   * one still able to see the stage.
   *
   * A refusal means one thing — a take was finalizing — and finalization ends either by publishing
   * an original over the Project's media or by failing and leaving that media where it is. What
   * the stage now holds tells the two apart. A different artifact settles the debt on its own,
   * and must: discarding there would throw away a take the operator has not reviewed yet. The same
   * artifact means the debt is real and the clear is now free to complete. Anything still
   * finalizing simply waits for the next lifecycle change, which the bounded finalization
   * guarantees will come.
   */
  useEffect(() => {
    if (!clearOwedRef.current) return;
    if ((recordingOriginal?.id ?? null) !== presentedArtifactIdRef.current) {
      releaseStage();
      return;
    }
    if (!clearSourceRef.current()) return;
    releaseStage();
  }, [recordingLifecycle, recordingOriginal, releaseStage]);

  const handleSourceActivity = useCallback((activity: ProjectSourceActivity) => {
    if (projectIdRef.current === activity.projectId) setSourceActivity(activity);
  }, []);

  const handleWorkingMediaActivity = useCallback((activity: ProjectWorkingMediaActivity) => {
    if (projectIdRef.current === activity.projectId) setWorkingMediaActivity(activity);
  }, []);

  const activeSourceActivity = sourceActivity?.projectId === projectId ? sourceActivity : null;
  const activeWorkingMediaActivity =
    workingMediaActivity?.projectId === projectId ? workingMediaActivity : null;
  const activeSession = session?.projectId === projectId ? session : null;

  const recordingCandidate = useMemo<ProjectRecordingCandidate | null>(() => {
    // Declares owned bytes: only a finalized take the runtime holds can become a source upload.
    // A URL-backed presentation is already the accepted source and is never a candidate.
    const owned =
      recordingLifecycle === 'recorded' ? ownedRecordingArtifact(recordingOriginal) : null;
    if (!owned) return null;
    return {
      file: new File([owned.media], owned.filename, {
        type: owned.mimeType,
        lastModified: new Date(owned.startedAt).valueOf(),
      }),
      ready: true,
    };
  }, [recordingLifecycle, recordingOriginal]);

  return {
    sourceRuntime,
    sourceActivity: activeSourceActivity,
    workingMediaActivity: activeWorkingMediaActivity,
    session: activeSession,
    recordingCandidate,
    handleSourceActivity,
    handleWorkingMediaActivity,
    handleSession: setSession,
  } as const;
};
