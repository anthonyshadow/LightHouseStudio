import { useCallback, useEffect, useRef, useState } from 'react';
import type { useVideoEditSession } from '../video-editor/useVideoEditSession';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import {
  getProjectWorkingMedia,
  ProjectApiConflictError,
  uploadProjectWorkingMedia,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';

export type ProjectWorkingMediaPhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

type ProjectWorkingMediaState = Readonly<{
  projectId: string | null;
  phase: ProjectWorkingMediaPhase;
  message: string | null;
}>;

const safeMessage = (error: unknown): string =>
  error instanceof ProjectApiConflictError
    ? 'The Project changed before this render could be adopted. The Render preview is still available.'
    : error instanceof ApiClientError
      ? error.message
      : 'The Render preview could not be adopted. It remains temporary in this edit session.';

export const useProjectWorkingMediaController = (
  projectId: string | null,
  session: ProjectSessionPort | null,
  videoEditor: ReturnType<typeof useVideoEditSession>,
) => {
  const [state, setState] = useState<ProjectWorkingMediaState>(() => ({
    projectId,
    phase: 'idle',
    message: null,
  }));
  const operationRef = useRef<{ readonly signature: string; readonly key: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const phase = state.projectId === projectId ? state.phase : 'idle';
  const message = state.projectId === projectId ? state.message : null;
  const setPhase = useCallback(
    (nextPhase: ProjectWorkingMediaPhase) => {
      setState((current) => ({
        projectId,
        phase: nextPhase,
        message: current.projectId === projectId ? current.message : null,
      }));
    },
    [projectId],
  );
  const setMessage = useCallback(
    (nextMessage: string | null) => {
      setState((current) => ({
        projectId,
        phase: current.projectId === projectId ? current.phase : 'idle',
        message: nextMessage,
      }));
    },
    [projectId],
  );

  useEffect(() => {
    operationRef.current = null;
    return () => {
      controllerRef.current?.abort('project-working-media-context-replaced');
      controllerRef.current = null;
    };
  }, [projectId]);

  const adoptRenderPreview = useCallback(async (): Promise<boolean> => {
    const candidate = videoEditor.candidate;
    if (
      projectId === null ||
      session === null ||
      candidate === null ||
      videoEditor.phase !== 'awaiting-replacement' ||
      phase === 'saving'
    ) {
      return false;
    }
    if (!(await session.flush())) {
      setPhase('conflict');
      setMessage(
        'Save or resolve the current Project proposal before adopting this Render preview.',
      );
      return false;
    }
    const current = session.getCurrent();
    if (current === null) return false;
    const signature = JSON.stringify({
      projectId,
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.project.currentRevisionNumber,
      filename: candidate.validated.file.name,
      type: candidate.validated.file.type,
      size: candidate.validated.file.size,
      lastModified: candidate.validated.file.lastModified,
      localEdit: candidate.spec,
    });
    const operationKey =
      operationRef.current?.signature === signature
        ? operationRef.current.key
        : crypto.randomUUID();
    operationRef.current = { signature, key: operationKey };
    controllerRef.current?.abort('working-media-replaced');
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('saving');
    setMessage('Storing, inspecting, and adopting the Render preview as durable working media.');
    try {
      let response;
      try {
        response = await uploadProjectWorkingMedia({
          projectId,
          file: candidate.validated.file,
          operationKey,
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.project.currentRevisionNumber,
          localEdit: candidate.spec,
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof ProjectApiConflictError) throw error;
        const reconciled = await getProjectWorkingMedia(projectId, controller.signal);
        if (
          reconciled.media.reference.kind !== 'asset' ||
          reconciled.media.reference.assetId !== operationKey ||
          JSON.stringify(reconciled.revision.snapshot.localEdit) !== JSON.stringify(candidate.spec)
        ) {
          throw error;
        }
        response = reconciled;
      }
      controller.signal.throwIfAborted();
      if (!response.isCurrent) {
        throw new ProjectApiConflictError('The Project advanced after this adoption.', {
          kind: 'revision',
          projectId,
          expectedRevisionNumber: response.revision.revisionNumber,
          actualRevisionNumber: response.project.currentRevisionNumber,
        });
      }
      session.acceptCurrent({ project: response.project, revision: response.revision });
      operationRef.current = null;
      setPhase('saved');
      setMessage(
        'Working media ready. No Saved Video or Video Version was created, and the immutable original is unchanged.',
      );
      videoEditor.completeCommit(response.media.assetId);
      videoEditor.close();
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      setPhase(error instanceof ProjectApiConflictError ? 'conflict' : 'error');
      setMessage(safeMessage(error));
      return false;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [phase, projectId, session, setMessage, setPhase, videoEditor]);

  const cancel = useCallback(() => {
    if (phase === 'saving') return;
    setPhase('idle');
    setMessage(null);
    videoEditor.resumeEditing();
  }, [phase, setMessage, setPhase, videoEditor]);

  return {
    phase,
    message,
    busy: phase === 'saving',
    adoptRenderPreview,
    cancel,
  } as const;
};
