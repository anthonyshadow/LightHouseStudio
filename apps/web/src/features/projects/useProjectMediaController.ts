import type {
  ProjectCurrentResponse,
  ProjectSourceCollectionItem,
  ProjectSourceListResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { PROJECT_SOURCE_LIMIT } from '@studio/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { apiErrorMessage } from '../../adapters/api-client/apiClient';
import {
  addProjectSourceUpload,
  addSavedVideoAsProjectSource,
  listProjectSources,
  ProjectApiConflictError,
  removeProjectSourceById,
  type ProjectRevisionExpectation,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { projectQueryKeys } from './useProjectsController';
import { useStableOperationKey } from './useStableOperationKey';

export type ProjectMediaPhase =
  'idle' | 'adding' | 'removing' | 'added' | 'removed' | 'conflict' | 'error';

/**
 * Everything a Project holds to work from, and the four ways the operator changes it.
 *
 * Deliberately not `useProjectSourceController`: that one owns the *original* — the stage it
 * hydrates, the legacy contract that refuses a second acceptance, and the media the snapshot
 * points at. This owns the collection beside it, which has no stage of its own and whose
 * acceptance the server sizes from what the Project already holds.
 */
export const useProjectMediaController = (
  projectId: string,
  session: ProjectSessionPort,
  onBusyChange?: (busy: boolean) => void,
) => {
  const queryClient = useQueryClient();
  const operation = useStableOperationKey();
  const controllerRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<ProjectMediaPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  /*
   * The takes this Project has already taken on, by artifact id.
   *
   * Re-presenting a take returns the recorder's lifecycle to `recorded`, so nothing in the capture
   * graph says "this one has already been added" and the control would keep offering it. Adding it
   * again really would store a second copy: a Project upload's asset id derives from its operation
   * key rather than from the bytes, so the duplicate is a different asset and the held-media check
   * cannot see it.
   */
  const [addedTakes, setAddedTakes] = useState<readonly string[]>([]);
  const sourcesQuery = useMemo(
    () => ({
      queryKey: projectQueryKeys.sources(projectId),
      queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
        listProjectSources(projectId, signal),
    }),
    [projectId],
  );
  const query = useQuery(sourcesQuery);
  const sources = query.data?.sources ?? [];
  const busy = phase === 'adding' || phase === 'removing';

  const reportActivity = useCallback(
    (nextBusy: boolean) => onBusyChange?.(nextBusy),
    [onBusyChange],
  );

  /** What the collection held before an act started, read from the cache rather than a render. */
  const heldSourceCount = useCallback(
    () =>
      queryClient.getQueryData<ProjectSourceListResponse>(projectQueryKeys.sources(projectId))
        ?.sources.length ?? 0,
    [projectId, queryClient],
  );

  const refetchSources = useCallback(
    (): Promise<ProjectSourceListResponse> => queryClient.fetchQuery(sourcesQuery),
    [queryClient, sourcesQuery],
  );

  /**
   * Publishes server authority the acting request produced, so the next compare-and-set is made
   * against the revision this one appended rather than the one it replaced.
   *
   * `acceptCurrent` is the only publication needed: the session controller reconciles the Project
   * lists through it. `sourcesFresh` is the recovery path saying the collection has just been read
   * from the server, so invalidating would fetch the same bytes a second time.
   */
  const publish = useCallback(
    async (current: Parameters<ProjectSessionPort['acceptCurrent']>[0], sourcesFresh: boolean) => {
      session.acceptCurrent(current);
      if (!sourcesFresh) {
        await queryClient.invalidateQueries({ queryKey: projectQueryKeys.sources(projectId) });
      }
    },
    [projectId, queryClient, session],
  );

  /**
   * Runs one change to the collection against the session's freshest authority.
   *
   * `landed` is what makes an unknown acceptance reconcilable rather than repeatable. A request
   * that fails without a conflict may still have been applied — the answer, not the act, is what
   * went missing — and a second attempt would carry a different compare-and-set, so it would mint a
   * different operation key and store the same video twice. Asking the collection what it holds is
   * the cheaper and truer question.
   */
  const run = useCallback(
    async (input: {
      readonly phase: 'adding' | 'removing';
      readonly busyMessage: string;
      /**
       * What this request is, for the idempotency key, merged with the compare-and-set below.
       * Absent where no key is sent: a detachment creates no bytes and converges when the media is
       * already gone, so it has nothing to replay and mints nothing.
       */
      readonly fingerprint?: Record<string, unknown>;
      readonly request: (
        expected: ProjectRevisionExpectation,
        operationKey: string,
        signal: AbortSignal,
      ) => Promise<ProjectCurrentResponse>;
      /**
       * Whether the collection now shows this act as done, for an answer that went missing.
       * `heldBefore` is the count as it stood before the request, because an upload has no
       * identity of its own until the server answers with one.
       */
      readonly landed: (
        held: readonly ProjectSourceCollectionItem[],
        heldBefore: number,
      ) => boolean;
      readonly settledMessage: string;
      readonly onSettled?: () => void;
    }): Promise<boolean> => {
      if (!(await session.flush())) {
        setPhase('conflict');
        setMessage('Save or discard your pending Project changes before changing its media.');
        return false;
      }
      const current = session.getCurrent();
      if (current === null) return false;
      // The one pair that has to be identical between the key and the request it names.
      const expected: ProjectRevisionExpectation = {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.project.currentRevisionNumber,
      };
      const heldBefore = heldSourceCount();
      const controller = new AbortController();
      controllerRef.current?.abort('project-media-replaced');
      controllerRef.current = controller;
      setPhase(input.phase);
      setMessage(input.busyMessage);
      reportActivity(true);
      const settle = async (next: ProjectCurrentResponse, sourcesFresh: boolean) => {
        await publish(next, sourcesFresh);
        if (input.fingerprint) operation.reset();
        setPhase(input.phase === 'adding' ? 'added' : 'removed');
        setMessage(input.settledMessage);
        input.onSettled?.();
      };
      try {
        const operationKey = input.fingerprint
          ? operation.keyFor(JSON.stringify({ ...input.fingerprint, ...expected }))
          : '';
        await settle(await input.request(expected, operationKey, controller.signal), false);
        return true;
      } catch (error) {
        if (controller.signal.aborted) {
          setPhase('idle');
          setMessage('That change was cancelled. Nothing in this Project moved.');
          return false;
        }
        if (!(error instanceof ProjectApiConflictError)) {
          try {
            const reconciled = await refetchSources();
            if (input.landed(reconciled.sources, heldBefore)) {
              await settle(reconciled, true);
              return true;
            }
          } catch {
            // The collection could not be re-read either; the failure below is the honest answer.
          }
        }
        setPhase(error instanceof ProjectApiConflictError ? 'conflict' : 'error');
        setMessage(apiErrorMessage(error, 'That video could not be added safely.'));
        return false;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        reportActivity(false);
      }
    },
    [heldSourceCount, operation, publish, refetchSources, reportActivity, session],
  );

  const addUpload = useCallback(
    (file: File, kind: 'uploaded' | 'recorded', takeArtifactId?: string) =>
      run({
        phase: 'adding',
        busyMessage:
          kind === 'recorded'
            ? 'Adding your recording to this Project.'
            : 'Uploading and checking your video.',
        fingerprint: {
          kind,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
        },
        request: (expected, operationKey, signal) =>
          addProjectSourceUpload({ projectId, file, kind, operationKey, ...expected, signal }),
        // The count is the only fact an upload has before the server names its asset; nothing else
        // in this browser can be adding media while this one holds the busy flag.
        landed: (held, heldBefore) => held.length > heldBefore,
        settledMessage: `“${file.name}” is now part of this Project.`,
        ...(takeArtifactId === undefined
          ? {}
          : { onSettled: () => setAddedTakes((taken) => [...taken, takeArtifactId]) }),
      }),
    [projectId, run],
  );

  const addSavedVideo = useCallback(
    (video: SavedVideoSummary) =>
      run({
        phase: 'adding',
        busyMessage: 'Checking that version and adding it to this Project.',
        fingerprint: {
          kind: 'saved-video-version',
          savedVideoId: video.id,
          videoVersionId: video.currentVersion.id,
        },
        request: (expected, operationKey, signal) =>
          addSavedVideoAsProjectSource({
            projectId,
            operationKey,
            savedVideoId: video.id,
            videoVersionId: video.currentVersion.id,
            ...expected,
            signal,
          }),
        landed: (held) =>
          held.some(
            (source) =>
              source.savedVideoId === video.id && source.videoVersionId === video.currentVersion.id,
          ),
        settledMessage: `“${video.title}” is now part of this Project. That video is not changed.`,
      }),
    [projectId, run],
  );

  const remove = useCallback(
    (source: ProjectSourceCollectionItem) =>
      run({
        phase: 'removing',
        busyMessage: 'Removing that video from this Project.',
        request: (expected, _operationKey, signal) =>
          removeProjectSourceById({ projectId, assetId: source.assetId, ...expected, signal }),
        landed: (held) => !held.some(({ assetId }) => assetId === source.assetId),
        settledMessage: `“${source.filename}” is no longer part of this Project. The video itself is kept.`,
      }),
    [projectId, run],
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort('project-media-cancelled');
    controllerRef.current = null;
    operation.reset();
  }, [operation]);

  /** Whether this finalized take has already been taken on, so it is offered exactly once. */
  const takeAlreadyAdded = useCallback(
    (artifactId: string) => addedTakes.includes(artifactId),
    [addedTakes],
  );

  return {
    query,
    sources,
    phase,
    message,
    busy,
    atLimit: sources.length >= PROJECT_SOURCE_LIMIT,
    addUpload,
    addSavedVideo,
    remove,
    cancel,
    takeAlreadyAdded,
  } as const;
};
