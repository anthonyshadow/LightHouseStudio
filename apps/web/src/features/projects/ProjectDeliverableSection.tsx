import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse, ProjectOutputHistoryItem } from '@studio/contracts';
import { formatDateTime, projectExportAspectOf } from '@studio/domain';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { savedVideoThumbnailUrl } from '../../adapters/api-client/savedVideosApi';
import { projectWorkspacePath, savedVideoLibraryPath } from '../../app/paths';
import { AppIcon, Button, LinkButton, StatusNotice } from '../../ui';
import { LoadingPlaceholder } from '../../ui/primitives/LoadingPlaceholder';
import { Skeleton } from '../../ui/primitives/Skeleton';
import { exportPlacementLabel } from '../export-placements';
import { projectDeliverableStyles } from './ProjectOverviewSurface.styles';
import { getProjectOutputs, projectOutputContentUrl } from './projectsApi';
import { projectQueryKeys } from './useProjectsController';
import { WorkPosterTile } from './WorkPosterTile';

/**
 * What this Project has produced, on the page a returning operator lands on.
 *
 * It reads the output history rather than the snapshot's `lastSuccessfulOutput`, which looks like
 * the obvious source and is not: that reference names the Version produced from the *exact*
 * material state it sits beside, so the domain clears it the moment anything material changes
 * (`packages/domain/src/projects/rules.ts`). A returning operator has almost always changed
 * something since, and answering them "nothing saved yet" would deny work they did. The history is
 * the durable record, and its newest row is the deliverable — with `isCurrentForProject` saying
 * whether the Project is still working from it.
 */
const ProjectDeliverableCard = ({
  projectId,
  item,
  savedTogether,
}: {
  readonly projectId: string;
  readonly item: ProjectOutputHistoryItem;
  /**
   * Every Version the same save produced, in the order they were written, when it produced more
   * than one. The card shows one poster — they are one save of one cut — and one line per
   * placement.
   */
  readonly savedTogether: readonly ProjectOutputHistoryItem[];
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const missing = item.savedVideo.libraryStatus === 'missing';
  const removed = item.savedVideo.libraryStatus === 'removed';

  return (
    <div data-project-deliverable-body="">
      <div data-project-deliverable-poster="">
        <WorkPosterTile
          icon={<AppIcon name="video" />}
          thumbnailUrl={
            item.thumbnailAvailable
              ? savedVideoThumbnailUrl(item.savedVideo.id, item.version.id)
              : null
          }
          emptyCaption="No preview yet"
          failedCaption="Preview didn’t load"
          label={item.savedVideo.title}
          kindNoun="Video"
          unavailable={missing}
          playBadge
        />
      </div>
      <div data-project-deliverable-copy="">
        <h3>{item.savedVideo.title}</h3>
        <p data-project-deliverable-meta="">
          <span>Version {item.version.ordinal}</span>
          <span data-project-deliverable-placement="">
            {exportPlacementLabel(projectExportAspectOf(item.version.exportSpecification))}
          </span>
          <span>
            {item.version.width}×{item.version.height}
          </span>
          <span>
            <time dateTime={item.version.createdAt}>{formatDateTime(item.version.createdAt)}</time>
          </span>
        </p>
        {missing ? (
          <StatusNotice role="alert" tone="warning">
            This video’s details are still here, but its file is unavailable.
          </StatusNotice>
        ) : null}
        {removed ? (
          <StatusNotice role="status" tone="neutral">
            Removed from your Videos. This Project still points at it, so it is still here.
          </StatusNotice>
        ) : null}
        {item.isCurrentForProject ? null : (
          <p css={{ margin: 0 }} data-project-deliverable-superseded="">
            You have changed this Project since. Save again to add the next Version.
          </p>
        )}
        {savedTogether.length > 1 ? (
          <div
            css={{ display: 'grid', gap: theme.space.xs }}
            data-project-deliverable-placements=""
          >
            <h4 css={{ margin: 0, fontSize: theme.fontSizes.metadata }}>Saved together</h4>
            <ul
              aria-label="Placements saved together"
              css={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gap: theme.space.xs,
              }}
            >
              {savedTogether.map((member) => (
                <li
                  key={member.version.id}
                  css={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: theme.space.sm,
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSizes.metadata,
                  }}
                >
                  <span>
                    {exportPlacementLabel(
                      projectExportAspectOf(member.version.exportSpecification),
                    )}{' '}
                    · Version {member.version.ordinal} · {member.version.width}×
                    {member.version.height}
                  </span>
                  {missing ? null : (
                    <LinkButton
                      size="small"
                      href={projectOutputContentUrl(projectId, member.version.id, true)}
                      download={member.version.filename}
                      aria-label={`Download ${member.savedVideo.title}, Version ${member.version.ordinal}`}
                    >
                      Download
                    </LinkButton>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div data-project-deliverable-actions="">
          {missing || savedTogether.length > 1 ? null : (
            <LinkButton
              variant="primary"
              href={projectOutputContentUrl(projectId, item.version.id, true)}
              download={item.version.filename}
              aria-label={`Download ${item.savedVideo.title}, Version ${item.version.ordinal}`}
            >
              Download
            </LinkButton>
          )}
          {removed ? null : (
            <Button
              variant="secondary"
              onClick={() => void navigate(savedVideoLibraryPath(item.savedVideo.id))}
            >
              View in Assets
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * The Project's finished work, stated where a returning operator lands.
 *
 * A Project with nothing saved says so and points at the step that would change that — but only
 * where saving is a thing this Project can do next. With no original video the overview is already
 * asking for one, and an archived Project cannot save at all; in both cases naming an empty Save
 * step would be a dead end rather than a next step, so the section stays away entirely. Either can
 * still *have* saved something earlier, which is why the question is asked before it is answered.
 */
export const ProjectDeliverableSection = ({
  current,
  archived,
}: {
  readonly current: ProjectCurrentResponse;
  readonly archived: boolean;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const projectId = current.project.id;
  const canSaveNext = !archived && current.revision.snapshot.sourceAssetId !== null;
  // One save can write several Versions — one per placement — and the card shows all of them, so
  // it asks for enough rows to hold the largest set a save can produce rather than only the newest.
  const outputs = useQuery({
    queryKey: projectQueryKeys.latestOutput(projectId),
    queryFn: ({ signal }) => getProjectOutputs({ projectId, pageSize: 5, signal }),
  });
  const rows = outputs.data?.outputs ?? [];
  const latest = rows[0];
  // The rows one save produced together, in write order. A set is written at consecutive ordinals
  // and the newest row is its primary, so the members are the neighbours carrying its id — and a
  // save that produced a single placement carries one too, which is a set of one and shows as the
  // single output it has always been.
  const savedTogether =
    latest === undefined || latest.version.variantSetId === null
      ? []
      : rows
          .filter((row) => row.version.variantSetId === latest.version.variantSetId)
          .sort((left, right) => left.version.ordinal - right.version.ordinal);

  const body = () => {
    if (outputs.isPending) {
      return (
        <LoadingPlaceholder label="Loading this Project’s saved output…" count={1}>
          {() => (
            <span css={{ display: 'grid', gap: theme.space.xs }}>
              <Skeleton width="42%" height="1rem" />
              <Skeleton width="76%" />
            </span>
          )}
        </LoadingPlaceholder>
      );
    }
    if (outputs.isError) {
      return (
        <StatusNotice role="alert" tone="danger" title="Saved output could not be loaded">
          <p>What this Project has saved could not be read just now.</p>
          <Button size="small" busy={outputs.isFetching} onClick={() => void outputs.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      );
    }
    return latest === undefined ? (
      // Deliberately outside the two-column body: with no poster beside it, this copy would be
      // reading itself into the narrow column the poster would have occupied.
      <div data-project-deliverable-copy="">
        <h3>No saved output yet</h3>
        <p css={{ margin: 0, color: theme.colors.textMuted }}>
          Finish the cut you want, then save it to your Videos.
        </p>
        <div data-project-deliverable-actions="">
          <Button
            variant="secondary"
            onClick={() => void navigate(projectWorkspacePath(projectId, 'save'))}
          >
            Go to Save
          </Button>
        </div>
      </div>
    ) : (
      <ProjectDeliverableCard projectId={projectId} item={latest} savedTogether={savedTogether} />
    );
  };

  // Nothing saved and nowhere to send anyone is not a section, it is noise.
  if (!canSaveNext && (outputs.isPending || outputs.data?.outputs.length === 0)) return null;

  return (
    <section
      css={projectDeliverableStyles(theme)}
      aria-labelledby="project-deliverable-heading"
      data-project-deliverable=""
    >
      <header>
        <h2 id="project-deliverable-heading">Saved output</h2>
        <p>
          {savedTogether.length > 1
            ? 'What this Project last saved, in every placement that save produced. Saving again adds the next one; this keeps showing the most recent.'
            : 'The video this Project has saved. Saving again adds the next one; this keeps showing the most recent.'}
        </p>
      </header>
      {body()}
    </section>
  );
};
