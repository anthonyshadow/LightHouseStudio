import { canUseVoiceEffects } from '@studio/domain';
import { formatDuration } from '../recording';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from './types';
import { detectVoiceBrowserCapabilities, type VoiceBrowserCapabilities } from './voiceCapabilities';
import { VoiceWorkspace } from './VoiceWorkspace';

export type { VoiceBrowserCapabilities } from './voiceCapabilities';

export type VoiceEffectsPanelProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  elevenLabsModel?: string | null;
  browserCapabilities?: VoiceBrowserCapabilities;
};

export const VoiceEffectsPanel = ({
  recording,
  processing,
  elevenLabsAvailable,
  elevenLabsModel = null,
  browserCapabilities = detectVoiceBrowserCapabilities(),
}: VoiceEffectsPanelProps) => {
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
  const elevenLabsDurationSupported = (recording.original?.durationMs ?? 0) <= 5 * 60 * 1_000;
  const clipDurationLabel = formatDuration((recording.original?.durationMs ?? 0) / 1_000);
  const treatmentReady =
    recording.processingState === 'ready' && processing.selection.kind !== 'none';

  return (
    <VoiceWorkspace
      mode="apply"
      committedSelection={processing.selection}
      hasAudio={hasAudio}
      canReplaceAudio={canReplaceAudio}
      canRenderLocalEffects={canRenderLocalEffects}
      elevenLabsAvailable={elevenLabsAvailable}
      elevenLabsModel={elevenLabsModel}
      elevenLabsDurationSupported={elevenLabsDurationSupported}
      clipDurationLabel={clipDurationLabel}
      processingActive={processingActive}
      processingError={recording.processingState === 'error' ? recording.processingError : null}
      treatmentReady={treatmentReady}
      onCommitOriginal={processing.restoreOriginal}
      onCommitLocal={(effect) => void processing.applyLocal(effect.id)}
      onCommitVoice={(voice) => void processing.applyElevenLabs(voice.voiceId, voice.name)}
      onCancelProcessing={processing.cancel}
    />
  );
};
