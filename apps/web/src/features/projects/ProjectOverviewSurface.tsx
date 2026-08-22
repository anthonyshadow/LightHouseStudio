import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { formatDateTime, type CreativeAssetStore } from '@studio/domain';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS, campaignPath, projectWorkspacePath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { ActionMenu, AppIcon, Button } from '../../ui';
import { useCampaignDetail } from '../campaigns/useCampaignsController';
import { ProjectAssetsSection } from './ProjectAssetsSection';
import {
  DeleteProjectDialog,
  DuplicateProjectDialog,
  ProjectCampaignDialog,
  ProjectLifecycleDialog,
  RenameProjectDialog,
  type ProjectLifecycleAction as LifecycleAction,
} from './ProjectDialogs';
import {
  projectOverviewHeaderStyles,
  projectOverviewInnerStyles,
  projectOverviewSourceStyles,
} from './ProjectOverviewSurface.styles';
import { ProjectSourceSection, type ProjectRecordingCandidate } from './ProjectSourceSection';
import { projectStatusLabel } from './projectStatusPresentation';
import { ProjectWorkflowProgress, stepForSnapshot } from './ProjectWorkflowProgress';
import type { useProjectSession } from './useProjectSession';
import type { ProjectSourceActivity, ProjectSourceRuntime } from './useProjectSourceController';

const projectWorkflowLabel = (
  phase: ProjectCurrentResponse['revision']['snapshot']['workflowPhase'],
): string => phase.charAt(0).toUpperCase() + phase.slice(1);

interface ProjectLifecycleDialogTarget {
  readonly action: LifecycleAction;
  readonly project: ProjectContract;
}

interface ProjectOverviewSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ReturnType<typeof useProjectSession>;
  readonly archiveBlockedReason: string | undefined;
  readonly sourceRuntime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly onStartRecording?: (() => void) | undefined;
  readonly onSourceActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly creativeStore?: CreativeAssetStore | undefined;
  readonly onCreateProjectCharacter?: ((projectId: string) => void) | undefined;
  readonly onCreateProjectOutfit?: ((projectId: string) => void) | undefined;
}

export const ProjectOverviewSurface = ({
  current,
  session,
  archiveBlockedReason,
  sourceRuntime,
  recordingCandidate,
  recordingActive,
  onStartRecording,
  onSourceActivityChange,
  creativeStore,
  onCreateProjectCharacter,
  onCreateProjectOutfit,
}: ProjectOverviewSurfaceProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const goBack = useRouteBack();
  const project = current.project;
  const campaign = useCampaignDetail(project.campaignId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<ProjectLifecycleDialogTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectContract | null>(null);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const archived = project.archivedAt !== null;
  const overviewHasSource = current.revision.snapshot.sourceAssetId !== null;
  const campaignName = campaign.data?.name ?? null;
  const closeDialog = () => {
    setRenameTarget(null);
    setLifecycleDialog(null);
    setDeleteTarget(null);
    setCampaignDialog(false);
    setDuplicateTarget(null);
  };
  const acceptSession = session.acceptCurrent;
  // Accepting a source from the overview lands the operator in the workspace, where the media stage
  // holding the accepted original is visible. The identity must stay stable: the source controller
  // re-runs its hydration effect whenever this callback changes.
  const acceptOverviewSource = useCallback(
    (next: ProjectCurrentResponse) => {
      acceptSession(next);
      if (next.revision.snapshot.sourceAssetId !== null) {
        void navigate(projectWorkspacePath(next.project.id));
      }
    },
    [acceptSession, navigate],
  );

  return (
    <div css={projectOverviewInnerStyles(theme)} data-project-overview="">
      <header css={projectOverviewHeaderStyles(theme)}>
        <Button
          data-detail-breadcrumb
          variant="quiet"
          onClick={() =>
            goBack(
              project.campaignId === null ? APP_PATHS.projects : campaignPath(project.campaignId),
            )
          }
        >
          {project.campaignId === null
            ? '← All Projects'
            : campaignName === null
              ? '← Campaign'
              : `← ${campaignName}`}
        </Button>
        <div data-detail-identity>
          <div>
            <h1 ref={headingRef} tabIndex={-1}>
              {project.title}
            </h1>
            <div data-detail-meta>
              <span data-project-overview-status>{projectStatusLabel(project.status)}</span>
              <span>
                Updated{' '}
                <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
              </span>
              {project.campaignId === null ? (
                <span>No Campaign</span>
              ) : (
                <span aria-live="polite">
                  {campaign.isPending
                    ? 'Campaign: loading…'
                    : campaign.isError || campaignName === null
                      ? 'Campaign unavailable'
                      : `Campaign: ${campaignName}`}
                </span>
              )}
            </div>
            <div data-project-workspace-status>
              <AppIcon name="info" />
              <span>
                {overviewHasSource
                  ? `Original video ready • ${projectWorkflowLabel(current.revision.snapshot.workflowPhase)} workflow active.`
                  : 'No original video yet • Choose one below to begin.'}
              </span>
            </div>
            <ProjectWorkflowProgress snapshot={current.revision.snapshot} />
          </div>
          <div data-detail-actions>
            <Button
              variant="primary"
              data-detail-action="continue"
              onClick={() => void navigate(projectWorkspacePath(project.id))}
            >
              {archived
                ? 'View workspace'
                : overviewHasSource
                  ? 'Continue editing'
                  : 'Add original video'}
            </Button>
            <ActionMenu
              label={`More actions for ${project.title}`}
              size="regular"
              items={[
                {
                  id: 'duplicate',
                  label: 'Duplicate Project',
                  onSelect: (trigger) => {
                    dialogReturnRef.current = trigger;
                    setDuplicateTarget(project);
                  },
                },
                {
                  id: 'move',
                  label: 'Move Project',
                  onSelect: (trigger) => {
                    dialogReturnRef.current = trigger;
                    setCampaignDialog(true);
                  },
                },
                ...(archived
                  ? []
                  : [
                      {
                        id: 'rename',
                        label: 'Rename',
                        onSelect: (trigger: HTMLButtonElement | null) => {
                          dialogReturnRef.current = trigger;
                          setRenameTarget(project);
                        },
                      },
                    ]),
                {
                  id: 'archive',
                  label: archived ? 'Restore' : 'Archive',
                  danger: !archived,
                  onSelect: (trigger) => {
                    dialogReturnRef.current = trigger;
                    setLifecycleDialog({ action: archived ? 'restore' : 'archive', project });
                  },
                },
                ...(archived
                  ? [
                      {
                        id: 'delete',
                        label: 'Delete Project',
                        danger: true,
                        onSelect: (trigger: HTMLButtonElement | null) => {
                          dialogReturnRef.current = trigger;
                          setDeleteTarget(project);
                        },
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      </header>

      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {!archived && !overviewHasSource ? (
        <section
          css={projectOverviewSourceStyles(theme)}
          aria-labelledby="project-overview-source-heading"
          data-project-overview-source=""
        >
          <header>
            <h2 id="project-overview-source-heading">Original video</h2>
            <p>
              Every Project is built from one original video that never changes. Choose it here, or
              open the workspace to do it later.
            </p>
          </header>
          <ProjectSourceSection
            key={project.id}
            current={current}
            runtime={sourceRuntime}
            recordingCandidate={recordingCandidate}
            recordingActive={recordingActive}
            {...(onStartRecording ? { onStartRecording } : {})}
            {...(onSourceActivityChange ? { onActivityChange: onSourceActivityChange } : {})}
            onCurrentChange={acceptOverviewSource}
          />
        </section>
      ) : null}

      <ProjectAssetsSection
        projectId={project.id}
        archived={archived}
        projectHasSource={overviewHasSource}
        session={session.port}
        {...(creativeStore ? { creativeStore } : {})}
        {...(onCreateProjectCharacter ? { onCreateCharacter: onCreateProjectCharacter } : {})}
        {...(onCreateProjectOutfit ? { onCreateOutfit: onCreateProjectOutfit } : {})}
      />

      {renameTarget ? (
        <RenameProjectDialog
          project={renameTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onRenamed={(updated) => {
            session.acceptCurrent(updated);
            setAnnouncement(`Project renamed to ${updated.project.title}.`);
            closeDialog();
          }}
        />
      ) : null}
      {duplicateTarget ? (
        <DuplicateProjectDialog
          project={duplicateTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDuplicated={(created) => {
            closeDialog();
            // Opened on the step the copy is actually ready for, using the same derivation the
            // workspace itself uses to decide where a Project stands.
            void navigate(
              projectWorkspacePath(created.project.id, stepForSnapshot(created.revision.snapshot)),
            );
          }}
        />
      ) : null}
      {campaignDialog ? (
        <ProjectCampaignDialog
          project={project}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(updated, location) => {
            session.acceptCurrent(updated);
            setAnnouncement(`${updated.project.title} moved to ${location}.`);
            closeDialog();
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <ProjectLifecycleDialog
          action={lifecycleDialog.action}
          project={lifecycleDialog.project}
          {...(lifecycleDialog.action === 'archive' && archiveBlockedReason !== undefined
            ? { archiveBlockedReason }
            : {})}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(updated, action) => {
            session.acceptCurrent(updated);
            setAnnouncement(
              `${updated.project.title} ${action === 'archive' ? 'archived' : 'restored'}.`,
            );
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteProjectDialog
          project={deleteTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDeleted={() =>
            void navigate(
              project.campaignId === null ? APP_PATHS.projects : campaignPath(project.campaignId),
              { replace: true },
            )
          }
        />
      ) : null}
    </div>
  );
};
