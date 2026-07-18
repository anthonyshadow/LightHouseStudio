import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import { Button, StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import type { RecordingController, TakeMetadata } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import {
  VoiceEffectsPanel,
  type VoiceBrowserCapabilities,
} from '../voice-effects/VoiceEffectsPanel';

export type TakeDockProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  browserCapabilities?: VoiceBrowserCapabilities;
  view?: 'all' | 'take' | 'voice';
};

const gridStyles = (theme: Theme, view: NonNullable<TakeDockProps['view']>): CSSObject => ({
  display: 'grid',
  gridTemplateColumns:
    view === 'all' ? 'minmax(16rem, 1fr) minmax(18rem, 1.15fr)' : 'minmax(0, 1fr)',
  gap: theme.space.md,
  minWidth: 0,
  minHeight: 0,
  minBlockSize: '100%',
  '@media (max-width: 64rem)': { gridTemplateColumns: '1fr' },
});
const videoStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  maxHeight: '8rem',
  aspectRatio: '16 / 9',
  objectFit: 'contain',
  borderRadius: theme.radii.medium,
  background: theme.colors.canvas,
});
const metadataStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  margin: `${theme.space.sm} 0`,
  color: theme.colors.textMuted,
  fontSize: '0.78rem',
  minWidth: 0,
  '& > span, & > time': {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: `0.22rem ${theme.space.xs}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    background: theme.colors.surfaceStrong,
  },
});
const actionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& > *': { flex: '1 1 8rem' },
  minWidth: 0,
});

const headingStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  fontFamily: theme.type.display,
});

const introStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
});

const takeSurfaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  padding: theme.space.sm,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
});

const latestPanelStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
});

const reviewBodyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(7rem, 9rem) minmax(0, 1fr)',
  alignItems: 'start',
  gap: theme.space.sm,
  minWidth: 0,
  '@media (max-width: 32rem)': { gridTemplateColumns: '1fr' },
});

const reviewDetailsStyles = (): CSSObject => ({
  minWidth: 0,
});

const downloadStyles = (theme: Theme, locked: boolean): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '2.85rem',
  minWidth: '2.75rem',
  borderRadius: theme.radii.medium,
  color: theme.colors.canvas,
  background: theme.colors.accent,
  fontWeight: 760,
  textDecoration: 'none',
  pointerEvents: locked ? 'none' : 'auto',
  opacity: locked ? 0.5 : 1,
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

type MetadataChip = {
  key: string;
  label: string;
  title?: string;
  dateTime?: string;
};

const takeModeLabel = (mode: TakeMetadata['mode']): string => {
  switch (mode) {
    case 'local':
      return 'Local Camera';
    case 'lucy-2.5':
      return 'Character AI';
    case 'lucy-vton-3':
      return 'Virtual Try-On';
  }
};

const formatFrameRate = (frameRate: number): string =>
  `${Number.isInteger(frameRate) ? frameRate : Number(frameRate.toFixed(2))} fps`;

const defaultAudioSourceLabel = (source: TakeMetadata['audioSource']): string => {
  switch (source) {
    case 'provider':
      return 'Provider output';
    case 'microphone':
      return 'Microphone';
    case 'none':
      return 'None';
  }
};

const captureMetadataChips = (metadata: TakeMetadata | null): MetadataChip[] => {
  if (!metadata) return [];
  const chips: MetadataChip[] = [
    { key: 'mode', label: takeModeLabel(metadata.mode) },
    {
      key: 'video-source',
      label: `Video: ${metadata.videoSourceLabel ?? (metadata.videoSource === 'local' ? 'Local camera' : 'AI output')}`,
      ...(metadata.videoSourceLabel ? { title: metadata.videoSourceLabel } : {}),
    },
    {
      key: 'audio-source',
      label: `Audio: ${metadata.audioSourceLabel ?? defaultAudioSourceLabel(metadata.audioSource)}`,
      ...(metadata.audioSourceLabel ? { title: metadata.audioSourceLabel } : {}),
    },
  ];
  const started = new Date(metadata.startedAt);
  if (!Number.isNaN(started.getTime())) {
    chips.splice(1, 0, {
      key: 'started-at',
      label: new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(started),
      title: started.toLocaleString(),
      dateTime: metadata.startedAt,
    });
  }
  if (metadata.width !== undefined && metadata.height !== undefined) {
    chips.push({
      key: 'resolution',
      label: `${Math.round(metadata.width)} × ${Math.round(metadata.height)}`,
    });
  } else if (metadata.width !== undefined) {
    chips.push({ key: 'width', label: `Width ${Math.round(metadata.width)}` });
  } else if (metadata.height !== undefined) {
    chips.push({ key: 'height', label: `Height ${Math.round(metadata.height)}` });
  }
  if (metadata.frameRate !== undefined) {
    chips.push({ key: 'frame-rate', label: formatFrameRate(metadata.frameRate) });
  }
  return chips;
};

export const TakeDock = ({
  recording,
  processing,
  elevenLabsAvailable,
  browserCapabilities,
  view = 'all',
}: TakeDockProps) => {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const captureChips = captureMetadataChips(recording.metadata);

  useEffect(() => {
    if (locked) videoRef.current?.pause();
  }, [artifact?.objectUrl, locked]);

  if (!artifact) return null;

  const discard = () => {
    if (
      !window.confirm(
        'Discard this in-memory take? It cannot be recovered after the tab releases it.',
      )
    )
      return;
    recording.discard();
    window.requestAnimationFrame(() => {
      document.getElementById('record-take-action')?.focus();
    });
  };

  return (
    <Surface
      as="section"
      data-scroll-region="take-review"
      tabIndex={0}
      aria-labelledby={view === 'voice' ? 'voice-treatment-heading' : 'take-heading'}
      tone="soft"
      padding="compact"
      css={takeSurfaceStyles(theme)}
    >
      <div css={gridStyles(theme, view)}>
        {view !== 'voice' ? (
          <div css={latestPanelStyles()}>
            <header>
              <h2 id="take-heading" tabIndex={-1} css={headingStyles(theme)}>
                Latest take
              </h2>
              <p role="status" aria-live="polite" aria-atomic="true" css={introStyles(theme)}>
                Available in this tab only. Download it before refreshing or closing.
              </p>
            </header>
            <div css={reviewBodyStyles(theme)}>
              <video
                ref={videoRef}
                css={videoStyles(theme)}
                controls={!locked}
                src={artifact.objectUrl}
                aria-label={
                  locked
                    ? 'Latest recorded take. Playback is unavailable while voice processing completes.'
                    : 'Latest recorded take'
                }
                aria-busy={locked}
                onPlay={(event) => {
                  if (locked) event.currentTarget.pause();
                }}
              />
              <div css={reviewDetailsStyles()}>
                {captureChips.length > 0 ? (
                  <div css={metadataStyles(theme)} role="list" aria-label="Capture metadata">
                    {captureChips.map((chip) =>
                      chip.dateTime ? (
                        <time
                          key={chip.key}
                          role="listitem"
                          dateTime={chip.dateTime}
                          title={chip.title}
                        >
                          {chip.label}
                        </time>
                      ) : (
                        <span key={chip.key} role="listitem" title={chip.title}>
                          {chip.label}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
                <div css={metadataStyles(theme)} role="list" aria-label="Take file details">
                  <span role="listitem">{formatDuration(artifact.durationMs / 1000)}</span>
                  <span role="listitem">{formatBytes(artifact.sizeBytes)}</span>
                  {artifact.mimeType ? (
                    <span role="listitem" title={artifact.mimeType}>
                      {artifact.mimeType}
                    </span>
                  ) : null}
                </div>
                <div css={actionStyles(theme)}>
                  <a
                    href={artifact.objectUrl}
                    download={artifact.filename}
                    aria-disabled={locked}
                    tabIndex={locked ? -1 : undefined}
                    css={downloadStyles(theme, locked)}
                    onClick={(event) => {
                      if (locked) {
                        event.preventDefault();
                        return;
                      }
                      recording.markDownloaded();
                    }}
                  >
                    Download take
                  </a>
                  <Button variant="danger" disabled={locked} onClick={discard}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
            {recording.downloaded ? (
              <StatusNotice role="status" aria-live="polite" tone="success">
                A download was started. This tab still owns the temporary take.
              </StatusNotice>
            ) : null}
          </div>
        ) : null}
        {view !== 'take' ? (
          <VoiceEffectsPanel
            recording={recording}
            processing={processing}
            elevenLabsAvailable={elevenLabsAvailable}
            {...(browserCapabilities ? { browserCapabilities } : {})}
          />
        ) : null}
      </div>
    </Surface>
  );
};
