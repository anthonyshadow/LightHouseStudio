import type {
  ProjectCurrentResponse,
  ProjectSourceResponse,
  ProjectWorkingMediaResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiClientError, apiErrorMessage } from '../../adapters/api-client/apiClient';
import { projectWorkspacePath } from '../../app/paths';
import {
  getProjectSource,
  getProjectWorkingMedia,
  ProjectApiConflictError,
  reuseProjectWorkingMedia,
  reuseSavedVideoAsProjectSource,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';

const selectedReference = (video: SavedVideoSummary) => ({
  kind: 'saved-video-version' as const,
  savedVideoId: video.id,
  videoVersionId: video.currentVersion.id,
});

const referencesMatch = (
  reference: ProjectCurrentResponse['revision']['snapshot']['presentedMedia'],
  video: SavedVideoSummary,
): boolean =>
  reference?.kind === 'saved-video-version' &&
  reference.savedVideoId === video.id &&
  reference.videoVersionId === video.currentVersion.id;

const sourceMatches = (response: ProjectSourceResponse, video: SavedVideoSummary): boolean =>
  response.source.kind === 'saved-video-version' &&
  response.source.savedVideoId === video.id &&
  response.source.videoVersionId === video.currentVersion.id;

const workingMediaMatches = (
  response: ProjectWorkingMediaResponse,
  video: SavedVideoSummary,
): boolean =>
  response.isCurrent &&
  response.media.reference.kind === 'saved-video-version' &&
  response.media.reference.savedVideoId === video.id &&
  response.media.reference.videoVersionId === video.currentVersion.id;

const authority = (
  response: ProjectSourceResponse | ProjectWorkingMediaResponse,
): ProjectCurrentResponse => ({ project: response.project, revision: response.revision });

export const projectAssetVideoWorkspaceError = (error: unknown): string =>
  apiErrorMessage(error, 'The selected Video could not be opened as editable Project media.');

export const useProjectAssetVideoWorkspaceLauncher = (
  projectId: string,
  archived: boolean,
  session: ProjectSessionPort,
) => {
  const navigate = useNavigate();
  const operationRef = useRef<{ readonly signature: string; readonly key: string } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [busyVideoId, setBusyVideoId] = useState<string | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort('project-video-workspace-launcher-unmounted');
    },
    [],
  );

  const open = useCallback(
    async (video: SavedVideoSummary): Promise<void> => {
      if (archived) {
        throw new ApiClientError(
          'Restore this Project before opening a Video Asset as editable workspace media.',
          409,
          'conflict',
        );
      }
      if (busyVideoId !== null) return;
      setBusyVideoId(video.id);
      if (!(await session.flush())) {
        setBusyVideoId(null);
        throw new ApiClientError(
          'Resolve the preserved Project changes before opening this Video in the workspace.',
          409,
          'conflict',
        );
      }
      const current = session.getCurrent();
      if (current === null) {
        setBusyVideoId(null);
        throw new ApiClientError('The current Project is unavailable.', 409, 'conflict');
      }
      if (referencesMatch(current.revision.snapshot.presentedMedia, video)) {
        setBusyVideoId(null);
        void navigate(projectWorkspacePath(projectId));
        return;
      }

      const mode = current.revision.snapshot.sourceAssetId === null ? 'source' : 'working-media';
      const signature = JSON.stringify({
        mode,
        projectId,
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.project.currentRevisionNumber,
        savedVideoId: video.id,
        videoVersionId: video.currentVersion.id,
      });
      const operationKey =
        operationRef.current?.signature === signature
          ? operationRef.current.key
          : crypto.randomUUID();
      operationRef.current = { signature, key: operationKey };
      const controller = new AbortController();
      controllerRef.current?.abort('project-video-workspace-launch-replaced');
      controllerRef.current = controller;

      try {
        let next: ProjectCurrentResponse;
        if (mode === 'source') {
          try {
            const response = await reuseSavedVideoAsProjectSource({
              projectId,
              operationKey,
              expectedVersion: current.project.version,
              expectedRevisionNumber: current.project.currentRevisionNumber,
              savedVideoId: video.id,
              videoVersionId: video.currentVersion.id,
              signal: controller.signal,
            });
            if (!sourceMatches(response, video)) {
              throw new ApiClientError(
                "The selected Video did not become this Project's current source.",
                409,
                'conflict',
              );
            }
            next = authority(response);
          } catch (error) {
            if (error instanceof ProjectApiConflictError || controller.signal.aborted) throw error;
            const reconciled = await getProjectSource(projectId, controller.signal).catch(
              () => null,
            );
            if (reconciled === null || !sourceMatches(reconciled, video)) throw error;
            next = authority(reconciled);
          }
        } else {
          try {
            const response = await reuseProjectWorkingMedia({
              projectId,
              operationKey,
              expectedVersion: current.project.version,
              expectedRevisionNumber: current.project.currentRevisionNumber,
              media: selectedReference(video),
              localEdit: null,
              signal: controller.signal,
            });
            if (!workingMediaMatches(response, video)) {
              throw new ApiClientError(
                'The selected Video was retained by historical Project work but did not become current workspace media.',
                409,
                'conflict',
              );
            }
            next = authority(response);
          } catch (error) {
            if (error instanceof ProjectApiConflictError || controller.signal.aborted) throw error;
            const reconciled = await getProjectWorkingMedia(projectId, controller.signal).catch(
              () => null,
            );
            if (reconciled === null || !workingMediaMatches(reconciled, video)) throw error;
            next = authority(reconciled);
          }
        }

        controller.signal.throwIfAborted();
        operationRef.current = null;
        session.acceptCurrent(next);
        setBusyVideoId(null);
        void navigate(projectWorkspacePath(projectId));
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setBusyVideoId(null);
      }
    },
    [archived, busyVideoId, navigate, projectId, session],
  );

  return { open, busyVideoId } as const;
};
