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
import { ProjectApiConflictError, saveProjectOutput } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { projectQueryKeys } from './useProjectsController';

type OutputPhase = 'idle' | 'saving' | 'reconciling' | 'saved' | 'conflict' | 'error';

const outputPhaseNotice = {
  idle: { role: 'status', tone: 'neutral', title: 'Output save needs attention' },
  saving: { role: 'status', tone: 'neutral', title: 'Saving Project output' },
  reconciling: { role: 'status', tone: 'neutral', title: 'Reconciling Project output' },
  saved: { role: 'status', tone: 'success', title: 'Project output saved' },
  conflict: { role: 'alert', tone: 'warning', title: 'Output save conflict' },
  error: { role: 'alert', tone: 'danger', title: 'Output save needs attention' },
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
          ? 'Checking the saved operation receipt after reload. No new save will be created.'
          : 'Saving one immutable Video Version and its Project provenance.',
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
          setPhase(error instanceof ProjectApiConflictError ? 'conflict' : 'error');
          setMessage(
            error instanceof ProjectApiConflictError
              ? error.message
              : 'The selected Project output could not be saved. Review the current media and target.',
          );
        } else {
          setPendingAvailable(true);
          setPhase('error');
          setMessage(
            'The save response was unavailable. The operation ID is retained; retry or reload to reconcile the one possible result.',
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
      setMessage('The authenticated owner could not be bound to this save operation.');
      return;
    }
    if (!(await session.flush())) {
      setPhase('conflict');
      setMessage('Resolve the preserved Project proposal before saving an output.');
      return;
    }
    const latest = session.getCurrent();
    const media = latest === null ? null : readyMediaFor(latest);
    if (latest === null || media === null || latest.project.status === 'processing') {
      setPhase('conflict');
      setMessage('The Project no longer has the exact ready media selected for this save.');
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
        'Browser operation storage is unavailable, so the reload-safe output save was not started.',
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
      ? 'Current review media is one exact retained Video Version.'
      : readyMedia?.assetId === current.revision.snapshot.sourceAssetId
        ? 'Current review media is the immutable original.'
        : 'Current review media is durable working media; the immutable original remains retained separately.';

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
          <h3 id="project-output-heading">Review and save output</h3>
          <p>{currentDescription}</p>
          <p>
            Saving creates a new immutable Version. It does not overwrite the original or any prior
            Version.
          </p>
        </div>
        {message ? (
          <StatusNotice role={notice.role} tone={notice.tone} title={notice.title}>
            <p>{message}</p>
            {phase === 'error' && pendingAvailable ? (
              <Button size="small" onClick={retryPending}>
                Reconcile saved operation
              </Button>
            ) : null}
          </StatusNotice>
        ) : null}
        {processing ? (
          <p>Wait for the active processing attempt to finish before saving its ready result.</p>
        ) : null}
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
          All changes saved describes Project checkpoints. Render preview, Save as New Video, and
          Add Version are separate explicit actions.
        </small>
      </section>

      <OverlayPanel
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        title="Save as New Video"
        description="Create a named Saved Video with this exact ready media as immutable Version 1."
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
          hint="The title names the reusable library record; the Version media remains immutable."
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
        description="Select one active Saved Video explicitly. Reusing a Version as Project source never selects this target."
        emptyTitle="No Add Version targets"
        emptyBody="Use Save as New Video first to create a target."
        listLabel="Saved Videos available as an Add Version target"
      />

      <OverlayPanel
        open={appendDialogOpen && appendTarget !== null}
        onClose={() => setAppendDialogOpen(false)}
        title="Confirm Add Version"
        description="Append without replacing or deleting any prior Version."
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
            <p>The server will reject this save if that current Version changes.</p>
          </div>
        ) : null}
      </OverlayPanel>
    </>
  );
};
