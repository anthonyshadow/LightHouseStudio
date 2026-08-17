import type {
  ProjectCurrentResponse,
  ProjectSourceResponse,
  ProjectWorkingMediaResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, apiFetch } from '../../adapters/api-client/apiClient';
import { readBoundedBlob } from '../../adapters/api-client/readBoundedBlob';
import type { RestorePersistedOriginalInput } from '../recording/types';
import { projectQueryKeys } from './useProjectsController';
import { useStableOperationKey } from './useStableOperationKey';
import {
  getProjectSource,
  getProjectWorkingMedia,
  ProjectApiConflictError,
  reuseSavedVideoAsProjectSource,
  uploadProjectSource,
} from './projectsApi';

const MAXIMUM_SOURCE_BYTES = 300_000_000;

export type ProjectSourcePhase =
  'idle' | 'hydrating' | 'preparing' | 'saving' | 'saved' | 'conflict' | 'error';

export interface ProjectSourceActivity {
  readonly projectId: string;
  readonly accepted: boolean;
  readonly phase: ProjectSourcePhase;
  readonly busy: boolean;
  readonly abort: (() => void) | null;
}

export interface ProjectSourceRuntime {
  readonly present: (projectId: string, input: RestorePersistedOriginalInput) => void;
  readonly clear: (projectId: string) => void;
}

interface SourceAcceptanceOperation {
  readonly signature: string;
  readonly presentationFile?: File | undefined;
  readonly previewBeforeAcceptance?: boolean | undefined;
  readonly request: (operationKey: string, signal: AbortSignal) => Promise<ProjectSourceResponse>;
}

const safeMessage = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.message
    : error instanceof DOMException && error.name === 'AbortError'
      ? 'Source preparation was cancelled.'
      : 'The Project source could not be prepared safely.';

const artifactInput = (
  file: File,
  source?: ProjectSourceResponse['source'] | ProjectWorkingMediaResponse['media'],
): RestorePersistedOriginalInput => {
  const createdAt =
    source === undefined
      ? new Date().toISOString()
      : 'acceptedAt' in source
        ? source.acceptedAt
        : source.adoptedAt;
  const id = `project-media-${crypto.randomUUID()}`;
  return {
    blob: file,
    artifactMetadata: {
      id,
      name: `Project media · ${createdAt} · ${id.slice(-8)}`,
      createdAt,
      kind:
        source !== undefined && 'acceptedAt' in source && source.kind === 'recorded'
          ? 'recorded'
          : 'uploaded',
      parentArtifactId: null,
      mimeType: source?.mimeType ?? file.type,
      filename: source?.filename ?? file.name,
      sourceModeId: 'local',
      startedAt: createdAt,
      durationMs: source?.durationMs ?? 0,
    },
    ...(source
      ? {
          takeMetadata: {
            kind: 'uploaded' as const,
            mode: 'local' as const,
            selectedAt: createdAt,
            displayName: source.filename,
            container: source.container,
            videoCodec: source.videoCodec,
            audioCodec: source.audioCodec,
            durationMs: source.durationMs,
            width: source.width,
            height: source.height,
            sizeBytes: source.sizeBytes,
            hasAudio: source.hasAudio,
          },
        }
      : {}),
  };
};

const mediaBlob = async (
  source: ProjectSourceResponse['source'] | ProjectWorkingMediaResponse['media'],
  signal: AbortSignal,
) => {
  const response = await apiFetch(source.contentUrl, {
    cache: 'no-store',
    headers: { Accept: source.mimeType },
    signal,
  });
  return readBoundedBlob(response, {
    maximumBytes: MAXIMUM_SOURCE_BYTES,
    signal,
    acceptsContentType: (contentType) => contentType === source.mimeType,
    createError: (failure) =>
      new ApiClientError(
        failure === 'too-large'
          ? 'The Project source exceeded the app-owned 300 MB safety limit.'
          : 'The Project source response was empty or invalid.',
        502,
        failure === 'too-large' ? 'result_too_large' : 'result_invalid',
      ),
    abortMessage: 'Project source loading was cancelled.',
  });
};

export const useProjectSourceController = (
  projectId: string,
  current: ProjectCurrentResponse,
  runtime: ProjectSourceRuntime,
  onActivityChange?: (activity: ProjectSourceActivity) => void,
  onCurrentChange?: (current: ProjectCurrentResponse) => void,
) => {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<ProjectSourcePhase>(
    current.revision.snapshot.sourceAssetId === null ? 'idle' : 'hydrating',
  );
  const [source, setSource] = useState<ProjectSourceResponse['source'] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const operation = useStableOperationKey();
  const generationRef = useRef(0);
  const hydratedMediaRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const busy = phase === 'preparing' || phase === 'saving';
  const accepted = source !== null || current.revision.snapshot.sourceAssetId !== null;
  const effectivePhase =
    phase === 'idle' && current.revision.snapshot.sourceAssetId !== null ? 'hydrating' : phase;

  const abort = useCallback(() => {
    generationRef.current += 1;
    controllerRef.current?.abort('project-source-aborted');
    controllerRef.current = null;
    operation.reset();
    if (current.revision.snapshot.sourceAssetId === null) runtime.clear(projectId);
    setPhase(current.revision.snapshot.sourceAssetId === null ? 'idle' : 'saved');
    setMessage('Source preparation was cancelled safely.');
  }, [current.revision.snapshot.sourceAssetId, operation, projectId, runtime]);

  useEffect(() => {
    onActivityChange?.({
      projectId,
      accepted,
      phase: effectivePhase,
      busy,
      abort: busy ? abort : null,
    });
  }, [abort, accepted, busy, effectivePhase, onActivityChange, projectId]);

  const presentAccepted = useCallback(
    async (response: ProjectSourceResponse, signal: AbortSignal) => {
      const blob = await mediaBlob(response.source, signal);
      signal.throwIfAborted();
      const file = new File([blob], response.source.filename, {
        type: response.source.mimeType,
        lastModified: new Date(response.source.acceptedAt).valueOf(),
      });
      runtime.present(projectId, artifactInput(file, response.source));
    },
    [projectId, runtime],
  );

  const presentCurrent = useCallback(
    async (sourceResponse: ProjectSourceResponse, signal: AbortSignal) => {
      const sourceReference =
        sourceResponse.source.kind === 'saved-video-version'
          ? {
              kind: 'saved-video-version' as const,
              savedVideoId: sourceResponse.source.savedVideoId!,
              videoVersionId: sourceResponse.source.videoVersionId!,
            }
          : {
              kind: 'asset' as const,
              assetId: sourceResponse.revision.snapshot.sourceAssetId!,
            };
      const presented = current.revision.snapshot.presentedMedia;
      if (JSON.stringify(presented) === JSON.stringify(sourceReference)) {
        await presentAccepted(sourceResponse, signal);
        return;
      }
      const working = await getProjectWorkingMedia(projectId, signal);
      if (
        !working.isCurrent ||
        JSON.stringify(working.media.reference) !== JSON.stringify(presented)
      ) {
        throw new ApiClientError(
          'The current Project working-media reference is unavailable.',
          409,
          'conflict',
        );
      }
      const blob = await mediaBlob(working.media, signal);
      signal.throwIfAborted();
      const file = new File([blob], working.media.filename, {
        type: working.media.mimeType,
        lastModified: new Date(working.media.adoptedAt).valueOf(),
      });
      runtime.present(projectId, artifactInput(file, working.media));
    },
    [current.revision.snapshot.presentedMedia, presentAccepted, projectId, runtime],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runtime.clear(projectId);
    };
  }, [projectId, runtime]);

  useEffect(() => {
    if (current.revision.snapshot.sourceAssetId === null) {
      hydratedMediaRef.current = null;
      runtime.clear(projectId);
      return;
    }
    const mediaIdentity = JSON.stringify(current.revision.snapshot.presentedMedia);
    if (hydratedMediaRef.current === mediaIdentity) return;
    const generation = ++generationRef.current;
    const controller = new AbortController();
    controllerRef.current?.abort('project-source-replaced');
    controllerRef.current = controller;
    runtime.clear(projectId);
    void getProjectSource(projectId, controller.signal)
      .then(async (response) => {
        await presentCurrent(response, controller.signal);
        if (generation !== generationRef.current || !mountedRef.current) return;
        hydratedMediaRef.current = mediaIdentity;
        onCurrentChange?.({ project: response.project, revision: response.revision });
        setSource(response.source);
        setPhase('saved');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        setPhase('error');
        setMessage(safeMessage(error));
      })
      .finally(() => {
        if (controllerRef.current === controller) controllerRef.current = null;
      });
    return () => {
      controller.abort('project-route-unmounted');
    };
  }, [
    current.revision.id,
    current.revision.snapshot.presentedMedia,
    current.revision.snapshot.sourceAssetId,
    presentCurrent,
    projectId,
    runtime,
    onCurrentChange,
  ]);

  const finishAcceptance = useCallback(
    async (
      response: ProjectSourceResponse,
      controller: AbortController,
      generation: number,
      previewFile?: File,
    ) => {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setPhase('saving');
      hydratedMediaRef.current = JSON.stringify(response.revision.snapshot.presentedMedia);
      queryClient.setQueryData(projectQueryKeys.detail(projectId), {
        project: response.project,
        revision: response.revision,
      });
      onCurrentChange?.({ project: response.project, revision: response.revision });
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
      if (previewFile === undefined) await presentAccepted(response, controller.signal);
      else runtime.present(projectId, artifactInput(previewFile, response.source));
      if (controller.signal.aborted || generation !== generationRef.current || !mountedRef.current)
        return;
      operation.reset();
      setSource(response.source);
      setMessage(null);
      setPhase('saved');
    },
    [onCurrentChange, operation, presentAccepted, projectId, queryClient, runtime],
  );

  const runAcceptance = useCallback(
    async ({
      signature,
      presentationFile,
      previewBeforeAcceptance,
      request,
    }: SourceAcceptanceOperation) => {
      const operationKey = operation.keyFor(signature);
      const generation = ++generationRef.current;
      const controller = new AbortController();
      controllerRef.current?.abort('project-source-replaced');
      controllerRef.current = controller;
      setPhase('preparing');
      setMessage(null);
      if (previewBeforeAcceptance && presentationFile !== undefined) {
        runtime.present(projectId, artifactInput(presentationFile));
      }
      try {
        const response = await request(operationKey, controller.signal);
        await finishAcceptance(response, controller, generation, presentationFile);
      } catch (error) {
        if (controller.signal.aborted || generation !== generationRef.current) return;
        if (!(error instanceof ProjectApiConflictError)) {
          try {
            const reconciled = await getProjectSource(projectId, controller.signal);
            await finishAcceptance(reconciled, controller, generation);
            return;
          } catch {
            if (controller.signal.aborted || generation !== generationRef.current) return;
          }
        }
        setPhase(error instanceof ProjectApiConflictError ? 'conflict' : 'error');
        setMessage(safeMessage(error));
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [finishAcceptance, operation, projectId, runtime],
  );

  const runUpload = useCallback(
    (file: File, kind: 'uploaded' | 'recorded', preview: boolean) =>
      runAcceptance({
        signature: JSON.stringify({
          kind,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.project.currentRevisionNumber,
        }),
        presentationFile: file,
        previewBeforeAcceptance: preview,
        request: (operationKey, signal) =>
          uploadProjectSource({
            projectId,
            file,
            operationKey,
            expectedVersion: current.project.version,
            expectedRevisionNumber: current.project.currentRevisionNumber,
            kind,
            signal,
          }),
      }),
    [current.project.currentRevisionNumber, current.project.version, projectId, runAcceptance],
  );

  const upload = useCallback((file: File) => runUpload(file, 'uploaded', true), [runUpload]);

  const acceptRecording = useCallback(
    (file: File) => runUpload(file, 'recorded', false),
    [runUpload],
  );

  const reuseSavedVideo = useCallback(
    (video: SavedVideoSummary) =>
      runAcceptance({
        signature: JSON.stringify({
          kind: 'saved-video-version',
          savedVideoId: video.id,
          videoVersionId: video.currentVersion.id,
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.project.currentRevisionNumber,
        }),
        request: (operationKey, signal) =>
          reuseSavedVideoAsProjectSource({
            projectId,
            operationKey,
            expectedVersion: current.project.version,
            expectedRevisionNumber: current.project.currentRevisionNumber,
            savedVideoId: video.id,
            videoVersionId: video.currentVersion.id,
            signal,
          }),
      }),
    [current.project.currentRevisionNumber, current.project.version, projectId, runAcceptance],
  );

  return {
    phase: effectivePhase,
    source,
    message,
    busy,
    accepted,
    upload,
    acceptRecording,
    reuseSavedVideo,
    abort,
  } as const;
};
