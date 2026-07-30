import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useState } from 'react';

const PREVIEW_TIMEOUT_MS = 5_000;
const PREVIEW_MAX_WIDTH = 640;

const previewStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  minWidth: 0,
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  margin: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& img': {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
    background: theme.colors.canvas,
  },
});

const placeholderStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: theme.space.xs,
  padding: theme.space.md,
  color: theme.colors.textMuted,
  background: theme.gradients.stageIdle,
  textAlign: 'center',
  '& span:first-of-type': {
    width: '3rem',
    height: '3rem',
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.accent,
    background: theme.colors.scrim,
    fontSize: theme.fontSizes.section,
  },
  '& strong': { color: theme.colors.text, fontSize: theme.fontSizes.body },
  '& small': { maxWidth: '24rem', fontSize: theme.fontSizes.caption, lineHeight: 1.4 },
});

const waitForFirstFrame = (video: HTMLVideoElement, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('Video preview timed out.'))),
      PREVIEW_TIMEOUT_MS,
    );
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', handleLoaded);
      video.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleLoaded = () => finish(resolve);
    const handleError = () => finish(() => reject(new Error('Video preview could not load.')));
    const handleAbort = () =>
      finish(() => reject(new DOMException('Video preview was canceled.', 'AbortError')));

    video.addEventListener('loadeddata', handleLoaded);
    video.addEventListener('error', handleError);
    signal.addEventListener('abort', handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });

const captureFirstFrame = async (file: File, signal: AbortSignal): Promise<string | null> => {
  if (typeof URL.createObjectURL !== 'function') return null;

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    video.src = sourceUrl;
    video.load();
    await waitForFirstFrame(video, signal);
    signal.throwIfAborted();

    if (video.videoWidth <= 0 || video.videoHeight <= 0) return null;
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return null;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
};

export interface ExistingVideoSourcePreviewProps {
  readonly file: File;
  readonly displayName: string;
}

export const ExistingVideoSourcePreview = ({
  file,
  displayName,
}: ExistingVideoSourcePreviewProps) => {
  const theme = useTheme();
  const [poster, setPoster] = useState<{
    readonly file: File;
    readonly dataUrl: string | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void captureFirstFrame(file, controller.signal)
      .then((dataUrl) => {
        if (!controller.signal.aborted) setPoster({ file, dataUrl });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [file]);

  const settledPoster = poster?.file === file ? poster : null;

  return (
    <figure css={previewStyles(theme)} aria-label={`Video preview for ${displayName}`}>
      {settledPoster?.dataUrl ? (
        <img src={settledPoster.dataUrl} alt={`First frame preview of ${displayName}`} />
      ) : (
        <div
          css={placeholderStyles(theme)}
          role="img"
          aria-label={`Placeholder preview for ${displayName}`}
        >
          <span aria-hidden="true">▶</span>
          <strong>
            {settledPoster ? 'Video preview unavailable' : 'Preparing video preview…'}
          </strong>
          <small>
            {settledPoster
              ? 'The uploaded source is still ready on the shared stage.'
              : 'The first frame will appear here when this browser can extract it.'}
          </small>
        </div>
      )}
    </figure>
  );
};
