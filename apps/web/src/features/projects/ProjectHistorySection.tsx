import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type {
  AdoptProjectWorkingMediaRequest,
  ProjectCurrentResponse,
  ProjectOutputHistoryItem,
} from '@studio/contracts';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { getProjectProcessingHistory } from './projectProcessingApi';
import { projectProcessingCapabilityLabel } from './projectProcessingPresentation';
import {
  getProjectHistory,
  getProjectOutputs,
  projectOutputContentUrl,
  ProjectApiConflictError,
  reuseProjectWorkingMedia,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';

const formatTimestamp = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const revisionSourceLabel: Record<ProjectCurrentResponse['revision']['source'], string> = {
  create: 'Project created',
  'user-edit': 'Project change',
  'job-result': 'Processing result adopted',
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
  const [busySignature, setBusySignature] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProjectOutputHistoryItem | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<HTMLVideoElement | null>(null);
  const operationRef = useRef<{ readonly signature: string; readonly key: string } | null>(null);

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

  useEffect(() => {
    if (preview === null) return;
    const player = playerRef.current;
    return () => {
      player?.pause();
      player?.removeAttribute('src');
    };
  }, [preview]);

  const adoptMedia = useCallback(
    async (media: AdoptProjectWorkingMediaRequest['media'], label: string) => {
      setError(null);
      setMessage(null);
      if (!(await session.flush())) {
        setError('Resolve the preserved Project proposal before changing working media.');
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
      const operationKey =
        operationRef.current?.signature === signature
          ? operationRef.current.key
          : crypto.randomUUID();
      operationRef.current = { signature, key: operationKey };
      setBusySignature(signature);
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
        operationRef.current = null;
        session.acceptCurrent({ project: response.project, revision: response.revision });
        setMessage(
          `${label} is now working media. The immutable original and Saved Video current pointer were not changed.`,
        );
        await queryClient.invalidateQueries({ queryKey: ['projects', 'history', projectId] });
      } catch (caught) {
        setError(
          caught instanceof ProjectApiConflictError
            ? 'The Project changed before this historical media could be adopted. Refresh and try again.'
            : 'This historical media could not be validated for current Project use.',
        );
      } finally {
        setBusySignature(null);
      }
    },
    [projectId, queryClient, session],
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
        <h3 id="project-history-heading">Project history and Versions</h3>
        <p>
          Changes, processing attempts, and immutable Saved Video Versions remain distinct. Pages
          contain metadata only; preview and Download fetch one exact retained result.
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
        {outputs.isPending ? <p role="status">Loading Project Versions…</p> : null}
        {outputs.isError ? (
          <StatusNotice role="alert" tone="danger">
            Project Versions could not be loaded.{' '}
            <Button size="small" onClick={() => void outputs.refetch()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}
        {!outputs.isPending && !outputs.isError && outputItems.length === 0 ? (
          <p>No Saved Video Versions have been produced by this Project yet.</p>
        ) : null}
        <ul css={historyListStyles} aria-label="Saved video Version history">
          {outputItems.map((item) => {
            const media = {
              kind: 'saved-video-version' as const,
              savedVideoId: item.savedVideo.id,
              videoVersionId: item.version.id,
            };
            const signature = JSON.stringify({
              projectId,
              expectedVersion: current.project.version,
              expectedRevisionNumber: current.revision.revisionNumber,
              media,
            });
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
                    {formatTimestamp(item.version.createdAt)}
                  </time>
                </span>
                <span>
                  Produced by Project revision {item.output.producingRevisionNumber}
                  {item.referenceRevision
                    ? `; made current by revision ${item.referenceRevision.revisionNumber}`
                    : ''}
                  {item.isCurrentForProject ? ' · Current Project output' : ''}
                </span>
                {item.savedVideo.libraryStatus === 'removed' ? (
                  <StatusNotice role="status" tone="neutral">
                    Removed from Saved Videos. This exact Version remains available only because
                    Project history retains it; no physical erasure is claimed.
                  </StatusNotice>
                ) : null}
                {item.savedVideo.libraryStatus === 'missing' ? (
                  <StatusNotice role="alert" tone="warning">
                    This Version metadata remains, but its media is unavailable.
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
                    busy={busySignature === signature}
                    disabled={
                      archived ||
                      item.savedVideo.libraryStatus === 'missing' ||
                      busySignature !== null
                    }
                    onClick={() => void adoptMedia(media, `Version ${item.version.ordinal}`)}
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
                Revision {attempt.initiatingRevisionNumber} · {attempt.phase} ·{' '}
                <time dateTime={attempt.createdAt}>{formatTimestamp(attempt.createdAt)}</time>
              </span>
              {attempt.result?.historical ? (
                <>
                  <span>
                    Retained in this Project as a valid stale result. It was not promoted
                    automatically.
                  </span>
                  <Button
                    size="small"
                    disabled={archived || busySignature !== null}
                    onClick={() =>
                      void adoptMedia(
                        { kind: 'asset', assetId: attempt.result!.assetId },
                        `${projectProcessingCapabilityLabel(attempt.capability)} retained result`,
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
              <strong>
                {revisionSourceLabel[revision.source]} · Revision {revision.revisionNumber}
              </strong>
              <span>
                {revision.workflowPhase} · {revision.authorKind} ·{' '}
                <time dateTime={revision.createdAt}>{formatTimestamp(revision.createdAt)}</time>
              </span>
              {revision.outputReference ? (
                <span>This revision references one exact retained output Version.</span>
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
        description="Previewing this exact immutable Version does not change either current pointer."
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
                disabled={archived || busySignature !== null}
                onClick={() =>
                  void adoptMedia(
                    {
                      kind: 'saved-video-version',
                      savedVideoId: preview.savedVideo.id,
                      videoVersionId: preview.version.id,
                    },
                    `Version ${preview.version.ordinal}`,
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
          <div css={{ display: 'grid', gap: theme.space.md }}>
            {/* Saved local videos may not include a captions track. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={playerRef}
              src={projectOutputContentUrl(projectId, preview.version.id)}
              controls
              playsInline
              preload="metadata"
              aria-label={`Preview ${preview.savedVideo.title}, Version ${preview.version.ordinal}`}
              css={{ width: '100%', maxHeight: '65vh', background: '#000' }}
            />
            <p>
              Version {preview.version.ordinal} · {preview.version.origin} · {preview.version.width}
              ×{preview.version.height} · {formatTimestamp(preview.version.createdAt)}
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
