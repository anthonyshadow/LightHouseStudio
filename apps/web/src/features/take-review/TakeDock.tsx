import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import type { RecordedTakeMetadata, RecordingController, TakeMetadata } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import type { VoiceBrowserCapabilities } from '../voice-effects/voiceCapabilities';
import { VoiceEffectsPanel } from '../voice-effects/VoiceEffectsPanel';
import { TakeReviewActions } from './TakeReviewActions';

export type TakeDockProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  elevenLabsModel?: string | null;
  browserCapabilities?: VoiceBrowserCapabilities;
  view?: 'all' | 'take' | 'voice';
  onCloseTake?: () => void;
  onDiscardTake?: () => void;
  onEditVideo?: () => void;
  onOpenVoiceTreatments?: () => void;
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
    case 'lucy-latest':
      return 'Character AI';
    case 'lucy-vton-latest':
      return 'Virtual Try-On';
  }
};

const formatFrameRate = (frameRate: number): string =>
  `${Number.isInteger(frameRate) ? frameRate : Number(frameRate.toFixed(2))} fps`;

const defaultAudioSourceLabel = (source: RecordedTakeMetadata['audioSource']): string => {
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
  if (metadata.kind === 'uploaded') {
    return [
      { key: 'mode', label: 'Uploaded video' },
      {
        key: 'selected-at',
        label: new Date(metadata.selectedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        }),
        title: new Date(metadata.selectedAt).toLocaleString(),
        dateTime: metadata.selectedAt,
      },
      { key: 'filename', label: metadata.displayName, title: metadata.displayName },
      { key: 'resolution', label: `${metadata.width} × ${metadata.height}` },
      {
        key: 'codec',
        label: `${metadata.container.toUpperCase()} · ${metadata.videoCodec === 'avc' ? 'H.264' : 'VP8'}`,
      },
      {
        key: 'audio',
        label: `Audio: ${metadata.hasAudio ? (metadata.audioCodec ?? 'Present') : 'None'}`,
      },
    ];
  }
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
  elevenLabsModel = null,
  browserCapabilities,
  view = 'all',
  onCloseTake,
  onDiscardTake,
  onEditVideo,
  onOpenVoiceTreatments,
}: TakeDockProps) => {
  const theme = useTheme();
  const artifact = recording.presented;
  const captureChips = captureMetadataChips(recording.metadata);

  if (!artifact) return null;
  if (view === 'voice') {
    return (
      <VoiceEffectsPanel
        recording={recording}
        processing={processing}
        elevenLabsAvailable={elevenLabsAvailable}
        elevenLabsModel={elevenLabsModel}
        {...(browserCapabilities ? { browserCapabilities } : {})}
      />
    );
  }

  return (
    <Surface
      as="section"
      data-scroll-region="take-review"
      tabIndex={0}
      aria-labelledby="take-heading"
      tone="soft"
      padding="compact"
      css={takeSurfaceStyles(theme)}
    >
      <div css={gridStyles(theme, view)}>
        <div css={latestPanelStyles()}>
          <header>
            <h2 id="take-heading" tabIndex={-1} css={headingStyles(theme)}>
              Latest take
            </h2>
            <p role="status" aria-live="polite" aria-atomic="true" css={introStyles(theme)}>
              Playback remains on the main stage. Download this temporary take before releasing it.
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
              <TakeReviewActions
                recording={recording}
                {...(onCloseTake ? { onCloseTake } : {})}
                {...(onDiscardTake ? { onDiscardTake } : {})}
                {...(onEditVideo ? { onEditVideo } : {})}
                {...(onOpenVoiceTreatments ? { onOpenVoiceTreatments } : {})}
              />
            </div>
          </div>
          {recording.downloaded ? (
            <StatusNotice role="status" aria-live="polite" tone="success">
              A download was started. This tab still owns the temporary take.
            </StatusNotice>
          ) : null}
        </div>
        {view !== 'take' ? (
          <div>
            <VoiceEffectsPanel
              recording={recording}
              processing={processing}
              elevenLabsAvailable={elevenLabsAvailable}
              elevenLabsModel={elevenLabsModel}
              {...(browserCapabilities ? { browserCapabilities } : {})}
            />
          </div>
        ) : null}
      </div>
    </Surface>
  );
};
