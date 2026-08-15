import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { Button, OverlayPanel, StatusNotice, TextField } from '../../ui';
import { ProjectCampaignPicker, projectCampaignId } from '../campaigns/ProjectCampaignPicker';
import { dialogActionsStyles } from './ProjectRouteSurface.styles';
import { ProjectApiConflictError } from './projectsApi';
import { useProjectsController } from './useProjectsController';

export const safeProjectError = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.message
    : 'Projects could not be loaded. Check the local API and try again.';

export type ProjectLifecycleAction = 'archive' | 'restore';

export const NewProjectDialog = ({
  defaultCampaignId = null,
  campaignLocked = false,
  returnFocusRef,
  onClose,
  onCreated,
}: {
  readonly defaultCampaignId?: string | null;
  readonly campaignLocked?: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onCreated: (current: ProjectCurrentResponse) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [campaignId, setCampaignId] = useState(defaultCampaignId ?? 'none');
  const [error, setError] = useState<string | null>(null);
  const busy = controller.createNamedMutation.isPending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      onCreated(
        await controller.createNamedMutation.mutateAsync({
          title,
          campaignId: projectCampaignId(campaignId),
        }),
      );
    } catch (caught) {
      setError(safeProjectError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="New Project"
      description={
        campaignLocked
          ? 'Name the Project. It will be created inside the current Campaign.'
          : 'Name the work now. A Campaign is optional, and the Project may remain collection-only until you add a video.'
      }
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={title.trim().length === 0 || title.trim().length > 120}
            onClick={() => void submit()}
          >
            Create Project
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          ref={inputRef}
          label="Project name"
          value={title}
          required
          maxLength={120}
          disabled={busy}
          {...(error ? { error } : {})}
          onChange={(event) => setTitle(event.target.value)}
        />
        <ProjectCampaignPicker
          label={campaignLocked ? 'Campaign' : 'Campaign (optional)'}
          value={campaignId}
          disabled={busy || campaignLocked}
          onValueChange={(value) => setCampaignId(value)}
        />
      </form>
    </OverlayPanel>
  );
};

export const RenameProjectDialog = ({
  project,
  returnFocusRef,
  onClose,
  onRenamed,
}: {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onRenamed: (current: ProjectCurrentResponse) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(project.title);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const finish = (current: ProjectCurrentResponse) => {
    setError(null);
    setStale(false);
    onRenamed(current);
  };

  const fail = (caught: unknown) => {
    const conflict = caught instanceof ProjectApiConflictError;
    setStale(conflict && caught.conflict.kind === 'project-version');
    setError(safeProjectError(caught));
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      finish(
        await controller.renameMutation.mutateAsync({
          projectId: project.id,
          title,
          expectedVersion: project.version,
        }),
      );
    } catch (caught) {
      fail(caught);
    }
  };

  const reloadAndRetry = async () => {
    setError(null);
    try {
      finish(await controller.renameLatest(project.id, title));
    } catch (caught) {
      fail(caught);
    }
  };

  const busy = controller.renameMutation.isPending;
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Rename Project"
      description="Project names are shared server state. A stale change is never overwritten."
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {stale ? 'Discard change' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={title.trim().length === 0 || title.trim().length > 120}
            onClick={() => void (stale ? reloadAndRetry() : submit())}
          >
            {stale ? 'Reload and retry rename' : 'Rename Project'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          ref={inputRef}
          label="Project name"
          value={title}
          required
          maxLength={120}
          disabled={busy}
          {...(error ? { error } : {})}
          onChange={(event) => setTitle(event.target.value)}
        />
        {stale ? (
          <StatusNotice role="status" tone="warning" title="Project changed">
            Your proposed name is still here. Reload the current Project and explicitly retry, or
            discard this change.
          </StatusNotice>
        ) : null}
      </form>
    </OverlayPanel>
  );
};

export const ProjectLifecycleDialog = ({
  action,
  project,
  archiveBlockedReason,
  returnFocusRef,
  onClose,
  onChanged,
}: {
  readonly action: ProjectLifecycleAction;
  readonly project: ProjectContract;
  readonly archiveBlockedReason?: string;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onChanged: (current: ProjectCurrentResponse, action: ProjectLifecycleAction) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryWithLatest, setRetryWithLatest] = useState(false);
  const mutation = action === 'archive' ? controller.archiveMutation : controller.restoreMutation;
  const actionLabel = action === 'archive' ? 'Archive' : 'Restore';

  const change = async () => {
    setError(null);
    try {
      const current = retryWithLatest
        ? await controller.changeLatestLifecycle(
            project.id,
            action === 'archive' ? 'archived' : 'active',
          )
        : await mutation.mutateAsync({
            projectId: project.id,
            expectedVersion: project.version,
          });
      onChanged(current, action);
    } catch (caught) {
      setError(safeProjectError(caught));
      setRetryWithLatest(true);
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={`${actionLabel} Project`}
      description={
        action === 'archive'
          ? (archiveBlockedReason ??
            'Archived Projects leave the active workspace and retain their durable history.')
          : 'Restoring returns this empty Project to the active workspace.'
      }
      placement="bottom"
      size="standard"
      closeDisabled={mutation.isPending}
      closeOnBackdrop={false}
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button ref={cancelRef} variant="quiet" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === 'archive' ? 'danger' : 'primary'}
            busy={mutation.isPending}
            disabled={action === 'archive' && archiveBlockedReason !== undefined}
            onClick={() => void change()}
          >
            {retryWithLatest ? `Reload and retry ${action}` : `${actionLabel} Project`}
          </Button>
        </div>
      }
    >
      <p>
        {action === 'archive' && archiveBlockedReason
          ? 'Stay in this Project or switch away normally. Browser status checks stop on switch, while accepted remote work may continue and reconnect when reopened.'
          : action === 'archive'
            ? `Archive “${project.title}”? You can restore it later.`
            : `Restore “${project.title}” to active Projects?`}
      </p>
      {error ? (
        <StatusNotice role="alert" tone="warning" title={`${actionLabel} not applied`}>
          {error}
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};

export const DeleteProjectDialog = ({
  project,
  returnFocusRef,
  onClose,
  onDeleted,
}: {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onDeleted: (title: string) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = controller.tombstoneMutation.isPending;

  const remove = async () => {
    setError(null);
    try {
      await controller.tombstoneMutation.mutateAsync({
        projectId: project.id,
        expectedVersion: project.version,
      });
      onDeleted(project.title);
    } catch (caught) {
      setError(safeProjectError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Delete Project"
      description="The Project disappears from the workspace, while retained lineage continues protecting referenced media."
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button ref={cancelRef} variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={() => void remove()}>
            Confirm Delete Project
          </Button>
        </div>
      }
    >
      <p>
        Delete “{project.title}”? This removes only this archived Project from visible Project and
        Campaign lists. It does not claim physical erasure of retained history or media.
      </p>
      {error ? (
        <StatusNotice role="alert" tone="warning" title="Project not deleted">
          {error}
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};

export const ProjectCampaignDialog = ({
  project,
  returnFocusRef,
  onClose,
  onChanged,
}: {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onChanged: (current: ProjectCurrentResponse, location: string) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const [campaignId, setCampaignId] = useState(project.campaignId ?? 'none');
  const [campaignLabel, setCampaignLabel] = useState('the selected Campaign');
  const [error, setError] = useState<string | null>(null);

  const move = async () => {
    setError(null);
    try {
      const current = await controller.moveMutation.mutateAsync({
        projectId: project.id,
        campaignId: projectCampaignId(campaignId),
        expectedVersion: project.version,
      });
      onChanged(current, campaignLabel);
    } catch (caught) {
      setError(safeProjectError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Project Campaign"
      description="Move this Project to one active Campaign, or detach it to No Campaign."
      placement="bottom"
      size="standard"
      closeDisabled={controller.moveMutation.isPending}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={controller.moveMutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={controller.moveMutation.isPending}
            disabled={campaignId === (project.campaignId ?? 'none')}
            onClick={() => void move()}
          >
            Confirm location
          </Button>
        </div>
      }
    >
      <ProjectCampaignPicker
        label="Campaign"
        value={campaignId}
        disabled={controller.moveMutation.isPending}
        {...(error ? { error } : {})}
        onValueChange={(value, label) => {
          setCampaignId(value);
          setCampaignLabel(label);
        }}
      />
    </OverlayPanel>
  );
};
