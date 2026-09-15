import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { ProjectCurrentResponse, ProjectSourceCollectionItem } from '@studio/contracts';
import { PROJECT_SOURCE_LIMIT } from '@studio/contracts';
import { formatDuration } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { savedVideoThumbnailUrl } from '../../adapters/api-client/savedVideosApi';
import { Button, ConfirmationDialog, StatusNotice } from '../../ui';
import type { NoticeTone } from '../../ui/primitives/StatusNotice';
import { media } from '../../ui/media';
import { VideoPlayer } from '../video-player/VideoPlayer';
import { ProjectAssetThumbnail } from './ProjectAssetThumbnail';
import type { ProjectRecordingCandidate } from './ProjectSourceSection';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import { PROJECT_MEDIA_REMOVAL_REASSURANCE } from './projectProcessingPresentation';
import { ProjectRecordingNotices } from './ProjectRecordingNotices';
import {
  useProjectRecordingControl,
  type ProjectRecordingLaunchRefusal,
} from './projectRecordingLaunch';
import { projectSourceContentUrl } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import {
  videoRowBadgeStyles,
  videoRowListStyles,
  videoRowPreviewStyles,
} from './projectVideoRow.styles';
import {
  useProjectMediaController,
  type ProjectMediaAct,
  type ProjectMediaPhase,
} from './useProjectMediaController';
import type { ProjectSourceRuntime } from './useProjectSourceController';
import {
  PROJECT_VIDEO_FILE_ACCEPT,
  projectVideoIntakeNotice,
  useProjectVideoIntake,
} from './useProjectVideoIntake';

const sectionStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  minWidth: 0,
  '& > h3': { margin: 0, fontSize: theme.fontSizes.body },
  '& > p': { margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata },
  '& [data-project-media-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.space.xs,
    alignItems: 'center',
  },
});

const rowStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'clamp(4.5rem, 18vw, 7rem) minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  minWidth: 0,
  padding: theme.space.xs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surface,
  [media.down('tablet')]: {
    gridTemplateColumns: '4rem minmax(0, 1fr)',
    '& > [data-project-media-row-actions]': { gridColumn: '1 / -1', justifySelf: 'start' },
  },
});

const copyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  minWidth: 0,
  '& > strong': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  '& > small': { color: theme.colors.textMuted },
  '& [data-project-media-state]': {
    justifySelf: 'start',
    padding: '0.1rem 0.4rem',
    borderRadius: theme.radii.small,
    background: theme.colors.accentSoft,
    color: theme.colors.text,
    fontSize: theme.fontSizes.caption,
    fontWeight: 700,
  },
});

/**
 * What each piece of media is to this Project, in the operator's words.
 *
 * The stored state is always ready — the server inspects and stores before it writes a row — so
 * what a row has to say is where the video came from, and which one of them the Project is built
 * from. Everything transient (adding, cancelled, refused) belongs to the act rather than the row,
 * and the section's one notice owns it.
 */
const mediaStateLabel = (source: ProjectSourceCollectionItem, original: boolean): string => {
  if (original) return 'Original';
  switch (source.kind) {
    case 'saved-video-version':
      return 'From your videos';
    case 'recorded':
      return 'Recorded';
    case 'uploaded':
      return 'Uploaded';
  }
};

interface ProjectMediaNotice {
  readonly title: string;
  readonly tone: NoticeTone;
}

/**
 * What a failure is called, by the act that failed.
 *
 * One spelling, because the notice and the removal dialog both name it and are read together: they
 * were written separately and had already drifted, which is the same drift in miniature as the one
 * `act` exists to prevent.
 */
const FAILURE_TITLE: Record<ProjectMediaAct, string> = {
  add: 'Video not added',
  remove: 'Video not removed',
};

// `act` is carried through the terminal states because one phase serves both: a removal that failed
// used to be announced as a video that could not be added, over a dialog saying the opposite.
const mediaNotice = (phase: ProjectMediaPhase, act: ProjectMediaAct): ProjectMediaNotice => {
  switch (phase) {
    case 'idle':
      return { title: 'Nothing changed', tone: 'neutral' };
    case 'adding':
      return { title: 'Adding video', tone: 'neutral' };
    case 'removing':
      return { title: 'Removing video', tone: 'neutral' };
    case 'added':
      return { title: 'Video added', tone: 'success' };
    case 'removed':
      return { title: 'Video removed', tone: 'success' };
    case 'conflict':
      return { title: 'Conflict', tone: 'warning' };
    case 'error':
      return { title: FAILURE_TITLE[act], tone: 'danger' };
  }
};

/** A notice with the words to show and, while the wait can still be called off, how to end it. */
interface ProjectMediaNoticeOnScreen extends ProjectMediaNotice {
  readonly body: string;
  readonly onCancel: (() => void) | undefined;
}

/**
 * What this Project's media is doing, for the surfaces that outlive the section.
 *
 * `busy` covers the intake as well as the request: converting a phone clip is minutes of the
 * operator's work, and reported idle it looked like nothing in flight — so leaving discarded it
 * without asking, and a sibling act could move the Project out from under it. Work in flight only:
 * a surface that needs to know how much media a Project holds reads the collection itself, through
 * {@link useProjectHeldSourceCount}.
 */
export interface ProjectMediaActivity {
  readonly busy: boolean;
  readonly abort: (() => void) | null;
}

/**
 * Everything this Project works from, and the ways to change it.
 *
 * Mounted only where the Project already has an original, so the empty case keeps its single owner
 * in {@link ProjectSourceSection} — one surface asking for the first video, one showing the rest.
 * The original appears here too, named as such and without a Remove: "Remove original video" is a
 * different act with different consequences and it stays with the section that explains them. The
 * server draws the same line — removing the named original while other media is held is refused.
 */
export const ProjectMediaSection = ({
  current,
  session,
  archived,
  recordingCandidate,
  recordingActive = false,
  recordingSupported = true,
  changeBlockedReason,
  runtime,
  onStartRecording,
  onActivityChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly recordingSupported?: boolean | undefined;
  /** Why this Project's media cannot change right now, or nothing when it can. */
  readonly changeBlockedReason?: string | undefined;
  /**
   * The stage, so a take this Project takes on can be marked as claimed. A detached surface has
   * none, and also has no take to claim.
   */
  readonly runtime: ProjectSourceRuntime;
  readonly onStartRecording?: (() => ProjectRecordingLaunchRefusal | null) | undefined;
  readonly onActivityChange?: ((activity: ProjectMediaActivity) => void) | undefined;
}) => {
  const theme = useTheme();
  const projectId = current.project.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  /*
   * Focus comes back to the heading, not to the row's own Remove button: a confirmed removal
   * unmounts that row, and returning focus to a detached node drops it to the document body, so
   * the next Tab restarted at the top of the shell.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProjectSourceCollectionItem | null>(null);
  const controller = useProjectMediaController(projectId, session);
  const { addUpload } = controller;
  const acceptIntake = useCallback(
    (file: File) => {
      void addUpload(file, 'uploaded');
    },
    [addUpload],
  );
  const intake = useProjectVideoIntake(acceptIntake);
  const originalAssetId = current.revision.snapshot.sourceAssetId;
  const stage = runtime.kind === 'stage' ? runtime : null;
  const record = useProjectRecordingControl({
    onStartRecording,
    recordingActive,
    recordingSupported,
  });
  // One idea of busy for the section: converting the operator's file is their video being made
  // ready just as much as the upload that follows it, and offering a second one mid-conversion
  // would discard the first silently.
  const busy = controller.busy || intake.phase !== null;
  // Hoisted above the rows: Emotion serialises each of these objects on every call, and the list
  // runs to `PROJECT_SOURCE_LIMIT`.
  const rowCss = rowStyles(theme);
  const copyCss = copyStyles(theme);
  const badgeCss = videoRowBadgeStyles(theme);
  const previewCss = videoRowPreviewStyles(theme);
  const rowActionsCss = { display: 'flex', gap: theme.space.xs } as const;
  const blocked = archived || changeBlockedReason !== undefined;
  // `loaded` is load-bearing, not defensive: an add made against a collection this browser has
  // never read cannot be reconciled afterwards, because there is no "before" to compare with.
  const addDisabled = blocked || busy || !controller.loaded || controller.atLimit;
  const take = recordingCandidate?.ready ? recordingCandidate : null;
  /*
   * What the surfaces that outlive this section are told. Rebuilt only when one of its two facts
   * moves, so the effect below reports a change rather than a render.
   */
  const activity = useMemo<ProjectMediaActivity>(
    () => ({
      busy,
      abort: intake.phase !== null ? intake.cancel : controller.busy ? controller.cancel : null,
    }),
    [busy, controller.busy, controller.cancel, intake.cancel, intake.phase],
  );
  useEffect(() => {
    onActivityChange?.(activity);
  }, [activity, onActivityChange]);
  /*
   * One notice, with the intake speaking first while it has something to say: its wait is the only
   * thing happening, and a refusal from here supersedes whatever the last attempt at the server
   * left on screen. Only the intake's own wait is cancellable from here — once the request is in
   * flight the controller owns the abort.
   */
  const notice = ((): ProjectMediaNoticeOnScreen | null => {
    if (intake.phase !== null) {
      return { ...projectVideoIntakeNotice(intake.phase), onCancel: intake.cancel };
    }
    if (intake.refusal !== null) {
      return { title: 'Video not used', tone: 'danger', body: intake.refusal, onCancel: undefined };
    }
    if (controller.message === null) return null;
    return {
      ...mediaNotice(controller.phase, controller.act),
      body: controller.message,
      onCancel: controller.phase === 'adding' ? controller.cancel : undefined,
    };
  })();

  return (
    <>
      <section css={sectionStyles(theme)} aria-labelledby="project-media-heading">
        <h3 id="project-media-heading" ref={headingRef} tabIndex={-1}>
          Media in this Project
        </h3>
        <p>
          Everything this Project works from. One of them is its original video; the rest are extra
          footage you can preview here and remove at any time. Adding media never starts paid AI
          work.
        </p>

        {controller.query.isPending ? <p role="status">Loading this Project’s media…</p> : null}
        {controller.query.isError ? (
          <StatusNotice role="alert" tone="danger" title="Media unavailable">
            <p>This Project’s media could not be loaded from the local API.</p>
            <Button size="small" onClick={() => void controller.query.refetch()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}

        {controller.sources.length > 0 ? (
          <ul aria-label="Media in this Project" css={videoRowListStyles(theme)}>
            {controller.sources.map((source) => {
              const original = source.assetId === originalAssetId;
              const previewOpen = previewAssetId === source.assetId;
              const thumbnailUrl =
                source.kind === 'saved-video-version' &&
                source.savedVideoId !== null &&
                source.videoVersionId !== null
                  ? savedVideoThumbnailUrl(source.savedVideoId, source.videoVersionId)
                  : null;
              const duration = formatDuration(source.durationMs);
              return (
                <li key={source.assetId} data-project-media-item={original ? 'original' : 'extra'}>
                  <div css={rowCss}>
                    <ProjectAssetThumbnail
                      kind="video"
                      label={source.filename}
                      thumbnailUrl={thumbnailUrl}
                      unavailable={false}
                    >
                      <span css={badgeCss}>{duration}</span>
                    </ProjectAssetThumbnail>
                    <span css={copyCss}>
                      <strong>{source.filename}</strong>
                      <span data-project-media-state>{mediaStateLabel(source, original)}</span>
                      <small>
                        {source.width}×{source.height} · {duration}
                      </small>
                    </span>
                    <span data-project-media-row-actions css={rowActionsCss}>
                      <Button
                        size="small"
                        variant="quiet"
                        data-project-media-action="preview"
                        aria-expanded={previewOpen}
                        aria-controls={`project-media-preview-${source.assetId}`}
                        aria-label={`${previewOpen ? 'Hide preview of' : 'Preview'} ${source.filename}`}
                        onClick={() => setPreviewAssetId(previewOpen ? null : source.assetId)}
                      >
                        {previewOpen ? 'Hide preview' : 'Preview'}
                      </Button>
                      {original ? null : (
                        <Button
                          size="small"
                          variant="danger"
                          data-project-media-action="remove"
                          disabled={blocked || busy}
                          aria-label={`Remove ${source.filename} from this Project`}
                          onClick={() => setRemoving(source)}
                        >
                          Remove
                        </Button>
                      )}
                    </span>
                  </div>
                  {previewOpen ? (
                    <div id={`project-media-preview-${source.assetId}`} css={previewCss}>
                      <VideoPlayer
                        src={projectSourceContentUrl(projectId, source.assetId)}
                        title={source.filename}
                        poster={thumbnailUrl ?? undefined}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {notice ? (
          <StatusNotice
            role={notice.tone === 'neutral' || notice.tone === 'success' ? 'status' : 'alert'}
            tone={notice.tone}
            title={notice.title}
          >
            {notice.body}
            {notice.onCancel ? (
              <Button size="small" variant="quiet" onClick={notice.onCancel}>
                Cancel
              </Button>
            ) : null}
          </StatusNotice>
        ) : null}

        <div data-project-media-actions>
          <input
            ref={inputRef}
            type="file"
            accept={PROJECT_VIDEO_FILE_ACCEPT}
            hidden
            disabled={addDisabled}
            aria-label="Add a video file to this Project"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void intake.offer(file);
            }}
          />
          {take ? (
            <Button
              variant="primary"
              busy={controller.busy}
              disabled={addDisabled}
              onClick={() => {
                // A take supersedes a file the intake refused, and the refusal goes with it.
                intake.dismiss();
                void controller.addUpload(take.file, 'recorded', () =>
                  // Claimed only once the server has it. Nothing else can work this out: the take
                  // stays `recorded` on the stage, so it would go on being offered, and the exit
                  // guard would go on asking to discard a video the Project already holds.
                  stage?.claim(projectId, take.artifactId),
                );
              }}
            >
              Add this recording
            </Button>
          ) : (
            <Button
              disabled={addDisabled || onStartRecording === undefined || record.unsupported}
              busy={recordingActive}
              aria-describedby={record.describedById}
              onClick={record.press}
            >
              Record more
            </Button>
          )}
          <Button disabled={addDisabled} onClick={() => inputRef.current?.click()}>
            Add a video file
          </Button>
          <Button ref={pickerTriggerRef} disabled={addDisabled} onClick={() => setPickerOpen(true)}>
            Add from your videos
          </Button>
          <ProjectRecordingNotices record={record} />
        </div>

        {changeBlockedReason === undefined ? null : (
          <StatusNotice role="status" tone="warning" title="Media cannot change yet">
            {changeBlockedReason}
          </StatusNotice>
        )}
        {controller.atLimit ? (
          <StatusNotice role="status" tone="warning" title="This Project is full">
            {`A Project holds up to ${PROJECT_SOURCE_LIMIT} videos. Remove one before adding another.`}
          </StatusNotice>
        ) : null}
        {archived ? (
          <small>Archived Projects are read-only. Restore it to change its media.</small>
        ) : null}
      </section>

      {removing ? (
        <ConfirmationDialog
          open
          title="Remove this video"
          description="It stays in your library and in this Project’s history."
          body={
            <>
              <p>
                {`Remove “${removing.filename}” from this Project? ${PROJECT_MEDIA_REMOVAL_REASSURANCE}`}
              </p>
              {changeBlockedReason === undefined ? null : <p>{changeBlockedReason}</p>}
            </>
          }
          confirmLabel="Remove from Project"
          cancelLabel="Cancel"
          danger
          busy={controller.busy}
          // A block can arrive while this is open — a provider attempt resolving behind it — and
          // the controls underneath disable without the confirm hearing about it.
          confirmDisabled={blocked}
          {...(controller.act === 'remove' &&
          (controller.phase === 'conflict' || controller.phase === 'error')
            ? { alert: controller.message ?? undefined, alertTitle: FAILURE_TITLE[controller.act] }
            : {})}
          returnFocusRef={headingRef}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            // A removal supersedes a file the intake refused, the way the other two acts do;
            // without it the stale refusal outranked this act's own outcome.
            intake.dismiss();
            void controller.remove(removing).then((removed) => {
              if (removed) setRemoving(null);
            });
          }}
        />
      ) : null}

      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={controller.busy}
        projectId={projectId}
        title="Add a video to this Project"
        description="Choose one exact active Version. The stored bytes are referenced, not copied, and that video is not changed."
        listLabel="Videos available to add to this Project"
        returnFocusRef={pickerTriggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => {
          setPickerOpen(false);
          intake.dismiss();
          void controller.addSavedVideo(video);
        }}
      />
    </>
  );
};
