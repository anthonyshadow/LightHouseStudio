import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { StatusNotice, Surface } from '../../ui';
import { visuallyHiddenStyles } from '../../ui/primitives/VisuallyHidden';
import { formatBytes, formatDuration } from '../recording';
import type { RecordedTakeMetadata, RecordingController, TakeMetadata } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import type { VoiceBrowserCapabilities } from '../voice-effects/voiceCapabilities';
import { VoiceEffectsPanel } from '../voice-effects/VoiceEffectsPanel';
import { SavedVideoSuccessActions } from '../saved-videos/SavedVideoSuccessActions';
import { TakeReviewActions } from './TakeReviewActions';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';

export type TakeDockProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  elevenLabsModel?: string | null;
  browserCapabilities?: VoiceBrowserCapabilities;
  /**
   * Which half of take review this dock renders. Every mount states one: the overlay renders the
   * take panel and the voice panel as two docks, and the old 'all' two-column variant had no
   * caller anywhere.
   */
  view: 'take' | 'voice';
  onCloseTake?: () => void;
  onDiscardTake?: () => void;
  onEditVideo?: () => void;
  onOpenVoiceTreatments?: () => void;
  onSaveVideo?: () => void;
  saveVideoState?: SaveVideoState;
  onOpenSavedVideosLibrary?: () => void;
  onReplaceSavedVideo?: () => void;
  hasUnsavedChanges?: boolean;
};

const gridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: theme.space.md,
  minWidth: 0,
  minHeight: 0,
  minBlockSize: '100%',
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

const detailsDisclosureStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  '& > summary': {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '2.25rem',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    fontWeight: 700,
    cursor: 'pointer',
    '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
  },
  '&[open] > summary': { color: theme.colors.text },
});

type MetadataChip = {
  key: string;
  label: string;
  title?: string;
  dateTime?: string;
};

/** Built once: the locale is the system default and cannot change within a session. */
const TAKE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

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
      label: TAKE_TIME_FORMAT.format(started),
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
  view,
  onCloseTake,
  onDiscardTake,
  onEditVideo,
  onOpenVoiceTreatments,
  onSaveVideo,
  saveVideoState,
  onOpenSavedVideosLibrary,
  onReplaceSavedVideo,
  hasUnsavedChanges,
}: TakeDockProps) => {
  const theme = useTheme();
  const artifact = recording.presented;

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

  // Derived after the guards above, so `artifact` is known and nothing is computed for a render
  // that returns early.
  const captureChips = captureMetadataChips(recording.metadata);
  const resolutionChip = captureChips.find((chip) => chip.key === 'resolution') ?? null;
  const detailChips: MetadataChip[] = [
    ...captureChips.filter((chip) => chip.key !== 'resolution'),
    { key: 'size', label: formatBytes(artifact.sizeBytes) },
    ...(artifact.mimeType
      ? [{ key: 'mime', label: artifact.mimeType, title: artifact.mimeType }]
      : []),
  ];

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
      <div css={gridStyles(theme)}>
        <div css={latestPanelStyles()}>
          <header>
            {/* The panel chrome already shows this title; the heading stays for the region label
                and as the focus target, so it is hidden rather than repeated on screen. */}
            <h2 id="take-heading" tabIndex={-1} css={visuallyHiddenStyles()}>
              Latest take
            </h2>
            <p role="status" aria-live="polite" aria-atomic="true" css={introStyles(theme)}>
              {hasUnsavedChanges === false
                ? 'This video has no unsaved changes.'
                : 'Save this take before you close it.'}
            </p>
          </header>
          <div css={reviewBodyStyles(theme)}>
            <div css={reviewDetailsStyles()}>
              {/* Duration and resolution are review criteria. Codec, file size, frame rate and
                  device names are not, so they are one disclosure away rather than eight chips
                  ahead of the decision. Nothing is dropped. */}
              <div css={metadataStyles(theme)} role="list" aria-label="Take summary">
                <span role="listitem">{formatDuration(artifact.durationMs / 1000)}</span>
                {resolutionChip ? <span role="listitem">{resolutionChip.label}</span> : null}
              </div>
              <details css={detailsDisclosureStyles(theme)}>
                <summary>Details</summary>
                <div css={metadataStyles(theme)} role="list" aria-label="Take details">
                  {detailChips.map((chip) =>
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
              </details>
              <TakeReviewActions
                recording={recording}
                {...(onCloseTake ? { onCloseTake } : {})}
                {...(onDiscardTake ? { onDiscardTake } : {})}
                {...(onEditVideo ? { onEditVideo } : {})}
                {...(onOpenVoiceTreatments ? { onOpenVoiceTreatments } : {})}
                {...(onSaveVideo ? { onSaveVideo } : {})}
                {...(saveVideoState ? { saveVideoState } : {})}
                {...(onReplaceSavedVideo ? { onReplaceSavedVideo } : {})}
                {...(hasUnsavedChanges !== undefined ? { hasUnsavedChanges } : {})}
              />
            </div>
          </div>
          {saveVideoState?.status === 'saved' &&
          saveVideoState.artifactId === recording.presented?.id ? (
            <StatusNotice
              role="status"
              aria-live="polite"
              tone="success"
              title={`“${saveVideoState.video.title}” is in Assets`}
            >
              <p>
                Saved as Version {saveVideoState.video.currentVersion.ordinal}. This take stays in
                this browser tab until you close it.
              </p>
              {onOpenSavedVideosLibrary ? (
                <SavedVideoSuccessActions
                  video={saveVideoState.video}
                  onOpenInAssets={onOpenSavedVideosLibrary}
                />
              ) : null}
            </StatusNotice>
          ) : null}
        </div>
      </div>
    </Surface>
  );
};
