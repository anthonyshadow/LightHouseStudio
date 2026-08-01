import { useTheme } from '@emotion/react';
import { useState } from 'react';
import { Button, StatusNotice } from '../../ui';
import { formatDuration } from '../recording';
import { VoiceLibrary } from '../voice-effects/VoiceLibrary';
import { LOCAL_EFFECTS } from '../voice-effects/types';
import {
  configCardStyles,
  configHeaderStyles,
  localEffectGridStyles,
  rowStyles,
} from './ExistingVideoPanel.styles';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

export interface ExistingVideoVoiceEditorProps {
  readonly workflow: ExistingVideoWorkflow;
  readonly durationMs: number;
  readonly elevenLabsAvailable: boolean;
  readonly elevenLabsModel: string | null;
  readonly locked: boolean;
}

export const ExistingVideoVoiceEditor = ({
  workflow,
  durationMs,
  elevenLabsAvailable,
  elevenLabsModel,
  locked,
}: ExistingVideoVoiceEditorProps) => {
  const theme = useTheme();
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);
  const selected = workflow.voiceSelection;

  return (
    <section css={configCardStyles(theme)} aria-labelledby="existing-video-voice-heading">
      <header css={configHeaderStyles(theme)}>
        <div>
          <h3 id="existing-video-voice-heading">Configure Voice</h3>
          <p>Choose one treatment. Processing always starts from the original source audio.</p>
        </div>
        <span>Optional</span>
      </header>

      <div>
        <strong>Local effects</strong>
        <p>Rendered in this browser without provider transfer.</p>
      </div>
      <div css={localEffectGridStyles(theme)}>
        {LOCAL_EFFECTS.map((effect) => {
          const active = selected?.kind === 'local' && selected.effect === effect.id;
          return (
            <Button
              key={effect.id}
              variant={active ? 'primary' : 'secondary'}
              aria-pressed={active}
              disabled={locked}
              onClick={() => workflow.selectLocalVoice(effect.id, effect.name)}
            >
              <strong>{effect.name}</strong>
              <small>{effect.description}</small>
            </Button>
          );
        })}
      </div>

      <div>
        <strong>Saved AI voice</strong>
        <p>Browsing contacts ElevenLabs. Selecting a voice does not upload this video or audio.</p>
      </div>
      <div css={rowStyles(theme)}>
        <Button
          variant={selected?.kind === 'elevenlabs' ? 'primary' : 'secondary'}
          aria-expanded={voiceLibraryOpen}
          disabled={locked || !elevenLabsAvailable}
          onClick={() => setVoiceLibraryOpen((open) => !open)}
        >
          {selected?.kind === 'elevenlabs' ? 'Change saved voice' : 'Browse saved voices'}
        </Button>
        {selected ? (
          <Button
            variant="quiet"
            disabled={locked}
            onClick={() => {
              workflow.clearVoice();
              setVoiceLibraryOpen(false);
            }}
          >
            Clear Voice setup
          </Button>
        ) : null}
      </div>

      {!elevenLabsAvailable ? (
        <StatusNotice tone="neutral">
          ElevenLabs is unavailable. Local voice effects remain available.
        </StatusNotice>
      ) : null}
      {selected ? (
        <StatusNotice tone="neutral">
          Ready: <strong>{selected.voiceName}</strong>
          {selected.kind === 'local'
            ? ' will be rendered locally.'
            : ' will be applied through ElevenLabs after you start.'}
        </StatusNotice>
      ) : null}
      {voiceLibraryOpen && elevenLabsAvailable ? (
        <VoiceLibrary
          mode="select"
          disabled={locked}
          clipDurationLabel={formatDuration(durationMs / 1_000)}
          modelId={elevenLabsModel}
          onApply={(voice) => {
            workflow.selectVoice(voice.voiceId, voice.name);
            setVoiceLibraryOpen(false);
          }}
        />
      ) : null}
    </section>
  );
};
