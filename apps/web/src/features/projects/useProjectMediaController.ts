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
  projectHoldsSavedVideoVersion,
  removeProjectSourceById,
  type ProjectRevisionExpectation,
} from './projectsApi';
import { projectClipMediaCatalogue, type ProjectClipMedia } from './projectClipMedia';
import { useProjectCurrentCut } from './useProjectCurrentCut';
import type { ProjectSessionPort } from './useProjectSession';
import { projectQueryKeys, reconcileProjectMedia } from './useProjectsController';
import { useStableOperationKey } from './useStableOperationKey';

export type ProjectMediaPhase =
  'idle' | 'adding' | 'removing' | 'added' | 'removed' | 'conflict' | 'error';

/** Which act a terminal phase belongs to, so a failure is described as the thing that failed. */
export type ProjectMediaAct = 'add' | 'remove';

/** What a failure this browser cannot read says, which the act decides rather than each caller. */
const FAILURE_MESSAGE: Record<ProjectMediaAct, string> = {
  add: 'That video could not be added safely.',
  remove: 'That video could not be removed safely.',
};

/**
 * Where one act got to and what to say about it, written as a unit.
 *
 * The three moved together at every transition and only ever made sense together: a phase from one
 * act beside the noun of another is what made a failed removal announce itself as a video that
 * could not be added. Held apart, that pairing was an invariant maintained by hand at six call
 * sites; held together it is the only thing the type can express.
 */
interface ProjectMediaStatus {
  readonly phase: ProjectMediaPhase;
  readonly act: ProjectMediaAct;
  readonly message: string | null;
}

const IDLE_STATUS: ProjectMediaStatus = { phase: 'idle', act: 'add', message: null };

/** The one read of a Project's collection, so every observer of it shares a fetch and a cache. */
const sourcesQueryOptions = (projectId: string) => ({
  queryKey: projectQueryKeys.sources(projectId),
  queryFn: ({ signal }: { readonly signal: AbortSignal }) => listProjectSources(projectId, signal),
});

/**
 * How much media a Project holds, for a surface that needs the count without owning the acts.
 *
 * The one control that has to know — "Remove original video", in the section next door — used to
 * read it out of the Media area's activity report: a count relayed up through a parent's state, so
 * it arrived a render late, travelled mixed into a record about work in flight, and was absent
 * entirely whenever that section was unmounted. Reading the same cache entry costs no second fetch
 * and puts the number where the rule is applied.
 */
export const useProjectHeldSourceCount = (projectId: string, enabled: boolean): number => {
  const query = useQuery({ ...sourcesQueryOptions(projectId), enabled });
  return query.data?.sources.length ?? 0;
};

/**
 * Everything an arrangement's clips may stand over, resolved and keyed.
 *
 * Two reads rather than one, because a Project's media has two homes: the collection it holds, and
 * the cut the current revision presents — which is a render or an adopted result the collection has
 * never held, and which is exactly what the first arrangement is seeded over. Both observe caches
 * that other surfaces already fill, so opening the arrangement usually costs no request at all.
 */
export const useProjectClipMediaCatalogue = (
  current: ProjectCurrentResponse,
  enabled: boolean,
): ReadonlyMap<string, ProjectClipMedia> => {
  const projectId = current.project.id;
  const query = useQuery({ ...sourcesQueryOptions(projectId), enabled });
  const presentedCut = useProjectCurrentCut(current, enabled);
  const sources = query.data?.sources;
  const presentedMedia = current.revision.snapshot.presentedMedia;
  return useMemo(
    () =>
      projectClipMediaCatalogue(sources ?? [], {
        reference: presentedMedia,
        cut: presentedCut,
      }),
    [presentedCut, presentedMedia, sources],
  );
};

/**
 * Everything a Project holds to work from, and the three ways the operator changes it.
 *
 * Deliberately not `useProjectSourceController`: that one owns the *original* — the stage it
 * hydrates, the legacy contract that refuses a second acceptance, and the media the snapshot
 * points at. This owns the collection beside it, which has no stage of its own and whose
 * acceptance the server sizes from what the Project already holds.
 */
export const useProjectMediaController = (projectId: string, session: ProjectSessionPort) => {
  const queryClient = useQueryClient();
  const operation = useStableOperationKey();
  const controllerRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<ProjectMediaStatus>(IDLE_STATUS);
  const sourcesQuery = useMemo(() => sourcesQueryOptions(projectId), [projectId]);
  const query = useQuery(sourcesQuery);
  const sources = query.data?.sources ?? [];
  const busy = status.phase === 'adding' || status.phase === 'removing';

  /**
   * What the collection held before an act started, or `null` when this browser does not know.
   *
   * The distinction is the whole of the reconciliation below. Collapsing "not loaded" into "held
   * nothing" made every failed upload look like it had landed, because any non-empty collection is
   * larger than zero — so a Project that already held three videos would report a fourth as added
   * when the request had stored nothing.
   */
  const heldSourcesBefore = useCallback(
    (): readonly ProjectSourceCollectionItem[] | null =>
      queryClient.getQueryData<ProjectSourceListResponse>(projectQueryKeys.sources(projectId))
        ?.sources ?? null,
    [projectId, queryClient],
  );

  const refetchSources = useCallback(
    (): Promise<ProjectSourceListResponse> => queryClient.fetchQuery(sourcesQuery),
    [queryClient, sourcesQuery],
  );

  /**
   * Runs one change to the collection against the session's freshest authority.
   *
   * `landed` is what makes an unknown acceptance reconcilable rather than repeatable. A request
   * whose answer went missing — a failure without a conflict, or a cancel the operator pressed
   * after the bytes were already sent — may still have been applied, and a second attempt would
   * carry a different compare-and-set, so it would mint a different operation key and store the
   * same video twice. Asking the collection what it holds is the cheaper and truer question, and
   * it is asked as a *difference* against what was held before rather than as a state: "this
   * Version is present" is already true when the operator re-picks one the Project has.
   */
  const run = useCallback(
    async (input: {
      readonly act: ProjectMediaAct;
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
      /** Whether the collection now shows this act as done that did not show it before. */
      readonly landed: (
        held: readonly ProjectSourceCollectionItem[],
        before: readonly ProjectSourceCollectionItem[],
      ) => boolean;
      readonly settledMessage: string;
      readonly onSettled?: (() => void) | undefined;
    }): Promise<boolean> => {
      const controller = new AbortController();
      controllerRef.current?.abort('project-media-replaced');
      controllerRef.current = controller;
      // Every phase reached below belongs to this act, so it is stamped once here rather than
      // remembered by each transition — which is how the two came apart in the first place.
      const report = (phase: ProjectMediaPhase, message: string | null) =>
        setStatus({ phase, act: input.act, message });
      /*
       * Raised before the flush, not after. `flush` is a real checkpoint round trip whenever the
       * session holds a pending proposal, and every control that closes this door reads `busy` —
       * so a second press during that window used to enter here too, abort this one, and have this
       * one's own cleanup report the section idle while the survivor was still in flight.
       */
      report(input.act === 'add' ? 'adding' : 'removing', input.busyMessage);
      const before = heldSourcesBefore();
      try {
        if (!(await session.flush())) {
          report(
            'conflict',
            'Save or discard your pending Project changes before changing its media.',
          );
          return false;
        }
        const current = session.getCurrent();
        if (current === null) {
          report('idle', null);
          return false;
        }
        // The one pair that has to be identical between the key and the request it names.
        const expected: ProjectRevisionExpectation = {
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.project.currentRevisionNumber,
        };
        const settle = (next: ProjectCurrentResponse, sourcesFresh = false) => {
          // `acceptCurrent` publishes the new authority and reconciles the Project lists through
          // the session controller; the collection is its own act, and `sourcesFresh` is the
          // reconcile path saying it has just been read — invalidating there would read it twice.
          session.acceptCurrent(next);
          if (!sourcesFresh) void reconcileProjectMedia(queryClient, projectId);
          if (input.fingerprint) operation.reset();
          report(input.act === 'add' ? 'added' : 'removed', input.settledMessage);
          input.onSettled?.();
        };
        /*
         * Whether the act happened anyway, for an answer this browser never received. Answers
         * `false` rather than guessing when the collection was never loaded, because "held
         * nothing" and "do not know" are different facts and only one of them is a difference.
         */
        const reconcile = async (): Promise<boolean> => {
          if (before === null) return false;
          try {
            const reconciled = await refetchSources();
            if (!input.landed(reconciled.sources, before)) return false;
            settle(reconciled, true);
            return true;
          } catch {
            // The collection could not be re-read either; the caller's failure is the honest one.
            return false;
          }
        };
        try {
          const operationKey = input.fingerprint
            ? operation.keyFor(JSON.stringify({ ...input.fingerprint, ...expected }))
            : '';
          settle(await input.request(expected, operationKey, controller.signal));
          return true;
        } catch (error) {
          /*
           * A conflict is the server's own answer and needs no reconciling. Everything else — a
           * failure, and a cancel alike — is an answer this browser never received: a cancel stops
           * it waiting, it does not reach the server, which may have committed the moment before.
           */
          const conflicted = error instanceof ProjectApiConflictError;
          if (!conflicted && (await reconcile())) return true;
          if (controller.signal.aborted) {
            report('idle', 'That change was cancelled. Nothing in this Project changed.');
            return false;
          }
          report(
            conflicted ? 'conflict' : 'error',
            apiErrorMessage(error, FAILURE_MESSAGE[input.act]),
          );
          return false;
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [heldSourcesBefore, operation, projectId, queryClient, refetchSources, session],
  );

  const addUpload = useCallback(
    (file: File, kind: 'uploaded' | 'recorded', onAdded?: () => void) =>
      run({
        act: 'add',
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
        landed: (held, before) => held.length > before.length,
        settledMessage: `“${file.name}” is now part of this Project.`,
        onSettled: onAdded,
      }),
    [projectId, run],
  );

  const addSavedVideo = useCallback(
    (video: SavedVideoSummary) =>
      run({
        act: 'add',
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
        /*
         * A difference, not a presence. The Project may already hold this exact Version — the
         * server refuses that outright — so asking only "is it here" would report a refusal, or
         * any other failure at a Version already held, as an acceptance.
         */
        landed: (held, before) =>
          projectHoldsSavedVideoVersion(held, video) &&
          !projectHoldsSavedVideoVersion(before, video),
        settledMessage: `“${video.title}” is now part of this Project. That video is not changed.`,
      }),
    [projectId, run],
  );

  const remove = useCallback(
    (source: ProjectSourceCollectionItem) =>
      run({
        act: 'remove',
        busyMessage: 'Removing that video from this Project.',
        request: (expected, _operationKey, signal) =>
          removeProjectSourceById({ projectId, assetId: source.assetId, ...expected, signal }),
        // Removal converges, so its end state is its answer: the Project no longer holds it.
        landed: (held) => !held.some(({ assetId }) => assetId === source.assetId),
        settledMessage: `“${source.filename}” is no longer part of this Project. The video itself is kept.`,
      }),
    [projectId, run],
  );

  /**
   * Stops this browser waiting. Deliberately does not reset the operation key: the request may
   * already have been accepted, and the key is what lets the same attempt replay rather than mint
   * a second one against a version the first attempt moved.
   */
  const cancel = useCallback(() => {
    controllerRef.current?.abort('project-media-cancelled');
    controllerRef.current = null;
  }, []);

  return {
    query,
    sources,
    phase: status.phase,
    act: status.act,
    message: status.message,
    busy,
    /** Whether the collection is known at all; nothing may be added against an unknown one. */
    loaded: query.data !== undefined,
    atLimit: sources.length >= PROJECT_SOURCE_LIMIT,
    addUpload,
    addSavedVideo,
    remove,
    cancel,
  } as const;
};
