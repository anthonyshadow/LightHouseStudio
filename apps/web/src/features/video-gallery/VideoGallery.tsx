import { useTheme } from '@emotion/react';
import type { SavedVideoSummary } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteSavedVideo,
  downloadSavedVideoUrl,
  listSavedVideos,
  renameSavedVideo,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import {
  actionMenuPopoverStyles,
  actionMenuStyles,
  actionsStyles,
  cardBodyStyles,
  cardCopyStyles,
  cardStyles,
  chipRowStyles,
  chipStyles,
  durationBadgeStyles,
  galleryStyles,
  gallerySummaryStyles,
  gridStyles,
  paginationStyles,
  playBadgeStyles,
  posterButtonStyles,
  posterStyles,
  previewContentStyles,
  previewFooterStyles,
  previewMetadataStyles,
  previewPlayerStyles,
  thumbnailPlaceholderStyles,
  thumbnailStyles,
} from './VideoGallery.styles';

const PlayIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
  </svg>
);

const VideoPlaceholderIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m10 9 5 3-5 3Z" />
  </svg>
);

const MoreIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

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
  const [previewVideo, setPreviewVideo] = useState<SavedVideoSummary | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [brokenThumbnails, setBrokenThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const request = useRef<AbortController | null>(null);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewPlayerRef = useRef<HTMLVideoElement | null>(null);

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

  useEffect(() => {
    if (!previewVideo) return;
    const player = previewPlayerRef.current;
    return () => {
      player?.pause();
      player?.removeAttribute('src');
    };
  }, [previewVideo]);

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

  const handleUseVideo = async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
    setBusyId(video.id);
    try {
      await onUse(video, intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be loaded.');
    } finally {
      setBusyId(null);
    }
  };

  const openPreview = (video: SavedVideoSummary, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setPreviewError(false);
    setPreviewVideo(video);
  };

  const closePreview = () => {
    const player = previewPlayerRef.current;
    player?.pause();
    player?.removeAttribute('src');
    try {
      player?.load();
    } catch {
      // Some test environments do not implement media loading.
    }
    setPreviewVideo(null);
    setPreviewError(false);
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
    <div css={galleryStyles(theme)}>
      {message ? <StatusNotice role="status">{message}</StatusNotice> : null}
      <div css={gallerySummaryStyles(theme)}>
        <span>
          <strong>{videos.length}</strong> saved {videos.length === 1 ? 'video' : 'videos'}
        </span>
        <span>Newest first</span>
      </div>
      <div css={gridStyles(theme)} aria-label="Saved videos">
        {videos.map((video) => {
          const version = video.currentVersion;
          const busy = busyId === video.id;
          return (
            <article key={video.id} css={cardStyles(theme)} aria-busy={busy || undefined}>
              <button
                type="button"
                css={posterButtonStyles(theme)}
                disabled={busy || video.status !== 'ready'}
                aria-label={`Preview ${video.title}`}
                onClick={(event) => openPreview(video, event.currentTarget)}
              >
                <span css={posterStyles(theme)}>
                  {video.thumbnailAvailable && !brokenThumbnails.has(video.id) ? (
                    <img
                      css={thumbnailStyles(theme)}
                      data-gallery-thumbnail=""
                      src={savedVideoThumbnailUrl(video.id)}
                      alt=""
                      loading="lazy"
                      onError={() =>
                        setBrokenThumbnails((current) => new Set(current).add(video.id))
                      }
                    />
                  ) : (
                    <span
                      css={thumbnailPlaceholderStyles(theme)}
                      aria-label={
                        video.thumbnailAvailable
                          ? 'Thumbnail could not load'
                          : 'Thumbnail unavailable'
                      }
                    >
                      <VideoPlaceholderIcon />
                      <span>Preview available</span>
                    </span>
                  )}
                  <span data-gallery-play="" css={playBadgeStyles(theme)}>
                    <PlayIcon />
                  </span>
                  <span css={durationBadgeStyles(theme)}>{duration(version.durationMs)}</span>
                </span>
              </button>
              <div css={cardBodyStyles(theme)}>
                <div css={cardCopyStyles(theme)}>
                  <h3>{video.title}</h3>
                  <p>
                    {version.width}×{version.height} ·{' '}
                    <time dateTime={video.createdAt}>
                      {new Date(video.createdAt).toLocaleDateString()}
                    </time>
                  </p>
                </div>
                <div css={chipRowStyles(theme)} aria-label="Video details">
                  <span css={chipStyles(theme)}>
                    {video.versionCount} version{video.versionCount === 1 ? '' : 's'}
                  </span>
                  <span css={chipStyles(theme)}>{version.origin}</span>
                  {video.status !== 'ready' ? (
                    <span css={chipStyles(theme)}>{video.status}</span>
                  ) : null}
                </div>
                <div css={actionsStyles(theme)}>
                  <Button
                    variant="primary"
                    disabled={busy || video.status !== 'ready'}
                    busy={busy}
                    onClick={() => void handleUseVideo(video, 'play')}
                  >
                    Load in Studio
                  </Button>
                  <details css={actionMenuStyles(theme)}>
                    <summary aria-label={`More actions for ${video.title}`}>
                      <MoreIcon />
                    </summary>
                    <div css={actionMenuPopoverStyles(theme)}>
                      <button
                        type="button"
                        disabled={busy || video.status !== 'ready'}
                        onClick={() => void handleUseVideo(video, 'edit')}
                      >
                        Edit video
                      </button>
                      <a href={downloadSavedVideoUrl(video.id)} download={version.filename}>
                        Download
                      </a>
                      <button type="button" disabled={busy} onClick={() => void rename(video)}>
                        Rename
                      </button>
                      <button
                        type="button"
                        data-danger=""
                        disabled={busy}
                        onClick={() => void remove(video)}
                      >
                        Delete
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {nextCursor ? (
        <div css={paginationStyles(theme)}>
          <Button variant="secondary" onClick={() => void load(nextCursor)}>
            Load more videos
          </Button>
        </div>
      ) : null}
      <OverlayPanel
        open={previewVideo !== null}
        onClose={closePreview}
        title={previewVideo?.title ?? 'Video preview'}
        description="Preview this saved version before loading it into Studio."
        placement="fullscreen"
        size="wide"
        height="tall"
        centered
        initialFocus="heading"
        returnFocusRef={previewTriggerRef}
        bodyMode="scroll"
        footer={
          previewVideo ? (
            <div css={previewFooterStyles(theme)}>
              <a
                href={downloadSavedVideoUrl(previewVideo.id)}
                download={previewVideo.currentVersion.filename}
              >
                Download
              </a>
              <Button
                variant="secondary"
                disabled={busyId === previewVideo.id}
                onClick={() => void handleUseVideo(previewVideo, 'edit')}
              >
                Edit video
              </Button>
              <Button
                variant="primary"
                busy={busyId === previewVideo.id}
                onClick={() => void handleUseVideo(previewVideo, 'play')}
              >
                Load in Studio
              </Button>
            </div>
          ) : null
        }
      >
        {previewVideo ? (
          <div css={previewContentStyles(theme)}>
            <div css={previewPlayerStyles(theme)}>
              {/* Saved local videos may not include a captions track. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={previewPlayerRef}
                src={savedVideoContentUrl(previewVideo.id)}
                controls
                playsInline
                preload="metadata"
                aria-label={`Preview of ${previewVideo.title}`}
                onLoadedData={() => setPreviewError(false)}
                onError={() => setPreviewError(true)}
              />
            </div>
            {previewError ? (
              <StatusNotice tone="danger" role="alert">
                This saved video could not be previewed. You can still try loading or downloading
                it.
              </StatusNotice>
            ) : null}
            <div css={previewMetadataStyles(theme)}>
              <span>{duration(previewVideo.currentVersion.durationMs)} duration</span>
              <span>
                {previewVideo.currentVersion.width}×{previewVideo.currentVersion.height}
              </span>
              <span>{previewVideo.currentVersion.origin}</span>
              <span>
                {previewVideo.versionCount} version
                {previewVideo.versionCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        ) : null}
      </OverlayPanel>
    </div>
  );
};
