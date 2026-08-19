import { useTheme } from '@emotion/react';
import type {
  ProjectCurrentResponse,
  SavedVideoSummary,
  SaveProjectOutputRequest,
} from '@studio/contracts';
import { projectMediaReferencesEqual } from '@studio/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { Button, OverlayPanel, StatusNotice, TextField } from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import {
  clearPendingProjectOutput,
  loadPendingProjectOutput,
  storePendingProjectOutput,
  type PendingProjectOutputOperation,
} from './projectOutputOperationStorage';
import { getProject, ProjectApiConflictError, saveProjectOutput } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { projectQueryKeys } from './useProjectsController';

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
  const queryClient = useQueryClient();
  const newTriggerRef = useRef<HTMLButtonElement>(null);
  const appendTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef<string | null>(null);
  const recoveredRef = useRef<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appendDialogOpen, setAppendDialogOpen] = useState(false);
  const [appendTarget, setAppendTarget] = useState<SavedVideoSummary | null>(null);
  const [title, setTitle] = useState(current.project.title);
  const [phase, setPhase] = useState<OutputPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAvailable, setPendingAvailable] = useState(false);
  const readyMedia = readyMediaFor(current);
  const busy = phase === 'saving' || phase === 'reconciling';
  const processing = current.project.status === 'processing';
  const notice = outputPhaseNotice[phase];

  const runOperation = useCallback(
    async (pending: PendingProjectOutputOperation, recovered: boolean) => {
      if (inFlightRef.current !== null) return;
      inFlightRef.current = pending.operationId;
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
        ]);
        setPhase('saved');
        setMessage(
          pending.request.target.kind === 'new'
            ? `Saved “${response.savedVideo.title}” as Version ${response.savedVideo.currentVersion.ordinal}.`
            : `Added Version ${response.savedVideo.currentVersion.ordinal} to “${response.savedVideo.title}”.`,
        );
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

  useEffect(() => {
    if (ownerUserId === undefined || archived) return;
    const pending = loadPendingProjectOutput(ownerUserId, current.project.id);
    if (pending === null || recoveredRef.current === pending.operationId) return;
    recoveredRef.current = pending.operationId;
    void runOperation(pending, true);
  }, [archived, current.project.id, ownerUserId, runOperation]);

  const begin = async (target: SaveProjectOutputRequest['target']) => {
    setNewDialogOpen(false);
    setAppendDialogOpen(false);
    if (ownerUserId === undefined) {
      setPhase('error');
      setMessage('Your account could not be confirmed for this save.');
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

  const retryPending = () => {
    if (ownerUserId === undefined) return;
    const pending = loadPendingProjectOutput(ownerUserId, current.project.id);
    if (pending !== null) void runOperation(pending, true);
  };

  if (current.revision.snapshot.sourceAssetId === null) return null;
  const currentDescription =
    readyMedia?.kind === 'saved-video-version'
      ? 'You’re viewing one saved version.'
      : readyMedia?.assetId === current.revision.snapshot.sourceAssetId
        ? 'You’re viewing the original video.'
        : 'You’re viewing the current cut. Your original video is kept separately and never changes.';

  return (
    <>
      <section
        aria-labelledby="project-output-heading"
        css={{
          display: 'grid',
          gap: theme.space.md,
          padding: theme.space.md,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.large,
          background: theme.colors.surface,
        }}
      >
        <div>
          <h3 id="project-output-heading">Review and save</h3>
          <p>{currentDescription}</p>
          <p>
            Saving creates a new version. It never overwrites your original video or an earlier
            version.
          </p>
        </div>
        {message ? (
          <StatusNotice role={notice.role} tone={notice.tone} title={notice.title}>
            <p>{message}</p>
            {phase === 'error' && pendingAvailable ? (
              <Button size="small" onClick={retryPending}>
                Check this save
              </Button>
            ) : null}
          </StatusNotice>
        ) : null}
        {processing ? <p>Wait for the current AI run to finish before saving its result.</p> : null}
        <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button
            ref={newTriggerRef}
            variant="primary"
            busy={busy}
            disabled={archived || busy || readyMedia === null || processing}
            onClick={() => {
              setTitle(current.project.title);
              setNewDialogOpen(true);
            }}
          >
            Save as New Video
          </Button>
          <Button
            ref={appendTriggerRef}
            busy={busy}
            disabled={archived || busy || readyMedia === null || processing}
            onClick={() => setPickerOpen(true)}
          >
            Add Version
          </Button>
        </div>
        <small>
          “All changes saved” refers to your saved progress. Render preview, Save as New Video and
          Add Version are separate actions you take yourself.
        </small>
      </section>

      <OverlayPanel
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        title="Save as New Video"
        description="Creates a new video in your library, with this as Version 1."
        placement="bottom"
        size="standard"
        closeDisabled={busy}
        closeOnBackdrop={!busy}
        initialFocusRef={titleInputRef}
        returnFocusRef={newTriggerRef}
        footer={
          <div css={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm }}>
            <Button variant="quiet" disabled={busy} onClick={() => setNewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={title.trim().length === 0 || title.trim().length > 120}
              onClick={() => void begin({ kind: 'new', title: title.trim() })}
            >
              Save as New Video
            </Button>
          </div>
        }
      >
        <TextField
          ref={titleInputRef}
          label="Video title"
          required
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
          hint="The title names the video in your library. The version itself never changes."
        />
      </OverlayPanel>

      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={busy}
        returnFocusRef={appendTriggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => {
          setPickerOpen(false);
          setAppendTarget(video);
          setAppendDialogOpen(true);
        }}
        title="Choose Add Version target"
        description="Choose one of your videos. Using a version as this Project’s original video does not choose it here."
        emptyTitle="No Add Version targets"
        emptyBody="Use Save as New Video first to create a target."
        listLabel="Saved Videos available as an Add Version target"
      />

      <OverlayPanel
        open={appendDialogOpen && appendTarget !== null}
        onClose={() => setAppendDialogOpen(false)}
        title="Confirm Add Version"
        description="Adds a version without replacing or deleting any earlier one."
        placement="bottom"
        size="standard"
        closeDisabled={busy}
        closeOnBackdrop={false}
        returnFocusRef={appendTriggerRef}
        footer={
          <div css={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm }}>
            <Button variant="quiet" disabled={busy} onClick={() => setAppendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={appendTarget === null}
              onClick={() => {
                if (appendTarget === null) return;
                void begin({
                  kind: 'version',
                  savedVideoId: appendTarget.id,
                  expectedVersionId: appendTarget.currentVersion.id,
                });
              }}
            >
              Add Version
            </Button>
          </div>
        }
      >
        {appendTarget ? (
          <div>
            <p>
              Target: <strong>{appendTarget.title}</strong>
            </p>
            <p>
              Current Version {appendTarget.currentVersion.ordinal} ·{' '}
              {appendTarget.currentVersion.width}×{appendTarget.currentVersion.height}
            </p>
            <p>If that current version changes first, this save is refused.</p>
          </div>
        ) : null}
      </OverlayPanel>
    </>
  );
};
