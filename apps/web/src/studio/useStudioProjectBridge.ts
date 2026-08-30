import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  readonly clearSource: () => void;
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

  const sourceRuntime = useMemo<ProjectStageSourceRuntime>(
    () => ({
      kind: 'stage',
      present: (candidateProjectId, input) => {
        if (projectIdRef.current !== candidateProjectId) return;
        presentedProjectIdRef.current = candidateProjectId;
        presentSourceRef.current(input);
      },
      /**
       * A Project may always relinquish media it put on the stage, even once the route has moved
       * on. The unmounting source controller clears in a passive cleanup, by which point the
       * layout effect above has already retargeted `projectIdRef` — so matching only that would
       * drop the one clear that matters and strand the Project's source as a phantom take.
       */
      clear: (candidateProjectId) => {
        if (
          projectIdRef.current !== candidateProjectId &&
          presentedProjectIdRef.current !== candidateProjectId
        ) {
          return;
        }
        presentedProjectIdRef.current = null;
        clearSourceRef.current();
      },
    }),
    [],
  );

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
