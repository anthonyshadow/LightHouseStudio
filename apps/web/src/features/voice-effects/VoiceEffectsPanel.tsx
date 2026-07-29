import { useRef, useState } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { canUseVoiceEffects } from '@studio/domain';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from './types';
import type { BrowserCapabilities } from '../media-session';
import { LOCAL_EFFECTS } from './types';
import { VoiceLibrary } from './VoiceLibrary';
import { formatDuration } from '../recording';

export type VoiceBrowserCapabilities = Pick<BrowserCapabilities, 'webAudio' | 'offlineAudio'>;

export type VoiceEffectsPanelProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  elevenLabsModel?: string | null;
  browserCapabilities?: VoiceBrowserCapabilities;
};

const optionGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7rem), 1fr))',
  gap: theme.space.xs,
});

const panelStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
});

const headingStyles = (): CSSObject => ({
  margin: 0,
  fontSize: '1rem',
});

const introStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xxs} 0 0`,
  color: theme.colors.textMuted,
  fontSize: '0.8rem',
});

const breadcrumbStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.accentStrong,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
});

const compatibilityDetailsStyles = (theme: Theme): CSSObject => ({
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
  fontSize: theme.fontSizes.caption,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    color: theme.colors.text,
    cursor: 'pointer',
    fontWeight: 760,
  },
  '& p': { margin: `${theme.space.xs} 0 0` },
});

const detectVoiceBrowserCapabilities = (): VoiceBrowserCapabilities => ({
  webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
  offlineAudio: 'OfflineAudioContext' in window || 'webkitOfflineAudioContext' in window,
});

export const VoiceEffectsPanel = ({
  recording,
  processing,
  elevenLabsAvailable,
  elevenLabsModel = null,
  browserCapabilities = detectVoiceBrowserCapabilities(),
}: VoiceEffectsPanelProps) => {
  const theme = useTheme();
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
  const voiceBrowserButtonRef = useRef<HTMLButtonElement>(null);
  const processingActive = recording.processingState === 'processing';
  const hasAudio = canUseVoiceEffects(
    recording.sidecar.state === 'ready' && recording.sidecar.blob
      ? {
          status: 'ready',
          attemptId: recording.original?.id ?? 'current-take',
          audio: recording.sidecar.blob,
          sizeBytes: recording.sidecar.blob.size,
        }
      : { status: 'unavailable' },
  );
  const canReplaceAudio = browserCapabilities.webAudio;
  const canRenderLocalEffects = canReplaceAudio && browserCapabilities.offlineAudio;
  const tooLongForElevenLabs = (recording.original?.durationMs ?? 0) > 5 * 60 * 1000;
  const clipDurationLabel = formatDuration((recording.original?.durationMs ?? 0) / 1000);
  const treatmentReady =
    recording.processingState === 'ready' && processing.selection.kind !== 'none';

  return (
    <section aria-labelledby="voice-treatment-heading" css={panelStyles(theme)}>
      <header>
        <p css={breadcrumbStyles(theme)}>Take review → Voice treatments</p>
        <h3 id="voice-treatment-heading" css={headingStyles()}>
          Choose a voice treatment
        </h3>
        <p css={introStyles(theme)}>
          Every treatment starts from the immutable original audio—not the previously processed
          take.
        </p>
      </header>

      <div role="group" aria-label="Voice treatment choices" css={optionGridStyles(theme)}>
        <Button
          variant={processing.selection.kind === 'none' ? 'primary' : 'secondary'}
          aria-pressed={processing.selection.kind === 'none'}
          onClick={processing.restoreOriginal}
        >
          Original
        </Button>
        {LOCAL_EFFECTS.map((effect) => (
          <Button
            key={effect.id}
            variant={
              processing.selection.kind === 'local' && processing.selection.effect === effect.id
                ? 'primary'
                : 'secondary'
            }
            aria-pressed={
              processing.selection.kind === 'local' && processing.selection.effect === effect.id
            }
            disabled={!hasAudio || processingActive || !canRenderLocalEffects}
            title={effect.description}
            onClick={() => void processing.applyLocal(effect.id)}
          >
            {effect.name}
          </Button>
        ))}
      </div>

      {!hasAudio ? (
        <StatusNotice role="status" aria-live="polite" tone="warning">
          This take has no usable audio sidecar. The original video remains available.
        </StatusNotice>
      ) : null}
      {!canReplaceAudio ? (
        <StatusNotice role="status" tone="warning" title="Voice replacement unavailable">
          This browser does not expose Web Audio, so local effects and provider voice replacement
          are disabled. The immutable original remains available.
        </StatusNotice>
      ) : !browserCapabilities.offlineAudio ? (
        <StatusNotice role="status" tone="warning" title="Local effects unavailable">
          This browser cannot render audio offline. ElevenLabs treatment can still be used, and the
          immutable original remains available.
        </StatusNotice>
      ) : null}
      {hasAudio && canReplaceAudio ? (
        <details css={compatibilityDetailsStyles(theme)}>
          <summary>Browser compatibility details</summary>
          <p>
            Final track replacement requires a browser-supported audio encoder. Compatibility is
            checked when you apply a treatment; a failed replacement never overwrites the original.
          </p>
        </details>
      ) : null}
      {processingActive ? (
        <StatusNotice role="status" aria-live="polite" title="Rendering voice treatment…">
          Playback and download remain locked until a complete replacement is ready.
          <Button size="small" variant="quiet" onClick={processing.cancel}>
            Cancel processing
          </Button>
        </StatusNotice>
      ) : null}
      {recording.processingState === 'error' && recording.processingError ? (
        <StatusNotice role="alert" tone="danger">
          {recording.processingError}
        </StatusNotice>
      ) : null}
      {treatmentReady ? (
        <StatusNotice role="status" aria-live="polite" tone="success">
          Voice treatment ready. Playback and download are available.
        </StatusNotice>
      ) : null}

      {elevenLabsAvailable ? (
        tooLongForElevenLabs ? (
          <StatusNotice role="status" aria-live="polite" tone="warning">
            ElevenLabs conversion supports clips up to five minutes. Local treatments remain
            available.
          </StatusNotice>
        ) : (
          <>
            <Button
              ref={voiceBrowserButtonRef}
              variant="secondary"
              onClick={() => setVoiceLibraryOpen(true)}
            >
              Browse saved voices · contacts ElevenLabs
            </Button>
            <OverlayPanel
              open={voiceLibraryOpen}
              onClose={() => setVoiceLibraryOpen(false)}
              title="Voice Browser"
              description="Take review → Voice treatments → Saved voices. Preview does not upload this take; Apply sends only the immutable original audio sidecar."
              placement="right"
              size="wide"
              bodyMode="scroll"
              closeLabel="Close voice browser"
              returnFocusRef={voiceBrowserButtonRef}
            >
              <StatusNotice tone="warning" title="Listen first; apply deliberately">
                Preview a saved voice without uploading your recording. Apply may use provider
                credits and sends only the original audio sidecar.
              </StatusNotice>
              <VoiceLibrary
                disabled={!hasAudio || processingActive || !canReplaceAudio}
                clipDurationLabel={clipDurationLabel}
                modelId={elevenLabsModel}
                onApply={(voice) => void processing.applyElevenLabs(voice.voiceId, voice.name)}
              />
            </OverlayPanel>
          </>
        )
      ) : (
        <StatusNotice>
          ElevenLabs is not configured. Local voice treatments are still available.
        </StatusNotice>
      )}
    </section>
  );
};
