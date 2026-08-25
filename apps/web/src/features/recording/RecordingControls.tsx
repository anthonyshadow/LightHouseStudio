import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { ReactNode } from 'react';
import { AppIcon, Button, StatusNotice, Surface } from '../../ui';
import type { CameraAvailabilityNotice } from './cameraAvailability';
import { formatDuration } from './recordingHelpers';
import type { RecordingController, RecordingSource } from './types';
import type { StudioMode } from '../media-session';
import { media } from '../../ui/media';

export const DESKTOP_CAPTURE_SETTINGS_PANEL_ID = 'desktop-capture-settings-panel';

export type RecordingControlsProps = {
  recording: RecordingController;
  source: RecordingSource | null;
  mode: StudioMode;
  onOpenSettings?: () => void;
  desktopSettings?: ReactNode;
  /** Whether the docked desktop settings are open. Collapsed is the resting state. */
  desktopSettingsExpanded?: boolean;
  onToggleDesktopSettings?: () => void;
  /**
   * Capture problems that must stay on the surface while the docked settings are collapsed —
   * collapsing a panel must not be how the operator stops hearing about a blocked camera.
   */
  captureIssues?: readonly CameraAvailabilityNotice[];
};

const captureSurfaceStyles = (theme: Theme, dockedSettings: boolean): CSSObject => ({
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
  [media.downOrShort('desktop', '48rem')]: {
    gap: theme.space.xs,
    padding: theme.space.xs,
  },
  [media.down('tablet')]: { paddingInline: theme.space.xs },
  [media.up('laptop')]: {
    display: 'grid',
    alignContent: 'start',
    ...(dockedSettings ? { gridTemplateRows: 'minmax(0, 1fr)' } : {}),
    padding: theme.space.sm,
    borderColor: theme.colors.surfaceStrong,
    borderRadius: theme.radii.large,
    background: theme.colors.canvasRaised,
  },
  [`${media.up('laptop')} and (max-height: 48rem)`]: {
    gap: theme.space.sm,
    padding: theme.space.sm,
  },
});

const compactCaptureContentStyles = (dockedSettings: boolean): CSSObject => ({
  minWidth: 0,
  display: 'contents',
  ...(dockedSettings
    ? {
        [media.up('laptop')]: { display: 'none' },
      }
    : {}),
});

const desktopSettingsStyles = (theme: Theme, expanded: boolean): CSSObject => ({
  display: 'none',
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  [media.up('laptop')]: {
    display: 'grid',
    alignContent: 'start',
    gap: theme.space.xs,
    ...(expanded ? { gridTemplateRows: 'auto minmax(0, 1fr)' } : {}),
  },
});

const desktopSettingsToggleStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minHeight: '2.75rem',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  paddingInline: theme.space.sm,
  borderColor: theme.colors.border,
  background: theme.colors.surfaceStrong,
  fontSize: theme.fontSizes.caption,
  textAlign: 'start',
  '&::after': {
    flex: '0 0 auto',
    content: '"›"',
    fontSize: '1.15rem',
    lineHeight: 1,
    transform: 'rotate(90deg)',
  },
  '&[aria-expanded="true"]::after': { transform: 'rotate(-90deg)' },
});

const captureIssueStyles = (theme: Theme): CSSObject => ({
  padding: `${theme.space.xs} ${theme.space.sm}`,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.4,
});

const detailsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '& strong': { color: theme.colors.text, fontWeight: 760 },
  [media.up('laptop')]: {
    padding: theme.space.sm,
    overflow: 'visible',
    border: `1px solid ${theme.colors.surfaceStrong}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surface,
    lineHeight: 1.45,
    textOverflow: 'clip',
    whiteSpace: 'normal',
  },
});
const headingStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  [media.up('laptop')]: {
    position: 'static',
    width: 'auto',
    height: 'auto',
    margin: 0,
    overflow: 'visible',
    clip: 'auto',
    color: theme.colors.textFaint,
    fontSize: '0.68rem',
    fontWeight: 850,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
});

const desktopDeviceListStyles = (theme: Theme): CSSObject => ({
  display: 'none',
  [media.up('laptop')]: {
    display: 'grid',
    gap: theme.space.sm,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.surfaceStrong}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surface,
  },
});

const desktopDeviceRowStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '2.25rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  paddingBlock: theme.space.xs,
  '& + &': { borderBlockStart: `1px solid ${theme.colors.surfaceStrong}` },
  '& > span:first-of-type': {
    width: '2.25rem',
    height: '2.25rem',
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.small,
    color: theme.colors.accent,
    background: theme.colors.surfaceSoft,
  },
  '& svg': { width: '1.05rem', height: '1.05rem' },
  '& > span:last-of-type': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& strong': {
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& small': { color: theme.colors.textMuted, fontSize: '0.68rem' },
});

const compactDeviceSummaryStyles = (theme: Theme): CSSObject => ({
  ...detailsStyles(theme),
  [media.up('laptop')]: { display: 'none' },
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
  [media.down('tablet')]: {
    width: '2.75rem',
    minWidth: '2.75rem',
    padding: 0,
    fontSize: 0,
    '&::before': { content: '"⚙"', fontSize: '1rem' },
  },
  [media.up('laptop')]: {
    width: '100%',
    minHeight: '2.75rem',
    justifyContent: 'center',
    borderColor: theme.colors.border,
    background: theme.colors.surfaceStrong,
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
  desktopSettings,
  desktopSettingsExpanded = false,
  onToggleDesktopSettings,
  captureIssues = [],
}: RecordingControlsProps) => {
  const theme = useTheme();
  const active = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  // Only the open panel takes the surface over; collapsed, it steps aside for the device summary.
  const dockedSettings = Boolean(desktopSettings) && desktopSettingsExpanded;
  const videoTrack = source?.stream.getVideoTracks?.()[0];
  const audioTrack = source?.stream.getAudioTracks?.()[0];
  const videoSettings = videoTrack?.getSettings?.();
  const resolution = captureResolutionLabel(mode, videoSettings);

  return (
    <Surface
      as="section"
      data-capture-controls=""
      padding="compact"
      aria-label="Session and device information"
      css={captureSurfaceStyles(theme, dockedSettings)}
    >
      <div css={compactCaptureContentStyles(dockedSettings)}>
        <h2 id="capture-heading" css={headingStyles(theme)}>
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
          <>
            <div
              css={compactDeviceSummaryStyles(theme)}
              title={`${videoTrack?.label || source.videoSource} · ${audioTrack?.label || source.audioSource} · ${resolution}`}
            >
              <strong>{videoTrack?.label || source.videoSource}</strong>
              {' · '}
              {audioTrack?.label || source.audioSource}
              {' · '}
              {resolution}
            </div>
            <div css={desktopDeviceListStyles(theme)} data-active-capture-details="">
              {/* Titled because the column is narrow enough to ellipsize a real device name. */}
              <div
                css={desktopDeviceRowStyles(theme)}
                title={videoTrack?.label || source.videoSource}
              >
                <span>
                  <AppIcon name="camera" />
                </span>
                <span>
                  <strong>{videoTrack?.label || source.videoSource}</strong>
                  <small>{resolution}</small>
                </span>
              </div>
              <div
                css={desktopDeviceRowStyles(theme)}
                title={audioTrack?.label || source.audioSource}
              >
                <span>
                  <AppIcon name="microphone" />
                </span>
                <span>
                  <strong>{audioTrack?.label || source.audioSource}</strong>
                  <small>{audioTrack ? 'Active input' : 'No audio track'}</small>
                </span>
              </div>
            </div>
          </>
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
      </div>
      {desktopSettings ? (
        <div css={desktopSettingsStyles(theme, desktopSettingsExpanded)}>
          <Button
            type="button"
            variant="secondary"
            data-desktop-capture-settings-toggle=""
            aria-expanded={desktopSettingsExpanded}
            aria-controls={DESKTOP_CAPTURE_SETTINGS_PANEL_ID}
            css={desktopSettingsToggleStyles(theme)}
            onClick={onToggleDesktopSettings}
          >
            Capture settings
          </Button>
          {!desktopSettingsExpanded &&
            captureIssues.map((issue) => (
              <StatusNotice
                key={issue.id}
                tone={issue.tone}
                role="status"
                css={captureIssueStyles(theme)}
              >
                {issue.title}
              </StatusNotice>
            ))}
          {/*
            Hidden rather than unmounted: the panel owns device discovery and the auto-apply guard,
            and remounting it on every toggle would re-enumerate devices and replay a pending apply.
          */}
          <div
            id={DESKTOP_CAPTURE_SETTINGS_PANEL_ID}
            hidden={!desktopSettingsExpanded}
            css={{
              minWidth: 0,
              minHeight: 0,
              ...(desktopSettingsExpanded ? { display: 'grid', height: '100%' } : {}),
            }}
          >
            {desktopSettings}
          </div>
        </div>
      ) : null}
    </Surface>
  );
};
