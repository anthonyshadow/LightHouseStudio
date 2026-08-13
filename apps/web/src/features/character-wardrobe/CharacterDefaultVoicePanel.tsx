import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import type { CreativeAssetRepository, SavedCharacterPrompt } from '../creative-assets/types';
import { VoiceLibrary } from '../voice-effects/VoiceLibrary';

export const CharacterDefaultVoicePanel = ({
  repository,
  character,
  onBack,
}: {
  readonly repository: CreativeAssetRepository;
  readonly character: SavedCharacterPrompt;
  readonly onBack: () => void;
}) => {
  const theme = useTheme();

  return (
    <div
      data-scroll-region="character-default-voice"
      css={{
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        display: 'grid',
        gap: theme.space.md,
      }}
    >
      <div css={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: theme.space.xs }}>
        <Button variant="quiet" onClick={onBack}>
          ‹ Back to wardrobe
        </Button>
        {character.defaultVoice ? (
          <Button
            variant="secondary"
            onClick={() =>
              void repository.updateSavedCharacterPrompt(character.id, { defaultVoice: null })
            }
          >
            Remove default voice
          </Button>
        ) : null}
      </div>
      <StatusNotice tone="neutral">
        {character.defaultVoice
          ? `${character.defaultVoice.voiceName} is selected automatically when this character is chosen in the existing-video editor. You can still override it per edit.`
          : 'No default voice is attached. Choose a saved voice below to attach one.'}
      </StatusNotice>
      <VoiceLibrary
        disabled={false}
        selectedVoiceId={character.defaultVoice?.voiceId ?? null}
        onSelect={(voice) =>
          void repository.updateSavedCharacterPrompt(character.id, {
            defaultVoice: {
              kind: 'elevenlabs',
              voiceId: voice.voiceId,
              voiceName: voice.name,
            },
          })
        }
      />
    </div>
  );
};
