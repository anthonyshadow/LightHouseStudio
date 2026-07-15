import { useState } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { canUseVoiceEffects } from '@studio/domain';
import { Button, StatusNotice } from '../../ui';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from './types';
import type { BrowserCapabilities } from '../media-session';
import { LOCAL_EFFECTS } from './types';
import { VoiceLibrary } from './VoiceLibrary';

export type VoiceBrowserCapabilities = Pick<BrowserCapabilities, 'webAudio' | 'offlineAudio'>;

export type VoiceEffectsPanelProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  browserCapabilities?: VoiceBrowserCapabilities;
};

const optionGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
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

const summaryStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  minHeight: '2.75rem',
  color: theme.colors.text,
  fontWeight: 720,
  cursor: 'pointer',
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

const providerContentStyles = (theme: Theme): CSSObject => ({
  marginTop: theme.space.md,
});

const detectVoiceBrowserCapabilities = (): VoiceBrowserCapabilities => ({
  webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
  offlineAudio: 'OfflineAudioContext' in window || 'webkitOfflineAudioContext' in window,
});

export const VoiceEffectsPanel = ({
  recording,
  processing,
  elevenLabsAvailable,
  browserCapabilities = detectVoiceBrowserCapabilities(),
}: VoiceEffectsPanelProps) => {
  const theme = useTheme();
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
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
  const treatmentReady =
    recording.processingState === 'ready' && processing.selection.kind !== 'none';

  return (
    <section aria-labelledby="voice-treatment-heading" css={panelStyles(theme)}>
      <header>
        <h3 id="voice-treatment-heading" css={headingStyles()}>
          Voice treatment
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
        <StatusNotice title="Audio replacement compatibility">
          Final track replacement requires a browser-supported audio encoder. Compatibility is
          checked when you apply a treatment; a failed replacement never overwrites the original.
        </StatusNotice>
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
          <details
            open={voiceLibraryOpen}
            onToggle={(event) => setVoiceLibraryOpen(event.currentTarget.open)}
          >
            <summary css={summaryStyles(theme)}>
              Browse ElevenLabs voices · contacts provider
            </summary>
            {voiceLibraryOpen ? (
              <div css={providerContentStyles(theme)}>
                <StatusNotice tone="warning">
                  Previews do not send your recording. Applying a voice sends only the completed
                  audio sidecar and may use provider credits.
                </StatusNotice>
                <VoiceLibrary
                  disabled={!hasAudio || processingActive || !canReplaceAudio}
                  onApply={(voice) => void processing.applyElevenLabs(voice.voiceId, voice.name)}
                />
              </div>
            ) : null}
          </details>
        )
      ) : (
        <StatusNotice>
          ElevenLabs is not configured. Local voice treatments are still available.
        </StatusNotice>
      )}
    </section>
  );
};
