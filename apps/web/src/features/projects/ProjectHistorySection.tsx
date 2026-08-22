import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type {
  AdoptProjectWorkingMediaRequest,
  ProjectCurrentResponse,
  ProjectOutputHistoryItem,
} from '@studio/contracts';
import { formatDateTime } from '@studio/domain';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { exportSpecificationSummary } from '../export-placements';
import { getProjectProcessingHistory } from './projectProcessingApi';
import { projectProcessingCapabilityLabel } from './projectProcessingPresentation';
import { ProjectVideoPreviewPlayer } from './ProjectVideoPreviewPlayer';
import {
  getProjectHistory,
  getProjectOutputs,
  projectOutputContentUrl,
  ProjectApiConflictError,
  reuseProjectWorkingMedia,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';

const revisionSourceLabel: Record<ProjectCurrentResponse['revision']['source'], string> = {
  create: 'Project created',
  'user-edit': 'Project change',
  'job-result': 'Processing result used',
  'output-save': 'Saved Version made current',
  restore: 'Project restored',
  migration: 'Project migrated',
};

const historyListStyles = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '0.65rem',
} as const;

const downloadLinkStyles = (theme: Theme): CSSObject => ({
  minWidth: '2.75rem',
  minHeight: '2.75rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 0.8rem',
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.surfaceStrong,
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  '&:hover': { borderColor: theme.colors.accent },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export const ProjectHistorySection = ({
  current,
  session,
  archived,
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const projectId = current.project.id;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectOutputHistoryItem | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const operation = useStableOperationKey();

  const revisions = useInfiniteQuery({
    queryKey: ['projects', 'history', projectId, 'revisions'],
    queryFn: ({ pageParam, signal }) =>
      getProjectHistory({
        projectId,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const outputs = useInfiniteQuery({
    queryKey: ['projects', 'history', projectId, 'outputs'],
    queryFn: ({ pageParam, signal }) =>
      getProjectOutputs({
        projectId,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const processing = useInfiniteQuery({
    queryKey: ['projects', 'history', projectId, 'processing'],
    queryFn: ({ pageParam, signal }) =>
      getProjectProcessingHistory(projectId, pageParam ?? undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

  const adoptMedia = useCallback(
    async (media: AdoptProjectWorkingMediaRequest['media'], label: string, itemKey: string) => {
      setError(null);
      setMessage(null);
      if (!(await session.flush())) {
        setError('Save or discard your pending Project changes before changing the current cut.');
        return;
      }
      const latest = session.getCurrent();
      if (latest === null) return;
      const signature = JSON.stringify({
        projectId,
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.revision.revisionNumber,
        media,
      });
      const operationKey = operation.keyFor(signature);
      setBusyItemKey(itemKey);
      try {
        const response = await reuseProjectWorkingMedia({
          projectId,
          operationKey,
          expectedVersion: latest.project.version,
          expectedRevisionNumber: latest.revision.revisionNumber,
          media,
          localEdit: null,
        });
        if (!response.isCurrent) {
          throw new ProjectApiConflictError('The Project advanced after this adoption.', {
            kind: 'revision',
            projectId,
            expectedRevisionNumber: response.revision.revisionNumber,
            actualRevisionNumber: response.project.currentRevisionNumber,
          });
        }
        operation.reset();
        session.acceptCurrent({ project: response.project, revision: response.revision });
        setMessage(
          `${label} is now the current cut. Your original video and the video’s current version were not changed.`,
        );
        await queryClient.invalidateQueries({ queryKey: ['projects', 'history', projectId] });
      } catch (caught) {
        setError(
          caught instanceof ProjectApiConflictError
            ? 'The Project changed before this older result could be used. Refresh and try again.'
            : 'This older result could not be used in the Project.',
        );
      } finally {
        setBusyItemKey(null);
      }
    },
    [operation, projectId, queryClient, session],
  );

  const revisionItems = revisions.data?.pages.flatMap((page) => page.revisions) ?? [];
  const outputItems = outputs.data?.pages.flatMap((page) => page.outputs) ?? [];
  const processingItems = processing.data?.pages.flatMap((page) => page.attempts) ?? [];
  const panelStyles = {
    display: 'grid',
    gap: theme.space.lg,
    padding: theme.space.lg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.large,
    background: theme.colors.surfaceSoft,
  } as const;
  const groupStyles = {
    display: 'grid',
    gap: theme.space.sm,
    minWidth: 0,
  } as const;
  const itemStyles = {
    display: 'grid',
    gap: theme.space.xs,
    padding: theme.space.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.canvasRaised,
  } as const;

  return (
    <section aria-labelledby="project-history-heading" css={panelStyles}>
      <header>
        <h3 id="project-history-heading">History and versions</h3>
        <p>
          Every change, AI run and saved version for this Project. Preview and Download fetch the
          exact video.
        </p>
      </header>
      {message ? (
        <StatusNotice role="status" tone="success">
          {message}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice role="alert" tone="danger">
          {error}
        </StatusNotice>
      ) : null}

      <div css={groupStyles}>
        <h4>Saved video Versions</h4>
        {outputs.isPending ? <p role="status">Loading saved video Versions…</p> : null}
        {outputs.isError ? (
          <StatusNotice role="alert" tone="danger">
            Saved video Versions could not be loaded.{' '}
            <Button size="small" onClick={() => void outputs.refetch()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}
        {!outputs.isPending && !outputs.isError && outputItems.length === 0 ? (
          <p>This Project has not saved any versions yet.</p>
        ) : null}
        <ul css={historyListStyles} aria-label="Saved video Version history">
          {outputItems.map((item) => {
            const media = {
              kind: 'saved-video-version' as const,
              savedVideoId: item.savedVideo.id,
              videoVersionId: item.version.id,
            };
            return (
              <li key={item.version.id} css={itemStyles}>
                <strong>
                  {item.savedVideo.title} · Version {item.version.ordinal}
                  {item.savedVideo.currentVersionId === item.version.id
                    ? ' · Current in Saved Videos'
                    : ''}
                </strong>
                <span>
                  {item.version.origin} · {item.version.width}×{item.version.height} ·{' '}
                  <time dateTime={item.version.createdAt}>
                    {formatDateTime(item.version.createdAt)}
                  </time>
                </span>
                <span>
                  Saved at change {item.output.producingRevisionNumber}
                  {item.referenceRevision
                    ? `; made current at change ${item.referenceRevision.revisionNumber}`
                    : ''}
                  {item.isCurrentForProject ? ' · Current in this Project' : ''}
                </span>
                {item.savedVideo.libraryStatus === 'removed' ? (
                  <StatusNotice role="status" tone="neutral">
                    Removed from your videos. This version is still here because Project history
                    keeps it, and its file was not erased.
                  </StatusNotice>
                ) : null}
                {item.savedVideo.libraryStatus === 'missing' ? (
                  <StatusNotice role="alert" tone="warning">
                    This version’s details are still here, but its video file is unavailable.
                  </StatusNotice>
                ) : null}
                <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
                  <Button
                    size="small"
                    disabled={item.savedVideo.libraryStatus === 'missing'}
                    onClick={(event) => {
                      previewTriggerRef.current = event.currentTarget;
                      setPreview(item);
                    }}
                  >
                    Preview Version {item.version.ordinal}
                  </Button>
                  <Button
                    size="small"
                    busy={busyItemKey === item.version.id}
                    disabled={
                      archived ||
                      item.savedVideo.libraryStatus === 'missing' ||
                      busyItemKey !== null
                    }
                    onClick={() =>
                      void adoptMedia(media, `Version ${item.version.ordinal}`, item.version.id)
                    }
                  >
                    Use in Project
                  </Button>
                  {item.savedVideo.libraryStatus === 'missing' ? null : (
                    <a
                      href={projectOutputContentUrl(projectId, item.version.id, true)}
                      download={item.version.filename}
                      aria-label={`Download ${item.savedVideo.title}, Version ${item.version.ordinal}`}
                      css={downloadLinkStyles(theme)}
                    >
                      Download
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {outputs.hasNextPage ? (
          <Button
            size="small"
            busy={outputs.isFetchingNextPage}
            onClick={() => void outputs.fetchNextPage()}
          >
            Load more Versions
          </Button>
        ) : null}
      </div>

      <div css={groupStyles}>
        <h4>Processing attempts and results</h4>
        {processing.isPending ? <p role="status">Loading processing history…</p> : null}
        {processing.isError ? (
          <StatusNotice role="alert" tone="warning">
            Processing history is unavailable.{' '}
            <Button size="small" onClick={() => void processing.refetch()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}
        {!processing.isPending && !processing.isError && processingItems.length === 0 ? (
          <p>No processing attempts have been recorded.</p>
        ) : null}
        <ul css={historyListStyles} aria-label="Processing attempt history">
          {processingItems.map((attempt) => (
            <li key={attempt.operationId} css={itemStyles}>
              <strong>
                {projectProcessingCapabilityLabel(attempt.capability)} · Attempt{' '}
                {attempt.attemptNumber}
              </strong>
              <span>
                Started from change {attempt.initiatingRevisionNumber} · {attempt.phase} ·{' '}
                <time dateTime={attempt.createdAt}>{formatDateTime(attempt.createdAt)}</time>
              </span>
              {attempt.result?.historical ? (
                <>
                  <span>
                    Kept in this Project as an older result. It was not applied automatically.
                  </span>
                  <Button
                    size="small"
                    busy={busyItemKey === attempt.result.assetId}
                    disabled={archived || busyItemKey !== null}
                    onClick={() =>
                      void adoptMedia(
                        { kind: 'asset', assetId: attempt.result!.assetId },
                        `${projectProcessingCapabilityLabel(attempt.capability)} retained result`,
                        attempt.result!.assetId,
                      )
                    }
                  >
                    Use in Project
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {processing.hasNextPage ? (
          <Button
            size="small"
            busy={processing.isFetchingNextPage}
            onClick={() => void processing.fetchNextPage()}
          >
            Load more processing attempts
          </Button>
        ) : null}
      </div>

      <div css={groupStyles}>
        <h4>Project changes</h4>
        {revisions.isPending ? <p role="status">Loading Project changes…</p> : null}
        {revisions.isError ? (
          <StatusNotice role="alert" tone="danger">
            Project changes could not be loaded.{' '}
            <Button size="small" onClick={() => void revisions.refetch()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}
        <ul css={historyListStyles} aria-label="Project change history">
          {revisionItems.map((revision) => (
            <li key={revision.revisionId} css={itemStyles}>
              <strong>{revisionSourceLabel[revision.source]}</strong>
              <span>
                Change {revision.revisionNumber} · {revision.workflowPhase} · {revision.authorKind}{' '}
                · <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
              </span>
              {revision.outputReference ? (
                <span>This change points at one saved version.</span>
              ) : null}
              {revision.exportSpecification ? (
                <span>Placement: {exportSpecificationSummary(revision.exportSpecification)}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {revisions.hasNextPage ? (
          <Button
            size="small"
            busy={revisions.isFetchingNextPage}
            onClick={() => void revisions.fetchNextPage()}
          >
            Load more Project changes
          </Button>
        ) : null}
      </div>

      <OverlayPanel
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={
          preview
            ? `${preview.savedVideo.title} · Version ${preview.version.ordinal}`
            : 'Version preview'
        }
        description="Previewing does not change the current cut or the video’s current version."
        placement="fullscreen"
        size="wide"
        centered
        returnFocusRef={previewTriggerRef}
        footer={
          preview ? (
            <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
              <a
                href={projectOutputContentUrl(projectId, preview.version.id, true)}
                download={preview.version.filename}
                aria-label={`Download ${preview.savedVideo.title}, Version ${preview.version.ordinal}`}
                css={downloadLinkStyles(theme)}
              >
                Download
              </a>
              <Button
                variant="primary"
                busy={busyItemKey === preview.version.id}
                disabled={archived || busyItemKey !== null}
                onClick={() =>
                  void adoptMedia(
                    {
                      kind: 'saved-video-version',
                      savedVideoId: preview.savedVideo.id,
                      videoVersionId: preview.version.id,
                    },
                    `Version ${preview.version.ordinal}`,
                    preview.version.id,
                  )
                }
              >
                Use in Project
              </Button>
            </div>
          ) : null
        }
      >
        {preview ? (
          <div
            css={{
              height: '100%',
              minWidth: 0,
              minHeight: 0,
              display: 'grid',
              gridTemplateRows: 'minmax(0, 1fr) auto',
              gap: theme.space.md,
            }}
          >
            <ProjectVideoPreviewPlayer
              src={projectOutputContentUrl(projectId, preview.version.id)}
              title={`${preview.savedVideo.title}, Version ${preview.version.ordinal}`}
            />
            <p css={{ margin: 0 }}>
              Version {preview.version.ordinal} · {preview.version.origin} · {preview.version.width}
              ×{preview.version.height} · {formatDateTime(preview.version.createdAt)}
              {preview.savedVideo.currentVersionId === preview.version.id
                ? ' · Current in Saved Videos'
                : ' · Older Version'}
            </p>
          </div>
        ) : null}
      </OverlayPanel>
    </section>
  );
};
