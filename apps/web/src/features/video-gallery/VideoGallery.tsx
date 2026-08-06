import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { SavedVideoSummary } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteSavedVideo,
  downloadSavedVideoUrl,
  listSavedVideos,
  renameSavedVideo,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { Button, StatusNotice } from '../../ui';

const gridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))',
  gap: theme.space.md,
  paddingBlockEnd: theme.space.lg,
});

const cardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  boxShadow: theme.shadows.soft,
  '& h3, & p': { margin: 0 },
  '& h3': { overflowWrap: 'anywhere' },
});

const posterStyles = (theme: Theme): CSSObject => ({
  aspectRatio: '16 / 9',
  display: 'grid',
  placeItems: 'center',
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: `linear-gradient(135deg, ${theme.colors.surfaceStrong}, ${theme.colors.canvas})`,
  fontSize: '2rem',
  overflow: 'hidden',
  '& img': { width: '100%', height: '100%', objectFit: 'cover' },
});

const actionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& > *': { flex: '1 1 6.5rem', minHeight: '2.75rem' },
});

const duration = (milliseconds: number): string => {
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export const VideoGallery = ({
  onUse,
}: {
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
}) => {
  const theme = useTheme();
  const [videos, setVideos] = useState<readonly SavedVideoSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (cursor?: string) => {
    request.current?.abort('replaced');
    const controller = new AbortController();
    request.current = controller;
    if (!cursor) setStatus('loading');
    try {
      const page = await listSavedVideos(cursor, controller.signal);
      setVideos((current) => (cursor ? [...current, ...page.videos] : page.videos));
      setNextCursor(page.nextCursor);
      setStatus('ready');
      setMessage(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Saved videos could not be loaded.');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      request.current?.abort('unmount');
    };
  }, [load]);

  const rename = async (video: SavedVideoSummary) => {
    const title = window.prompt('Rename saved video', video.title)?.trim();
    if (!title || title === video.title) return;
    setBusyId(video.id);
    try {
      const updated = await renameSavedVideo(video.id, title);
      setVideos((current) => current.map((item) => (item.id === video.id ? updated : item)));
      setMessage('Video renamed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be renamed.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (video: SavedVideoSummary) => {
    if (!window.confirm(`Delete “${video.title}” from Saved Videos?`)) return;
    setBusyId(video.id);
    try {
      await deleteSavedVideo(video.id);
      setVideos((current) => current.filter((item) => item.id !== video.id));
      setMessage('Video removed. Its local media remains retained until Phase 2.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  if (status === 'loading') {
    return <p role="status">Loading saved videos…</p>;
  }
  if (status === 'error') {
    return (
      <StatusNotice tone="danger" role="alert">
        {message} <Button onClick={() => void load()}>Retry</Button>
      </StatusNotice>
    );
  }
  if (videos.length === 0) {
    return (
      <div>
        <h2>No saved videos yet</h2>
        <p>Record or upload a video, then choose Save Video. Downloading is optional.</p>
      </div>
    );
  }

  return (
    <div>
      {message ? <StatusNotice role="status">{message}</StatusNotice> : null}
      <div css={gridStyles(theme)} aria-label="Saved videos">
        {videos.map((video) => {
          const version = video.currentVersion;
          const busy = busyId === video.id;
          return (
            <article key={video.id} css={cardStyles(theme)} aria-busy={busy || undefined}>
              <div css={posterStyles(theme)}>
                {video.thumbnailAvailable && !brokenThumbnails.has(video.id) ? (
                  <img
                    src={savedVideoThumbnailUrl(video.id)}
                    alt={`Thumbnail for ${video.title}`}
                    loading="lazy"
                    onError={() => setBrokenThumbnails((current) => new Set(current).add(video.id))}
                  />
                ) : (
                  <span
                    aria-label={
                      video.thumbnailAvailable
                        ? 'Thumbnail could not load'
                        : 'Thumbnail unavailable'
                    }
                  >
                    ▶
                  </span>
                )}
              </div>
              <div>
                <h3>{video.title}</h3>
                <p>
                  {duration(version.durationMs)} · {version.width}×{version.height} ·{' '}
                  <time dateTime={video.createdAt}>
                    {new Date(video.createdAt).toLocaleDateString()}
                  </time>
                </p>
                <p>
                  {video.status === 'ready'
                    ? `${video.versionCount} version${video.versionCount === 1 ? '' : 's'} · ${version.origin}`
                    : video.status}
                </p>
              </div>
              <div css={actionsStyles(theme)}>
                <Button
                  variant="primary"
                  disabled={busy || video.status !== 'ready'}
                  onClick={() => void onUse(video, 'play')}
                >
                  Load in Studio
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || video.status !== 'ready'}
                  onClick={() => void onUse(video, 'edit')}
                >
                  Edit
                </Button>
                <a href={downloadSavedVideoUrl(video.id)} download={version.filename}>
                  Download
                </a>
                <Button variant="secondary" disabled={busy} onClick={() => void rename(video)}>
                  Rename
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => void remove(video)}>
                  Delete
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {nextCursor ? (
        <Button variant="secondary" onClick={() => void load(nextCursor)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
};
