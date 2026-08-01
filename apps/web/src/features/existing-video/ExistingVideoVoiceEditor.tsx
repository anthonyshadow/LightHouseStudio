import { formatDuration } from '../recording';
import type { VoiceBrowserCapabilities } from '../voice-effects/VoiceEffectsPanel';
import type { VoiceEffectSelection } from '../voice-effects/types';
import { VoiceWorkspace } from '../voice-effects/VoiceWorkspace';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

export interface ExistingVideoVoiceEditorProps {
  readonly workflow: ExistingVideoWorkflow;
  readonly durationMs: number;
  readonly elevenLabsAvailable: boolean;
  readonly elevenLabsModel: string | null;
  readonly locked: boolean;
  readonly browserCapabilities?: VoiceBrowserCapabilities;
}

const detectVoiceBrowserCapabilities = (): VoiceBrowserCapabilities => ({
  webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
  offlineAudio: 'OfflineAudioContext' in window || 'webkitOfflineAudioContext' in window,
});

export const ExistingVideoVoiceEditor = ({
  workflow,
  durationMs,
  elevenLabsAvailable,
  elevenLabsModel,
  locked,
  browserCapabilities = detectVoiceBrowserCapabilities(),
}: ExistingVideoVoiceEditorProps) => {
  const selected: VoiceEffectSelection = workflow.voiceSelection ?? { kind: 'none' };

  return (
    <VoiceWorkspace
      mode="select"
      embedded
      heading="Configure Voice"
      committedSelection={selected}
      hasAudio={workflow.voiceAvailable}
      canReplaceAudio={browserCapabilities.webAudio}
      canRenderLocalEffects={browserCapabilities.webAudio && browserCapabilities.offlineAudio}
      elevenLabsAvailable={elevenLabsAvailable}
      elevenLabsModel={elevenLabsModel}
      elevenLabsDurationSupported={durationMs <= 5 * 60 * 1_000}
      clipDurationLabel={formatDuration(durationMs / 1_000)}
      locked={locked}
      onCommitOriginal={workflow.clearVoice}
      onCommitLocal={(effect) => workflow.selectLocalVoice(effect.id, effect.name)}
      onCommitVoice={(voice) => workflow.selectVoice(voice.voiceId, voice.name)}
    />
  );
};
