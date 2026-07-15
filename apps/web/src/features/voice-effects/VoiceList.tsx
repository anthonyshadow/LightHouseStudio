import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';
import type { VoiceSummary } from './types';
import type { VoiceLibraryKind } from './types';

const listStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  padding: 0,
  margin: 0,
  listStyle: 'none',
});

const voiceStyles = (theme: Theme, selected: boolean): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: selected ? theme.colors.accentSoft : theme.colors.canvasRaised,
  '& h4': { margin: 0, fontSize: '0.9rem' },
  '& p': { margin: `${theme.space.xxs} 0 0`, color: theme.colors.textMuted, fontSize: '0.76rem' },
  '@media (max-width: 31rem)': { gridTemplateColumns: '1fr' },
});

const voiceBodyStyles = (): CSSObject => ({ minWidth: 0 });
const audioStyles = (): CSSObject => ({ width: '100%', maxWidth: '100%' });
const voiceActionStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  alignContent: 'start',
});

const previewUrl = (voice: VoiceSummary, kind: VoiceLibraryKind): string | null => {
  if (!voice.previewAvailable) return null;
  if (kind === 'public' && voice.publicOwnerId) {
    return `/api/elevenlabs/shared-voices/${encodeURIComponent(voice.publicOwnerId)}/${encodeURIComponent(voice.voiceId)}/preview`;
  }
  return `/api/elevenlabs/voices/${encodeURIComponent(voice.voiceId)}/preview`;
};

type VoiceListProps = {
  voices: readonly VoiceSummary[];
  kind: VoiceLibraryKind;
  selected: VoiceSummary | null;
  loading: boolean;
  importingVoiceKey: string | null;
  onSelect(voice: VoiceSummary): void;
  onImport(voice: VoiceSummary): void;
  onPreviewError(voice: VoiceSummary): void;
};

export const VoiceList = ({
  voices,
  kind,
  selected,
  loading,
  importingVoiceKey,
  onSelect,
  onImport,
  onPreviewError,
}: VoiceListProps) => {
  const theme = useTheme();
  return (
    <ul aria-label="Available voices" aria-busy={loading} css={listStyles(theme)}>
      {voices.map((voice) => {
        const preview = previewUrl(voice, kind);
        const voiceSelected = selected?.voiceId === voice.voiceId;
        const voiceKey = `${voice.publicOwnerId ?? 'workspace'}:${voice.voiceId}`;
        return (
          <li key={voiceKey} css={voiceStyles(theme, voiceSelected)}>
            <div css={voiceBodyStyles()}>
              <h4>{voice.name}</h4>
              <p>{voice.description ?? voice.category ?? 'Voice preview'}</p>
              {preview ? (
                <audio
                  controls
                  preload="none"
                  src={preview}
                  aria-label={`Listen to ${voice.name} preview`}
                  css={audioStyles()}
                  onError={() => onPreviewError(voice)}
                />
              ) : null}
            </div>
            <div css={voiceActionStyles(theme)}>
              <Button
                size="small"
                variant="quiet"
                aria-label={`${voiceSelected ? 'Selected' : 'Select'} ${voice.name}`}
                aria-pressed={voiceSelected}
                onClick={() => onSelect(voice)}
              >
                {voiceSelected ? 'Selected' : 'Select'}
              </Button>
              {kind === 'public' ? (
                <Button
                  size="small"
                  busy={importingVoiceKey === voiceKey}
                  disabled={importingVoiceKey !== null}
                  aria-label={`Import ${voice.name} into workspace`}
                  onClick={() => onImport(voice)}
                >
                  Import
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
