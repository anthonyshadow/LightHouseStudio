import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RecordingArtifact, RecordingLifecycle } from '../features/recording/types';
import type { ProjectRecordingCandidate } from '../features/projects/ProjectRouteSurface';
import type {
  ProjectSourceActivity,
  ProjectSourceRuntime,
} from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';

interface UseStudioProjectBridgeOptions {
  readonly projectId: string | null;
  readonly recordingLifecycle: RecordingLifecycle;
  readonly recordingOriginal: RecordingArtifact | null;
  readonly presentSource: (input: Parameters<ProjectSourceRuntime['present']>[1]) => void;
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
  const presentSourceRef = useRef(presentSource);
  const clearSourceRef = useRef(clearSource);
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const [session, setSession] = useState<ProjectSessionPort | null>(null);

  useLayoutEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  useLayoutEffect(() => {
    presentSourceRef.current = presentSource;
    clearSourceRef.current = clearSource;
  }, [clearSource, presentSource]);

  const sourceRuntime = useMemo<ProjectSourceRuntime>(
    () => ({
      present: (candidateProjectId, input) => {
        if (projectIdRef.current !== candidateProjectId) return;
        presentSourceRef.current(input);
      },
      clear: (candidateProjectId) => {
        if (projectIdRef.current !== candidateProjectId) return;
        clearSourceRef.current();
      },
    }),
    [],
  );

  const handleSourceActivity = useCallback((activity: ProjectSourceActivity) => {
    if (projectIdRef.current === activity.projectId) setSourceActivity(activity);
  }, []);

  const activeSourceActivity = sourceActivity?.projectId === projectId ? sourceActivity : null;
  const activeSession = session?.projectId === projectId ? session : null;

  const recordingCandidate = useMemo<ProjectRecordingCandidate | null>(() => {
    if (recordingLifecycle !== 'recorded' || !recordingOriginal) return null;
    return {
      file: new File([recordingOriginal.media], recordingOriginal.filename, {
        type: recordingOriginal.mimeType,
        lastModified: new Date(recordingOriginal.startedAt).valueOf(),
      }),
      ready: true,
    };
  }, [recordingLifecycle, recordingOriginal]);

  return {
    sourceRuntime,
    sourceActivity: activeSourceActivity,
    session: activeSession,
    recordingCandidate,
    handleSourceActivity,
    handleSession: setSession,
  } as const;
};
