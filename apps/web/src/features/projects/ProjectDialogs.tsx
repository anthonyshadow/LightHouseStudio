import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { duplicateProjectTitle } from '@studio/domain';
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { apiErrorMessage } from '../../adapters/api-client/apiClient';
import { Button, ConfirmationDialog, OverlayPanel, StatusNotice, TextField } from '../../ui';
import { ProjectCampaignPicker, projectCampaignId } from '../campaigns/ProjectCampaignPicker';
import { dialogActionsStyles } from './ProjectRouteSurface.styles';
import { ProjectApiConflictError } from './projectsApi';
import { useProjectsController } from './useProjectsController';

export const safeProjectError = (error: unknown): string =>
  apiErrorMessage(error, 'Projects could not be loaded. Check the local API and try again.');

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
  // Scoped, because the two actions fail in different places: a named create can blame the name
  // field, an unnamed one has no field to blame.
  const [error, setError] = useState<{
    readonly scope: 'named' | 'unnamed';
    readonly message: string;
  } | null>(null);
  const busy = controller.createNamedMutation.isPending || controller.createMutation.isPending;

  /**
   * Both create paths. The unnamed one is the former "Quick project" button, moved to where the
   * choice is actually made: standing beside the naming field it reads as "skip this", which two
   * unexplained buttons on the list header never did — and it reuses the Campaign already picked
   * here, which that button could not.
   */
  const create = async (scope: 'named' | 'unnamed') => {
    setError(null);
    try {
      onCreated(
        await (scope === 'named'
          ? controller.createNamedMutation.mutateAsync({
              title,
              campaignId: projectCampaignId(campaignId),
            })
          : controller.createMutation.mutateAsync(projectCampaignId(campaignId))),
      );
    } catch (caught) {
      setError({ scope, message: safeProjectError(caught) });
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="New Project"
      description={
        campaignLocked
          ? 'Name the Project, or create it untitled and rename it later. It will be created inside the current Campaign.'
          : 'Name the work now, or create it untitled and rename it later. A Campaign is optional, and the Project may remain collection-only until you add a video.'
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
            data-project-create="unnamed"
            busy={controller.createMutation.isPending}
            disabled={busy}
            onClick={() => void create('unnamed')}
          >
            Create without a name
          </Button>
          <Button
            variant="primary"
            data-project-create="named"
            busy={controller.createNamedMutation.isPending}
            disabled={busy || title.trim().length === 0 || title.trim().length > 120}
            onClick={() => void create('named')}
          >
            Create Project
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create('named');
        }}
        css={{ display: 'grid', gap: theme.space.md }}
      >
        <TextField
          ref={inputRef}
          label="Project name"
          value={title}
          required
          maxLength={120}
          disabled={busy}
          {...(error?.scope === 'named' ? { error: error.message } : {})}
          onChange={(event) => setTitle(event.target.value)}
        />
        <ProjectCampaignPicker
          label={campaignLocked ? 'Campaign' : 'Campaign (optional)'}
          value={campaignId}
          disabled={busy || campaignLocked}
          onValueChange={(value) => setCampaignId(value)}
        />
        {error?.scope === 'unnamed' ? (
          <StatusNotice role="alert" tone="danger" title="Project not created">
            {error.message}
          </StatusNotice>
        ) : null}
      </form>
    </OverlayPanel>
  );
};

/**
 * Making another version of an existing Project. The copy starts from the same original video and
 * the same creative setup; it produces nothing until the operator asks it to, which is what the
 * body states plainly rather than leaving the operator to wonder what it just cost them.
 */
export const DuplicateProjectDialog = ({
  project,
  returnFocusRef,
  onClose,
  onDuplicated,
}: {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onDuplicated: (current: ProjectCurrentResponse) => void;
}) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(() => duplicateProjectTitle(project.title));
  // A copy stays beside its original unless the operator says otherwise.
  const [campaignId, setCampaignId] = useState(project.campaignId ?? 'none');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const busy = controller.duplicateMutation.isPending;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      onDuplicated(
        await controller.duplicateMutation.mutateAsync({
          projectId: project.id,
          title: title.trim(),
          campaignId: projectCampaignId(campaignId),
          expectedVersion: project.version,
        }),
      );
    } catch (caught) {
      setStale(
        caught instanceof ProjectApiConflictError && caught.conflict.kind === 'project-version',
      );
      setError(safeProjectError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Make another version"
      description="Creates a new Project that starts from the same original video and the same creative setup."
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
            data-project-duplicate="confirm"
            busy={busy}
            disabled={busy || title.trim().length === 0 || title.trim().length > 120}
            onClick={() => void submit()}
          >
            Make another version
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          ref={inputRef}
          label="New Project name"
          value={title}
          required
          maxLength={120}
          disabled={busy}
          {...(error && !stale ? { error } : {})}
          onChange={(event) => setTitle(event.target.value)}
        />
        <ProjectCampaignPicker
          label="Campaign (optional)"
          value={campaignId}
          disabled={busy}
          onValueChange={(value) => setCampaignId(value)}
        />
        <StatusNotice role="status" tone="neutral" title="Nothing is generated yet">
          <p>
            The copy points at the same original video — no video is duplicated and no storage is
            used again. No AI work runs and nothing is charged until you start it yourself in the
            new Project.
          </p>
          <p>“{project.title}” is left exactly as it is.</p>
        </StatusNotice>
        {stale ? (
          <StatusNotice role="alert" tone="warning" title="Project changed">
            “{project.title}” changed in another session. Reopen it and make the copy again, so the
            copy starts from what is actually there now.
          </StatusNotice>
        ) : null}
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
  const controller = useProjectsController();
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
    <ConfirmationDialog
      open
      title={`${actionLabel} Project`}
      description={
        action === 'archive'
          ? (archiveBlockedReason ??
            'Archived Projects leave the active workspace and retain their durable history.')
          : 'Restoring returns this empty Project to the active workspace.'
      }
      body={
        <p>
          {action === 'archive' && archiveBlockedReason
            ? 'Stay in this Project or switch away normally. Browser status checks stop on switch, while accepted remote work may continue and reconnect when reopened.'
            : action === 'archive'
              ? `Archive “${project.title}”? You can restore it later.`
              : `Restore “${project.title}” to active Projects?`}
        </p>
      }
      confirmLabel={retryWithLatest ? `Reload and retry ${action}` : `${actionLabel} Project`}
      cancelLabel="Cancel"
      danger={action === 'archive'}
      busy={mutation.isPending}
      confirmDisabled={action === 'archive' && archiveBlockedReason !== undefined}
      {...(error === null ? {} : { alert: error, alertTitle: `${actionLabel} not applied` })}
      returnFocusRef={returnFocusRef}
      onCancel={onClose}
      onConfirm={() => void change()}
    />
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
  const controller = useProjectsController();
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
    <ConfirmationDialog
      open
      title="Delete Project"
      description="The Project disappears from the workspace, while retained lineage continues protecting referenced media."
      body={
        <p>
          Delete “{project.title}”? This removes only this archived Project from visible Project and
          Campaign lists. It does not claim physical erasure of retained history or media.
        </p>
      }
      confirmLabel="Confirm Delete Project"
      cancelLabel="Cancel"
      danger
      busy={busy}
      {...(error === null ? {} : { alert: error, alertTitle: 'Project not deleted' })}
      returnFocusRef={returnFocusRef}
      onCancel={onClose}
      onConfirm={() => void remove()}
    />
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
