import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';
import type { PublicVoiceItem, VoiceLibraryItem, VoiceLibraryKind } from './types';
import { VoicePreview } from './VoicePreview';

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
const voiceActionStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  alignContent: 'start',
});

type VoiceListProps = {
  voices: readonly VoiceLibraryItem[];
  kind: VoiceLibraryKind;
  selected: VoiceLibraryItem | null;
  loading: boolean;
  importingVoiceKey: string | null;
  collapsePublicImport?: boolean;
  onSelect: (voice: VoiceLibraryItem) => void;
  onImport: (voice: PublicVoiceItem) => void;
  onPreviewError: (voice: VoiceLibraryItem) => void;
};

export const VoiceList = ({
  voices,
  kind,
  selected,
  loading,
  importingVoiceKey,
  collapsePublicImport = false,
  onSelect,
  onImport,
  onPreviewError,
}: VoiceListProps) => {
  const theme = useTheme();
  return (
    <ul aria-label="Available voices" aria-busy={loading} css={listStyles(theme)}>
      {voices.map((item) => {
        const { voice } = item;
        const voiceSelected =
          selected?.kind === item.kind && selected.voice.voiceId === voice.voiceId;
        const voiceKey =
          item.kind === 'public'
            ? `public:${item.voice.publicOwnerId}:${item.voice.voiceId}`
            : `workspace:${voice.voiceId}`;
        return (
          <li key={voiceKey} css={voiceStyles(theme, voiceSelected)}>
            <div css={voiceBodyStyles()}>
              <h4>{voice.name}</h4>
              <p>{voice.description ?? voice.category ?? 'Voice preview'}</p>
              <VoicePreview item={item} onError={onPreviewError} />
            </div>
            <div css={voiceActionStyles(theme)}>
              <Button
                size="small"
                variant="quiet"
                aria-label={`${voiceSelected ? 'Selected' : 'Select'} ${voice.name}`}
                aria-pressed={voiceSelected}
                onClick={() => onSelect(item)}
              >
                {voiceSelected ? 'Selected' : 'Select'}
              </Button>
              {kind === 'public' && item.kind === 'public' && !collapsePublicImport ? (
                <Button
                  size="small"
                  busy={importingVoiceKey === voiceKey}
                  disabled={importingVoiceKey !== null}
                  aria-label={`Import ${voice.name} into workspace`}
                  onClick={() => onImport(item)}
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
