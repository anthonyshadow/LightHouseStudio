import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract } from '@studio/contracts';
import { useState, type FormEvent, type RefObject } from 'react';
import { apiErrorMessage } from '../../adapters/api-client/apiClient';
import { Button, OverlayPanel, StatusNotice, TextAreaField, TextField } from '../../ui';
import { dialogActionsStyles } from '../projects/ProjectRouteSurface.styles';
import { useProjectsController } from '../projects/useProjectsController';
import { ProjectCampaignPicker, projectCampaignId } from './ProjectCampaignPicker';
import { CampaignApiConflictError } from './campaignsApi';
import { useCampaignsController } from './useCampaignsController';

export const safeCampaignError = (error: unknown): string =>
  apiErrorMessage(error, 'Campaigns could not be loaded. Check the local API and try again.');

export const CampaignFormDialog = ({
  campaign,
  returnFocusRef,
  onClose,
  onSaved,
}: {
  readonly campaign?: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSaved: (campaign: CampaignContract) => void;
}) => {
  const theme = useTheme();
  const controller = useCampaignsController();
  const [name, setName] = useState(campaign?.name ?? '');
  const [brief, setBrief] = useState(campaign?.brief ?? '');
  const [error, setError] = useState<string | null>(null);
  const editing = campaign !== undefined;
  const mutation = editing ? controller.editMutation : controller.createMutation;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      const saved = editing
        ? await controller.editMutation.mutateAsync({
            campaignId: campaign.id,
            name,
            brief: brief.trim() || null,
            expectedVersion: campaign.version,
          })
        : await controller.createMutation.mutateAsync({
            name,
            brief: brief.trim() || null,
          });
      onSaved(saved);
    } catch (caught) {
      setError(safeCampaignError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={editing ? 'Edit Campaign' : 'Create Campaign'}
      description="Campaigns are lightweight organizers. Only a name is required."
      placement="bottom"
      size="standard"
      closeDisabled={mutation.isPending}
      closeOnBackdrop={false}
      initialFocus="heading"
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={mutation.isPending}
            disabled={name.trim().length === 0 || name.trim().length > 120 || brief.length > 1_000}
            onClick={() => void submit()}
          >
            {editing ? 'Save Campaign' : 'Create Campaign'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          label="Campaign name"
          value={name}
          required
          maxLength={120}
          disabled={mutation.isPending}
          onChange={(event) => setName(event.target.value)}
        />
        <TextAreaField
          label="Brief (optional)"
          value={brief}
          maxLength={1_000}
          disabled={mutation.isPending}
          hint={`${brief.length}/1000 characters`}
          {...(error ? { error } : {})}
          onChange={(event) => setBrief(event.target.value)}
        />
      </form>
    </OverlayPanel>
  );
};

export const MoveProjectDialog = ({
  project,
  currentCampaign,
  returnFocusRef,
  onClose,
  onMoved,
}: {
  readonly project: ProjectContract;
  readonly currentCampaign: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onMoved: (message: string) => void;
}) => {
  const theme = useTheme();
  const projects = useProjectsController();
  const [target, setTarget] = useState('none');
  const [targetLabel, setTargetLabel] = useState('No Campaign');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await projects.moveMutation.mutateAsync({
        projectId: project.id,
        campaignId: projectCampaignId(target),
        expectedVersion: project.version,
      });
      onMoved(`${project.title} moved to ${targetLabel}.`);
    } catch (caught) {
      setError(safeCampaignError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Move Project"
      description="Membership changes use the Project version so concurrent work is never overwritten."
      placement="bottom"
      size="standard"
      closeDisabled={projects.moveMutation.isPending}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={projects.moveMutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={projects.moveMutation.isPending}
            onClick={() => void submit()}
          >
            Move Project
          </Button>
        </div>
      }
    >
      <ProjectCampaignPicker
        label="New location"
        value={target}
        excludeCampaignId={currentCampaign.id}
        disabled={projects.moveMutation.isPending}
        {...(error ? { error } : {})}
        onValueChange={(value, label) => {
          setTarget(value);
          setTargetLabel(label);
        }}
      />
    </OverlayPanel>
  );
};

export type CampaignLifecycleAction = 'archive' | 'restore';

/**
 * One owner for archive and restore, shared by the Campaign list and the Campaign detail page.
 * Deliberately has no reload-and-retry path: unlike Projects, `useCampaignsController` exposes no
 * "latest version" refetch, and a stale CAS here should say so rather than silently re-apply.
 */
export const CampaignLifecycleDialog = ({
  action,
  campaign,
  returnFocusRef,
  onClose,
  onChanged,
}: {
  readonly action: CampaignLifecycleAction;
  readonly campaign: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onChanged: (campaign: CampaignContract, action: CampaignLifecycleAction) => void;
}) => {
  const theme = useTheme();
  const controller = useCampaignsController();
  const [error, setError] = useState<string | null>(null);
  const archiving = action === 'archive';
  const mutation = archiving ? controller.archiveMutation : controller.restoreMutation;
  const busy = mutation.isPending;

  const apply = async () => {
    setError(null);
    try {
      const updated = await mutation.mutateAsync({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
      });
      onChanged(updated, action);
    } catch (caught) {
      setError(safeCampaignError(caught));
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={`${archiving ? 'Archive' : 'Restore'} Campaign`}
      description={
        archiving
          ? 'Archiving only changes Campaign visibility. It does not archive or move Projects.'
          : 'Restoring allows new and moved Project membership again.'
      }
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={archiving ? 'danger' : 'primary'}
            busy={busy}
            onClick={() => void apply()}
          >
            {archiving ? 'Archive Campaign' : 'Restore Campaign'}
          </Button>
        </div>
      }
    >
      <p>
        {archiving
          ? `Archive “${campaign.name}”? Its Projects remain intact.`
          : `Restore “${campaign.name}”?`}
      </p>
      {error ? (
        <StatusNotice role="alert" tone="danger" title="Change not applied">
          {error}
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};

export const DeleteCampaignDialog = ({
  campaign,
  returnFocusRef,
  onClose,
  onDeleted,
}: {
  readonly campaign: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onDeleted: (name: string) => void;
}) => {
  const theme = useTheme();
  const controller = useCampaignsController();
  const [error, setError] = useState<string | null>(null);
  const busy = controller.tombstoneMutation.isPending;

  const remove = async () => {
    setError(null);
    try {
      await controller.tombstoneMutation.mutateAsync({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
      });
      onDeleted(campaign.name);
    } catch (caught) {
      setError(
        caught instanceof CampaignApiConflictError && caught.conflict.kind === 'campaign-not-empty'
          ? 'Move or detach every active and archived Project before deleting this Campaign.'
          : safeCampaignError(caught),
      );
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Delete Campaign"
      description="Only an archived empty Campaign can be deleted. No Project or content bytes are erased."
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} onClick={() => void remove()}>
            Confirm Delete Campaign
          </Button>
        </div>
      }
    >
      <p>Delete “{campaign.name}” as an organizer? This does not erase Project or content bytes.</p>
      {error ? (
        <StatusNotice role="alert" tone="warning" title="Campaign not deleted">
          {error}
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};
