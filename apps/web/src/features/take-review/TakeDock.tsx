import { useTheme, type CSSObject, type Theme } from '@emotion/react';
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
  onCloseTake?: () => void;
  onOpenVoiceTreatments?: () => void;
  onBackToTake?: () => void;
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
  alignItems: 'start',
  gap: theme.space.sm,
  minWidth: 0,
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
  onCloseTake,
  onOpenVoiceTreatments,
  onBackToTake,
}: TakeDockProps) => {
  const theme = useTheme();
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const captureChips = captureMetadataChips(recording.metadata);

  if (!artifact) return null;

  const discard = () => {
    if (
      !window.confirm(
        'Discard this in-memory take? It cannot be recovered after the tab releases it.',
      )
    )
      return;
    recording.discard();
    onCloseTake?.();
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
                Playback remains on the main stage. Download this temporary take before closing it.
              </p>
            </header>
            <div css={reviewBodyStyles(theme)}>
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
                  {onOpenVoiceTreatments ? (
                    <Button variant="secondary" disabled={locked} onClick={onOpenVoiceTreatments}>
                      Voice treatments
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    disabled={locked || !recording.downloaded}
                    title={
                      recording.downloaded
                        ? 'Release the temporary in-memory take.'
                        : 'Start a download before closing this temporary take.'
                    }
                    onClick={() => {
                      recording.discard();
                      onCloseTake?.();
                    }}
                  >
                    Close take
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
          <div>
            {onBackToTake ? (
              <Button size="small" variant="quiet" onClick={onBackToTake}>
                Back to take review
              </Button>
            ) : null}
            <VoiceEffectsPanel
              recording={recording}
              processing={processing}
              elevenLabsAvailable={elevenLabsAvailable}
              {...(browserCapabilities ? { browserCapabilities } : {})}
            />
          </div>
        ) : null}
      </div>
    </Surface>
  );
};
