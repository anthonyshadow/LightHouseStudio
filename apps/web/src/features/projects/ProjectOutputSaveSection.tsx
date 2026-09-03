import { useTheme } from '@emotion/react';
import {
  SAVED_VIDEO_TITLE_MAX_LENGTH,
  type ProjectCurrentResponse,
  type SavedVideoDetail,
  type SavedVideoSummary,
  type SaveProjectOutputRequest,
} from '@studio/contracts';
import {
  defaultProjectOutputTitle,
  isProjectExportPlacementAspect,
  projectExportFilename,
  projectMediaReferencesEqual,
  subtitlePlacementsUsed,
  type ProjectExportSpecification,
} from '@studio/domain';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { savedVideoLibraryPath } from '../../app/paths';
import { AppIcon, Button, OverlayPanel, StatusNotice, TextField } from '../../ui';
import {
  ExportPlacementChooser,
  ExportPlacementProgress,
  exportPlacementLabel,
  exportPlacementShortLabel,
  useExportPlacementRender,
  type ExportPlacementRenderResult,
} from '../export-placements';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { SavedVideoSuccessActions } from '../saved-videos/SavedVideoSuccessActions';
import {
  currentCutSummaryStyles,
  destinationActionsStyles,
  destinationChoiceStyles,
  destinationDetailStyles,
  destinationOptionStyles,
  outputSaveContentStyles,
  outputSaveNoteStyles,
  outputSaveSurfaceStyles,
  placementSectionStyles,
  saveActionBarStyles,
  titleFieldStyles,
} from './ProjectOutputSaveSection.styles';
import { ProjectSavedVideoList } from './ProjectSavedVideoPicker';
import {
  clearPendingProjectOutput,
  loadPendingProjectOutput,
  storePendingProjectOutput,
  type PendingProjectOutputOperation,
} from './projectOutputOperationStorage';
import {
  getProject,
  ProjectApiConflictError,
  readProjectWorkingMediaContent,
  saveProjectOutput,
  uploadProjectRendition,
} from './projectsApi';
import { ensureCurrentCut, useProjectCurrentCut, type CurrentCut } from './useProjectCurrentCut';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';
import { projectQueryKeys } from './useProjectsController';
import { generateSavedVideoPreview } from '../saved-videos/useGenerateSavedVideoPreview';
import { DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE } from '../saved-videos/thumbnailSource';

type OutputPhase = 'idle' | 'saving' | 'reconciling' | 'saved' | 'conflict' | 'error';

const outputPhaseNotice = {
  idle: { role: 'status', tone: 'neutral', title: 'Save needs attention' },
  saving: { role: 'status', tone: 'neutral', title: 'Saving video' },
  reconciling: { role: 'status', tone: 'neutral', title: 'Checking your save' },
  saved: { role: 'status', tone: 'success', title: 'Video saved' },
  conflict: { role: 'alert', tone: 'warning', title: 'Save conflict' },
  error: { role: 'alert', tone: 'danger', title: 'Save needs attention' },
} as const satisfies Record<
  OutputPhase,
  {
    readonly role: 'alert' | 'status';
    readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
    readonly title: string;
  }
>;

const MOBILE_DESTINATION_QUERY = '(max-width: 39.99rem)';

const useMobileDestinationSheet = (): boolean => {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_DESTINATION_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return mobile;
};

/** The placement a save has to produce bytes for; `source` and an unset placement produce none. */
const renditionPlacement = (
  specification: ProjectExportSpecification | null,
): ProjectExportSpecification | null =>
  specification !== null && isProjectExportPlacementAspect(specification.aspect)
    ? specification
    : null;

const readyMediaFor = (
  current: ProjectCurrentResponse,
): NonNullable<ProjectCurrentResponse['revision']['snapshot']['workingMedia']> | null => {
  const snapshot = current.revision.snapshot;
  return snapshot.sourceAssetId !== null &&
    snapshot.workingMedia !== null &&
    projectMediaReferencesEqual(snapshot.workingMedia, snapshot.presentedMedia)
    ? snapshot.workingMedia
    : null;
};

export const ProjectOutputSaveSection = ({
  current,
  session,
  archived,
  ownerUserId,
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly ownerUserId?: string | undefined;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saveTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const destinationHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef(false);
  const inFlightRef = useRef<string | null>(null);
  const recoveredRef = useRef<string | null>(null);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [targetMode, setTargetMode] = useState<'new' | 'version'>('new');
  const [appendTarget, setAppendTarget] = useState<SavedVideoSummary | null>(null);
  const [title, setTitle] = useState(() => defaultProjectOutputTitle(current.project));
  const [phase, setPhase] = useState<OutputPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [savedVideo, setSavedVideo] = useState<SavedVideoDetail | null>(null);
  const [pendingAvailable, setPendingAvailable] = useState(false);
  const placementRender = useExportPlacementRender();
  const renditionOperation = useStableOperationKey();
  const renditionFetchRef = useRef<AbortController | null>(null);
  const readyMedia = readyMediaFor(current);
  // The cut's frame, so the chooser can draw the crop and say what it does to burned-in subtitles
  // rather than describe them; one small read per revision, reused by the save itself.
  const currentCut = useProjectCurrentCut(current, readyMedia !== null);
  // The cut's subtitles are pixels by now; the chooser says whether a shape keeps them, from the
  // edit that produced this cut.
  const subtitles = current.revision.snapshot.localEdit?.subtitles;
  const subtitlePlacements = useMemo(() => subtitlePlacementsUsed(subtitles ?? []), [subtitles]);
  // The chosen placement lives on the revision, so the snapshot is the value the control shows.
  const placement = current.revision.snapshot.exportSpecification;
  // A browser capability, measured once per mount rather than on every keystroke.
  // The render hook already measured this; probing again would cost a second WebGL context.
  const placementSupported = placementRender.supported;
  const busy = phase === 'saving' || phase === 'reconciling';
  const processing = current.project.status === 'processing';
  const notice = outputPhaseNotice[phase];
  const mobileDestinationSheet = useMobileDestinationSheet();

  const runOperation = useCallback(
    async (pending: PendingProjectOutputOperation, recovered: boolean) => {
      if (inFlightRef.current !== null) return;
      inFlightRef.current = pending.operationId;
      setSavedVideo(null);
      setPhase(recovered ? 'reconciling' : 'saving');
      setMessage(
        recovered
          ? 'Checking the save that was already started. No second save will be created.'
          : 'Saving one new version of this video.',
      );
      try {
        const response = await saveProjectOutput({
          projectId: pending.projectId,
          operationId: pending.operationId,
          request: pending.request,
        });
        clearPendingProjectOutput(pending.ownerUserId, pending.projectId);
        setPendingAvailable(false);
        session.acceptCurrent({ project: response.project, revision: response.revision });
        queryClient.setQueryData(projectQueryKeys.detail(pending.projectId), {
          project: response.project,
          revision: response.revision,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists }),
          queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.lists }),
          // A save to a new Video changed the Videos tab count too.
          queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.total }),
          // The overview reads the newest saved output, and this save just became it.
          queryClient.invalidateQueries({
            queryKey: projectQueryKeys.latestOutput(pending.projectId),
          }),
        ]);
        setSavedVideo(response.savedVideo);
        setPhase('saved');
        // Named only when one was actually applied: a video stored in the shape it already had has
        // no placement to report, and saying "Keep as it is" would be noise rather than news.
        const applied = response.savedVideo.currentVersion.exportSpecification;
        const shape =
          applied === null ? '' : ` Re-framed for ${exportPlacementLabel(applied.aspect)}.`;
        setMessage(
          pending.request.target.kind === 'new'
            ? `Saved “${response.savedVideo.title}” as Version ${response.savedVideo.currentVersion.ordinal}.${shape}`
            : `Added Version ${response.savedVideo.currentVersion.ordinal} to “${response.savedVideo.title}”.${shape}`,
        );
        /*
         * Give the new Version a poster, the way a Studio save already does. Without this a
         * Project's own deliverable was the one kind of saved video that never had one: the
         * overview and the library both fell back to a placeholder, and the only repair was
         * pressing Generate preview on every Video a Project had ever produced. Every save mints
         * a Version, and a new Version never has a poster, so this always has work to do.
         *
         * The signal is deliberately one nothing aborts. Started after the save is reported, the
         * generation outlives this surface on purpose: the button beside the success notice opens
         * the Videos library — the very screen the poster is for — and tying the work to the
         * component would let that click cancel it. A failure leaves exactly the state that
         * existed before, with the same repair still available.
         */
        void generateSavedVideoPreview(
          { video: response.savedVideo, choice: DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE },
          new AbortController().signal,
        ).catch(() => undefined);
      } catch (error) {
        const finalClientFailure =
          error instanceof ProjectApiConflictError ||
          (error instanceof ApiClientError && error.status >= 400 && error.status < 500);
        if (finalClientFailure) {
          clearPendingProjectOutput(pending.ownerUserId, pending.projectId);
          setPendingAvailable(false);
          if (error instanceof ProjectApiConflictError) {
            let refreshed = false;
            try {
              const authoritative = await getProject(pending.projectId);
              session.acceptCurrent(authoritative);
              queryClient.setQueryData(projectQueryKeys.detail(pending.projectId), authoritative);
              refreshed = true;
            } catch {
              // The conflict is still final for this operation; a later user action can reload.
            }
            setPhase('conflict');
            setMessage(
              refreshed
                ? `${error.message} The latest Project state is loaded; review it and save again.`
                : `${error.message} Reload the Project before saving again.`,
            );
          } else {
            setPhase('error');
            setMessage(
              'This could not be saved. Check what you’re viewing and the video you chose.',
            );
          }
        } else {
          setPendingAvailable(true);
          setPhase('error');
          setMessage(
            'The save reply never arrived. This save is remembered — retry or reload, and Lightframe settles the one possible result.',
          );
        }
      } finally {
        inFlightRef.current = null;
      }
    },
    [queryClient, session],
  );

  // A read started for a placement must not outlive the surface that started it.
  useEffect(() => () => renditionFetchRef.current?.abort('unmount'), []);

  useEffect(() => {
    if (ownerUserId === undefined || archived) return;
    const pending = loadPendingProjectOutput(ownerUserId, current.project.id);
    if (pending === null || recoveredRef.current === pending.operationId) return;
    recoveredRef.current = pending.operationId;
    void runOperation(pending, true);
  }, [archived, current.project.id, ownerUserId, runOperation]);

  useEffect(() => {
    if (!destinationOpen || mobileDestinationSheet) return;
    const frame = window.requestAnimationFrame(() => destinationHeadingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [destinationOpen, mobileDestinationSheet]);

  useLayoutEffect(() => {
    if (!destinationOpen || !mobileDestinationSheet) return;
    const workspace = document.getElementById('studio-main');
    if (!workspace) return;
    workspace.scrollTop = 0;
    const frame = window.requestAnimationFrame(() => {
      workspace.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [destinationOpen, mobileDestinationSheet]);

  useEffect(() => {
    if (destinationOpen || busy || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    saveTriggerRef.current?.focus();
  }, [busy, destinationOpen]);

  const closeDestination = () => {
    if (busy) return;
    restoreFocusRef.current = true;
    setDestinationOpen(false);
  };

  const openDestination = () => {
    setTitle(defaultProjectOutputTitle(current.project));
    setTargetMode('new');
    setAppendTarget(null);
    setDestinationOpen(true);
  };

  /**
   * Produces the chosen placement and stores its bytes, returning the reference a save can carry.
   *
   * This runs before the save receipt is written, and that ordering is the whole idempotency
   * argument: nothing durable exists until the bytes do, so a save recovered after a reload
   * replays a request that already names them and never renders again. `null` means the cut is
   * stored in the shape it already has; `'stopped'` means the operator cancelled or it failed, and
   * the message they need is already on screen.
   */
  const produceRendition = async (
    latest: ProjectCurrentResponse,
    specification: ProjectExportSpecification,
  ): Promise<SaveProjectOutputRequest['renditions'] | 'stopped'> => {
    const controller = new AbortController();
    renditionFetchRef.current = controller;
    const fail = (fallback: string, error: unknown) => {
      setPhase('error');
      setMessage(error instanceof ApiClientError ? error.message : fallback);
      return 'stopped' as const;
    };
    setPhase('saving');
    setMessage('Reading this cut to re-frame it for the placement.');

    let cut: CurrentCut;
    let rendered: ExportPlacementRenderResult | null;
    try {
      // Usually a cache hit — the stage's hydration or the chooser asked already. A miss is two
      // metadata reads the query owns outright; cancelling them is not worth a second path.
      cut = await ensureCurrentCut(queryClient, latest);
      /*
       * Scoped to this block deliberately. The render consumes the source and the block ends, so
       * the only large Blob still reachable while the result uploads is the result — holding both
       * across a network-bound minute is the difference between one and two.
       */
      const media = await readProjectWorkingMediaContent({
        contentUrl: cut.contentUrl,
        mimeType: cut.mimeType,
        signal: controller.signal,
      });
      setMessage(null);
      rendered = await placementRender.render({
        media,
        specification,
        source: { width: cut.width, height: cut.height, durationMs: cut.durationMs },
        hasAudio: cut.hasAudio,
        filename: cut.filename,
      });
    } catch (error) {
      // `render` reports its own failures by returning null; only the reads throw.
      if (controller.signal.aborted) return 'stopped';
      return fail('This cut could not be read to re-frame it. Nothing was saved.', error);
    }
    if (rendered === null) {
      // The render hook owns the reason, and `ExportPlacementProgress` is already showing it —
      // including the size ceiling, which `VideoEditChunkAccumulator` refuses at the 300 MB it
      // names, before there is a blob to upload at all. Nothing to re-check here.
      setPhase('idle');
      setMessage(null);
      return 'stopped';
    }

    setMessage('Storing the re-framed video before saving it.');
    try {
      const uploaded = await uploadProjectRendition({
        projectId: latest.project.id,
        file: new File([rendered.blob], projectExportFilename(cut.filename, specification), {
          type: rendered.blob.type,
        }),
        /*
         * Stable across retries of the same attempt: the asset id *is* this key on the server, so
         * pressing Save again after a failure re-uses the bytes already stored instead of leaving
         * another copy behind. It rotates when the cut, the placement or the Project moves on.
         */
        operationKey: renditionOperation.keyFor(
          JSON.stringify({
            projectId: latest.project.id,
            expectedVersion: latest.project.version,
            expectedRevisionNumber: latest.project.currentRevisionNumber,
            media: latest.revision.snapshot.workingMedia,
            specification,
          }),
        ),
        specification,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return 'stopped';
      // Durably stored, so the next attempt is a new operation even at an identical signature.
      renditionOperation.reset();
      return [{ media: uploaded.media, specification }];
    } catch (error) {
      if (controller.signal.aborted) return 'stopped';
      return fail('The re-framed video could not be stored. Nothing was saved.', error);
    } finally {
      if (renditionFetchRef.current === controller) renditionFetchRef.current = null;
    }
  };

  const cancelPreparation = () => {
    renditionFetchRef.current?.abort('cancelled');
    renditionFetchRef.current = null;
    placementRender.cancel();
    setPhase('idle');
    setMessage(null);
  };

  const begin = async (target: SaveProjectOutputRequest['target']) => {
    restoreFocusRef.current = true;
    setDestinationOpen(false);
    if (ownerUserId === undefined) {
      setPhase('error');
      setMessage('Your account could not be confirmed for this save.');
      return;
    }
    // A save whose reply never arrived is still out there, and this browser holds its only
    // receipt. Settling that one is what the operator is asking for by pressing Save again —
    // minting a second operation would overwrite the receipt and create a duplicate Version.
    const unresolved = loadPendingProjectOutput(ownerUserId, current.project.id);
    if (unresolved !== null) {
      recoveredRef.current = unresolved.operationId;
      await runOperation(unresolved, true);
      return;
    }
    if (!(await session.flush())) {
      setPhase('conflict');
      setMessage('Save or discard your pending Project changes before saving.');
      return;
    }
    let latest: ProjectCurrentResponse;
    try {
      latest = await getProject(current.project.id);
      session.acceptCurrent(latest);
      queryClient.setQueryData(projectQueryKeys.detail(latest.project.id), latest);
    } catch {
      setPhase('error');
      setMessage('The Project’s latest state could not be checked. Nothing was saved.');
      return;
    }
    const media = readyMediaFor(latest);
    if (media === null || latest.project.status === 'processing') {
      setPhase('conflict');
      setMessage('The Project no longer has the media this save was for.');
      return;
    }
    // Produced before the receipt exists, so a recovered save replays bytes rather than making
    // them. Where the browser cannot render, the cut is stored in its own shape and the Version
    // records that no placement was applied — the notice above the control said so beforehand.
    const specification = renditionPlacement(latest.revision.snapshot.exportSpecification);
    let renditions: SaveProjectOutputRequest['renditions'] = [];
    if (specification !== null && placementSupported) {
      const produced = await produceRendition(latest, specification);
      if (produced === 'stopped') return;
      renditions = produced;
    }
    const pending: PendingProjectOutputOperation = {
      schemaVersion: 1,
      ownerUserId,
      projectId: latest.project.id,
      operationId: crypto.randomUUID(),
      request: {
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.project.currentRevisionNumber,
        media,
        target,
        renditions,
      },
      createdAt: new Date().toISOString(),
    };
    if (!storePendingProjectOutput(pending)) {
      setPhase('error');
      setMessage(
        'This browser cannot store the save record, so nothing was saved. Reload-safe saving needs it.',
      );
      return;
    }
    setPendingAvailable(true);
    recoveredRef.current = pending.operationId;
    await runOperation(pending, false);
  };

  const submitDestination = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (targetMode === 'new') {
      const nextTitle = title.trim();
      if (nextTitle.length === 0 || nextTitle.length > SAVED_VIDEO_TITLE_MAX_LENGTH) return;
      void begin({ kind: 'new', title: nextTitle });
      return;
    }
    if (appendTarget === null) return;
    void begin({
      kind: 'version',
      savedVideoId: appendTarget.id,
      expectedVersionId: appendTarget.currentVersion.id,
    });
  };

  const retryPending = () => {
    if (ownerUserId === undefined) return;
    const pending = loadPendingProjectOutput(ownerUserId, current.project.id);
    if (pending !== null) void runOperation(pending, true);
  };

  if (current.revision.snapshot.sourceAssetId === null) return null;
  const currentDescription =
    readyMedia?.kind === 'saved-video-version'
      ? 'The exact saved Version shown on the stage.'
      : readyMedia?.assetId === current.revision.snapshot.sourceAssetId
        ? 'The original video shown on the stage, with no later cut applied.'
        : 'The current cut shown on the stage.';
  const placementAspect = placement?.aspect ?? 'source';
  const placementLabel = exportPlacementLabel(placementAspect);
  const placementShortLabel = exportPlacementShortLabel(placementAspect);
  const newTitleValid =
    title.trim().length > 0 && title.trim().length <= SAVED_VIDEO_TITLE_MAX_LENGTH;
  const destinationReady = targetMode === 'new' ? newTitleValid : appendTarget !== null;
  const inlineDestinationOpen = destinationOpen && !mobileDestinationSheet;
  const destinationActionLabel =
    targetMode === 'new'
      ? 'Save video · New video'
      : appendTarget
        ? `Save video · ${appendTarget.title}`
        : 'Choose a video to continue';

  const renderDestinationForm = (showHeading: boolean, showPrimaryAction: boolean) => (
    <form
      id="project-save-destination-choice"
      aria-label="Save destination"
      css={destinationChoiceStyles(theme)}
      onSubmit={submitDestination}
    >
      {showHeading ? (
        <header>
          <h4 ref={destinationHeadingRef} tabIndex={-1}>
            Choose where to save
          </h4>
          <p>Make this a new library video, or add one exact Version to a video you own.</p>
        </header>
      ) : null}
      <fieldset
        disabled={busy}
        css={{
          minWidth: 0,
          display: 'grid',
          gap: theme.space.sm,
          margin: 0,
          padding: 0,
          border: 0,
          '& > legend': {
            marginBlockEnd: theme.space.sm,
            padding: 0,
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes.metadata,
            fontWeight: 700,
          },
        }}
      >
        <legend>Save as</legend>
        <div css={{ minWidth: 0, display: 'grid', gap: theme.space.sm }}>
          <label css={destinationOptionStyles(theme, targetMode === 'new')}>
            <input
              type="radio"
              name="project-save-target"
              value="new"
              aria-label="New video"
              checked={targetMode === 'new'}
              onChange={() => setTargetMode('new')}
            />
            <span data-destination-copy>
              <strong>New video</strong>
              <small>Creates Version 1 in your Videos library.</small>
            </span>
          </label>
          {targetMode === 'new' ? (
            <div css={destinationDetailStyles(theme)}>
              <div css={titleFieldStyles(theme)}>
                <TextField
                  ref={titleInputRef}
                  label="Video title"
                  required
                  maxLength={SAVED_VIDEO_TITLE_MAX_LENGTH}
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  hint="This is the name you’ll see in your Videos library."
                />
              </div>
            </div>
          ) : null}
        </div>

        <div css={{ minWidth: 0, display: 'grid', gap: theme.space.sm }}>
          <label css={destinationOptionStyles(theme, targetMode === 'version')}>
            <input
              type="radio"
              name="project-save-target"
              value="version"
              aria-label={
                appendTarget
                  ? `New version of ${appendTarget.title}`
                  : 'New version of an existing video'
              }
              checked={targetMode === 'version'}
              onChange={() => setTargetMode('version')}
            />
            <span data-destination-copy>
              <strong>
                {appendTarget
                  ? `New version of “${appendTarget.title}”`
                  : 'New version of an existing video'}
              </strong>
              <small>Keeps every earlier Version and adds this one next.</small>
            </span>
          </label>
          {targetMode === 'version' ? (
            <div css={destinationDetailStyles(theme)}>
              {appendTarget ? (
                <p role="status" css={{ margin: 0, color: theme.colors.textMuted }}>
                  Target: <strong css={{ color: theme.colors.text }}>{appendTarget.title}</strong> ·
                  Current Version {appendTarget.currentVersion.ordinal}
                </p>
              ) : (
                <p css={{ margin: 0, color: theme.colors.textMuted }}>
                  Choose the video that should receive this Version.
                </p>
              )}
              <ProjectSavedVideoList
                active={destinationOpen && targetMode === 'version'}
                busy={busy}
                selectedVideoId={appendTarget?.id}
                onSelect={setAppendTarget}
                emptyTitle="No version targets yet"
                emptyBody="Choose New video above to create your first library video."
                listLabel="Videos available as a new Version target"
              />
            </div>
          ) : null}
        </div>
      </fieldset>

      <p css={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata }}>
        Placement: <strong css={{ color: theme.colors.text }}>{placementLabel}</strong>
      </p>
      <div
        css={[
          destinationActionsStyles(theme),
          !showPrimaryAction && { display: 'flex', justifyContent: 'flex-start' },
        ]}
      >
        <Button variant="quiet" disabled={busy} onClick={closeDestination}>
          Cancel
        </Button>
        {showPrimaryAction ? (
          <Button variant="primary" type="submit" busy={busy} disabled={!destinationReady}>
            {destinationActionLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );

  return (
    <>
      <section
        aria-labelledby="project-output-heading"
        css={outputSaveSurfaceStyles(theme)}
        data-project-output-save=""
      >
        <div css={outputSaveContentStyles(theme)} data-project-output-save-content="">
          <div>
            <h3 id="project-output-heading">Current cut</h3>
            <p css={{ margin: 0, color: theme.colors.textMuted }}>
              This frame and the selected placement are what the saved video will use.
            </p>
          </div>
          <div css={currentCutSummaryStyles(theme)}>
            <span data-current-cut-mark aria-hidden="true">
              <AppIcon name="video" />
            </span>
            <span data-current-cut-copy>
              <strong>{current.project.title}</strong>
              <span>{currentDescription}</span>
              <small>
                Project change {current.revision.revisionNumber} · {placementLabel}
              </small>
            </span>
          </div>
          {archived ? (
            <StatusNotice role="status" tone="neutral" title="Read-only Project">
              <p>
                This Project is archived. You can review this cut and its placement, but you cannot
                change or save it as a video.
              </p>
            </StatusNotice>
          ) : null}
          {message ? (
            <StatusNotice role={notice.role} tone={notice.tone} title={notice.title}>
              <p>{message}</p>
              {phase === 'saved' && savedVideo !== null ? (
                <SavedVideoSuccessActions
                  video={savedVideo}
                  exportSpecification={
                    savedVideo.currentVersion.exportSpecification === null ? placement : null
                  }
                  onOpenInAssets={() => void navigate(savedVideoLibraryPath(savedVideo.id))}
                />
              ) : null}
              {phase === 'error' && pendingAvailable ? (
                <Button size="small" onClick={retryPending}>
                  Check this save
                </Button>
              ) : null}
            </StatusNotice>
          ) : null}
          {processing ? (
            <p>Wait for the current AI run to finish before saving its result.</p>
          ) : null}
          {readyMedia === null ? null : (
            <div css={placementSectionStyles(theme)}>
              <ExportPlacementChooser
                value={placement}
                source={currentCut}
                subtitlePlacements={subtitlePlacements}
                disabled={archived || busy || processing}
                unavailable={!placementSupported}
                onChange={(specification) => {
                  session.propose({ exportSpecification: specification });
                }}
              />
            </div>
          )}

          {/*
            An incapable browser is already told so by the chooser, which also disables every
            placement that would need a render — before this control is ever pressed.
            Re-framing states its own progress; storing states itself in the notice above.
          */}
          <ExportPlacementProgress
            phase={placementRender.phase}
            progress={placementRender.progress}
            error={placementRender.error}
            onCancel={cancelPreparation}
          />

          {inlineDestinationOpen ? renderDestinationForm(true, false) : null}

          <p css={outputSaveNoteStyles(theme)}>
            Next, choose whether this becomes a new video or the next Version of a video you own.
          </p>
        </div>
        <div css={saveActionBarStyles(theme)}>
          <Button
            ref={saveTriggerRef}
            variant="primary"
            type={inlineDestinationOpen ? 'submit' : 'button'}
            form={inlineDestinationOpen ? 'project-save-destination-choice' : undefined}
            busy={busy}
            disabled={
              archived ||
              busy ||
              readyMedia === null ||
              processing ||
              (inlineDestinationOpen && !destinationReady)
            }
            aria-label={
              inlineDestinationOpen ? destinationActionLabel : `Save video · ${placementLabel}`
            }
            aria-expanded={inlineDestinationOpen ? undefined : destinationOpen}
            aria-controls="project-save-destination-choice"
            onClick={
              inlineDestinationOpen
                ? undefined
                : (event) => {
                    // Opening the inline form changes this same persistent control into its submit
                    // button. Cancel the originating click's default action so that synchronous
                    // React state cannot make that first click submit the newly mounted form.
                    event.preventDefault();
                    openDestination();
                  }
            }
          >
            {inlineDestinationOpen ? (
              destinationActionLabel
            ) : (
              <>
                Save video · <span data-placement-label="full">{placementLabel}</span>
                <span data-placement-label="short">{placementShortLabel}</span>
              </>
            )}
          </Button>
        </div>
      </section>

      <OverlayPanel
        open={destinationOpen && mobileDestinationSheet}
        onClose={closeDestination}
        title="Save video"
        description="Choose one destination for the exact current cut on the stage."
        placement="bottom"
        size="wide"
        height="sheet"
        closeDisabled={busy}
        closeOnBackdrop={!busy}
        initialFocusRef={titleInputRef}
        returnFocusRef={saveTriggerRef}
      >
        {renderDestinationForm(false, true)}
      </OverlayPanel>
    </>
  );
};
