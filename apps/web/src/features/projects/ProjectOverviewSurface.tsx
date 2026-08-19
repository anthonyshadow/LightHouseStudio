import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { formatDateTime, type CreativeAssetStore } from '@studio/domain';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS, campaignPath, projectWorkspacePath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { AppIcon, Button } from '../../ui';
import type { useCampaignDetail } from '../campaigns/useCampaignsController';
import { ProjectAssetsSection } from './ProjectAssetsSection';
import {
  DeleteProjectDialog,
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
import { ProjectWorkflowProgress } from './ProjectWorkflowProgress';
import type { useProjectSession } from './useProjectSession';
import type { ProjectSourceActivity, ProjectSourceRuntime } from './useProjectSourceController';

const projectWorkflowLabel = (
  phase: ProjectCurrentResponse['revision']['snapshot']['workflowPhase'],
): string => phase.charAt(0).toUpperCase() + phase.slice(1);

export interface ProjectLifecycleDialogTarget {
  readonly action: LifecycleAction;
  readonly project: ProjectContract;
}

interface ProjectOverviewSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ReturnType<typeof useProjectSession>;
  readonly campaign: ReturnType<typeof useCampaignDetail>;
  readonly campaignName: string | null;
  readonly archived: boolean;
  readonly overviewHasSource: boolean;
  readonly announcement: string | null;
  readonly setAnnouncement: Dispatch<SetStateAction<string | null>>;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly dialogReturnRef: RefObject<HTMLElement | null>;
  readonly renameTarget: ProjectContract | null;
  readonly setRenameTarget: Dispatch<SetStateAction<ProjectContract | null>>;
  readonly lifecycleDialog: ProjectLifecycleDialogTarget | null;
  readonly setLifecycleDialog: Dispatch<SetStateAction<ProjectLifecycleDialogTarget | null>>;
  readonly deleteTarget: ProjectContract | null;
  readonly setDeleteTarget: Dispatch<SetStateAction<ProjectContract | null>>;
  readonly campaignDialog: boolean;
  readonly setCampaignDialog: Dispatch<SetStateAction<boolean>>;
  readonly closeDialog: () => void;
  readonly archiveBlockedReason: string | undefined;
  readonly acceptOverviewSource: (next: ProjectCurrentResponse) => void;
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
  campaign,
  campaignName,
  archived,
  overviewHasSource,
  announcement,
  setAnnouncement,
  headingRef,
  dialogReturnRef,
  renameTarget,
  setRenameTarget,
  lifecycleDialog,
  setLifecycleDialog,
  deleteTarget,
  setDeleteTarget,
  campaignDialog,
  setCampaignDialog,
  closeDialog,
  archiveBlockedReason,
  acceptOverviewSource,
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
            <Button
              data-detail-action="move"
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setCampaignDialog(true);
              }}
            >
              Move Project
            </Button>
            {!archived ? (
              <Button
                data-detail-action="rename"
                onClick={(event) => {
                  dialogReturnRef.current = event.currentTarget;
                  setRenameTarget(project);
                }}
              >
                Rename
              </Button>
            ) : null}
            <Button
              variant={archived ? 'secondary' : 'danger'}
              data-detail-action="archive"
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setLifecycleDialog({ action: archived ? 'restore' : 'archive', project });
              }}
            >
              {archived ? 'Restore' : 'Archive'}
            </Button>
            {archived ? (
              <Button
                variant="danger"
                data-detail-action="delete"
                onClick={(event) => {
                  dialogReturnRef.current = event.currentTarget;
                  setDeleteTarget(project);
                }}
              >
                Delete Project
              </Button>
            ) : null}
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
