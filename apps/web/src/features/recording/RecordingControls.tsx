import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, Surface } from '../../ui';
import { formatDuration } from './recordingHelpers';
import type { RecordingController, RecordingSource } from './types';
import type { StudioMode } from '../media-session';

export type RecordingControlsProps = {
  recording: RecordingController;
  source: RecordingSource | null;
  mode: StudioMode;
  onOpenSettings?: () => void;
};

const captureSurfaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: `${theme.space.xs} ${theme.space.sm}`,
  borderColor: `color-mix(in srgb, ${theme.colors.surfaceStrong} 72%, transparent)`,
  borderRadius: theme.radii.medium,
  background: `color-mix(in srgb, ${theme.colors.canvas} 58%, transparent)`,
  boxShadow: 'none',
  overflow: 'hidden',
  '@media (max-width: 79.99rem), (max-height: 48rem)': {
    gap: theme.space.xs,
    padding: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': { paddingInline: theme.space.xs },
});

const detailsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '& strong': { color: theme.colors.text, fontWeight: 760 },
});
const headingStyles = (): CSSObject => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
});
const settingsActionStyles = (theme: Theme): CSSObject => ({
  minHeight: '2.75rem',
  paddingInline: theme.space.sm,
  borderColor: 'transparent',
  color: theme.colors.textMuted,
  background: 'transparent',
  boxShadow: 'none',
  fontSize: theme.fontSizes.caption,
  whiteSpace: 'nowrap',
  '&:hover:not(:disabled)': {
    color: theme.colors.accent,
    borderColor: theme.colors.border,
    background: theme.colors.surface,
  },
  '@media (max-width: 39.99rem)': {
    width: '2.75rem',
    minWidth: '2.75rem',
    padding: 0,
    fontSize: 0,
    '&::before': { content: '"⚙"', fontSize: '1rem' },
  },
});

const recordingStatusStyles = (theme: Theme): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.recording,
  fontFamily: theme.type.mono,
  fontWeight: 760,
  '&::before': {
    width: '0.5rem',
    height: '0.5rem',
    flex: '0 0 auto',
    borderRadius: '50%',
    background: theme.colors.recording,
    boxShadow: `0 0 0 0.2rem ${theme.colors.recordingSoft}`,
    content: '""',
  },
});

const captureResolutionLabel = (
  mode: StudioMode,
  settings: MediaTrackSettings | undefined,
): string => {
  if (!settings?.width || !settings.height) {
    return mode === 'local' ? '720p target · 30fps' : 'Provider managed';
  }
  const frameRate = settings.frameRate ? ` · ${Math.round(settings.frameRate)}fps` : '';
  return `${settings.width}×${settings.height}${frameRate}`;
};

export const RecordingControls = ({
  recording,
  source,
  mode,
  onOpenSettings,
}: RecordingControlsProps) => {
  const theme = useTheme();
  const active = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const videoTrack = source?.stream.getVideoTracks?.()[0];
  const audioTrack = source?.stream.getAudioTracks?.()[0];
  const videoSettings = videoTrack?.getSettings?.();
  const resolution = captureResolutionLabel(mode, videoSettings);

  return (
    <Surface
      as="section"
      data-capture-controls=""
      padding="compact"
      aria-labelledby="capture-heading"
      css={captureSurfaceStyles(theme)}
    >
      <h2 id="capture-heading" css={headingStyles()}>
        Session and device information
      </h2>
      {active ? (
        <div
          role="timer"
          aria-live="off"
          aria-label={`Recording elapsed time ${formatDuration(recording.elapsedSeconds)}`}
          css={[detailsStyles(theme), recordingStatusStyles(theme)]}
        >
          Recording {formatDuration(recording.elapsedSeconds)}
        </div>
      ) : source ? (
        <div
          css={detailsStyles(theme)}
          title={`${videoTrack?.label || source.videoSource} · ${audioTrack?.label || source.audioSource} · ${resolution}`}
        >
          <strong>{videoTrack?.label || source.videoSource}</strong>
          {' · '}
          {audioTrack?.label || source.audioSource}
          {' · '}
          {resolution}
        </div>
      ) : (
        <div css={detailsStyles(theme)}>Camera and microphone are off</div>
      )}
      {onOpenSettings ? (
        <Button
          variant="secondary"
          aria-label="Open capture settings"
          css={settingsActionStyles(theme)}
          disabled={active}
          onClick={onOpenSettings}
        >
          Device settings
        </Button>
      ) : null}
    </Surface>
  );
};
