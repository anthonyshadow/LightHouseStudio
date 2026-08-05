import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';
import type { VoiceLibraryItem } from './types';

const listStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  padding: 0,
  margin: 0,
  listStyle: 'none',
});

const voiceStyles = (theme: Theme, selected: boolean, previewed: boolean): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: '3rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${selected ? theme.colors.accent : previewed ? theme.colors.borderStrong : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: selected ? theme.colors.accentSoft : theme.colors.surface,
  scrollMarginBlockStart: theme.space.sm,
  transition: `border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover': { borderColor: selected ? theme.colors.accent : theme.colors.borderStrong },
  '@media (max-width: 34rem)': {
    gridTemplateColumns: '3rem minmax(0, 1fr)',
    '& [data-voice-actions]': { gridColumn: '1 / -1' },
  },
});

const previewMarkStyles = (theme: Theme, selected: boolean): CSSObject => ({
  width: '3rem',
  height: '3rem',
  display: 'grid',
  placeItems: 'center',
  borderRadius: theme.radii.round,
  color: selected ? theme.colors.onAccent : theme.colors.textMuted,
  background: selected ? theme.colors.accent : theme.colors.surfaceStrong,
  fontSize: '1.15rem',
  border: 0,
  padding: 0,
  font: 'inherit',
  cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
  '&:disabled': { cursor: 'default', opacity: 0.56 },
});

const voiceBodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  '& h5': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.xs,
    fontSize: theme.fontSizes.body,
  },
  '& h5 span': {
    padding: `0.12rem ${theme.space.xs}`,
    borderRadius: theme.radii.small,
    color: theme.colors.accent,
    background: 'rgba(98, 230, 194, 0.12)',
    fontSize: '0.62rem',
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  '& p': {
    display: '-webkit-box',
    margin: `${theme.space.xxs} 0 0`,
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.4,
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

const traitStyles = (theme: Theme, selected: boolean): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xxs,
  marginBlockStart: theme.space.xs,
  '& span': {
    padding: `0.14rem ${theme.space.xs}`,
    border: `1px solid ${selected ? theme.colors.borderStrong : theme.colors.border}`,
    borderRadius: theme.radii.small,
    color: selected ? theme.colors.textMuted : theme.colors.textFaint,
    background: selected ? theme.colors.surfaceStrong : theme.colors.canvasRaised,
    fontSize: '0.64rem',
  },
});

const voiceActionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'end',
  gap: theme.space.xs,
  '@media (max-width: 34rem)': {
    justifyContent: 'stretch',
    '& > *': { flex: '1 1 8rem' },
  },
});

const voiceTraits = (item: VoiceLibraryItem): string[] => {
  const traits = [
    item.voice.traits.language,
    item.voice.traits.gender,
    item.voice.traits.age,
    item.voice.traits.accent,
    item.voice.traits.useCase,
    item.voice.traits.descriptive,
    item.voice.category,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(traits)].slice(0, 3);
};

type VoiceListProps = {
  voices: readonly VoiceLibraryItem[];
  selected: VoiceLibraryItem | null;
  loading: boolean;
  disabled: boolean;
  previewVoiceId: string | null;
  previewLoadingVoiceId: string | null;
  previewPlaying: boolean;
  mutationVoiceId: string | null;
  onSelect: (voice: VoiceLibraryItem) => void;
  onPreview: (voice: VoiceLibraryItem) => void;
  onAdd: (voice: VoiceLibraryItem) => void;
  onRemove: (voice: VoiceLibraryItem) => void;
};

export const VoiceList = ({
  voices,
  selected,
  loading,
  disabled,
  previewVoiceId,
  previewLoadingVoiceId,
  previewPlaying,
  mutationVoiceId,
  onSelect,
  onPreview,
  onAdd,
  onRemove,
}: VoiceListProps) => {
  const theme = useTheme();
  return (
    <ul aria-label="Available voices" aria-busy={loading} css={listStyles(theme)}>
      {voices.map((item) => {
        const { voice } = item;
        const voiceSelected = selected?.voice.voiceId === voice.voiceId;
        const previewed = previewVoiceId === voice.voiceId;
        const previewLoading = previewLoadingVoiceId === voice.voiceId;
        const previewPlayingThisVoice = previewed && previewPlaying;
        const traits = voiceTraits(item);
        return (
          <li
            key={
              item.kind === 'workspace'
                ? `workspace:${voice.voiceId}`
                : `shared:${item.voice.publicOwnerId}:${voice.voiceId}`
            }
            css={voiceStyles(theme, voiceSelected, previewed)}
          >
            {voice.previewAvailable ? (
              <button
                type="button"
                css={previewMarkStyles(theme, voiceSelected)}
                disabled={previewLoading}
                aria-label={`${previewPlayingThisVoice ? 'Stop' : 'Preview'} ${voice.name}`}
                aria-pressed={previewPlayingThisVoice}
                onClick={() => onPreview(item)}
              >
                <span aria-hidden="true">
                  {previewLoading ? '…' : previewPlayingThisVoice ? 'Ⅱ' : '▶'}
                </span>
              </button>
            ) : (
              <span aria-hidden="true" css={previewMarkStyles(theme, voiceSelected)}>
                ▶
              </span>
            )}
            <div css={voiceBodyStyles(theme)}>
              <h5>
                {voice.name}
                {voiceSelected ? <span>Selected</span> : null}
              </h5>
              <p>
                {voice.description ??
                  (item.kind === 'workspace' ? 'Saved voice sample' : 'Catalog voice sample')}
              </p>
              {traits.length > 0 ? (
                <div aria-label={`${voice.name} traits`} css={traitStyles(theme, voiceSelected)}>
                  {traits.map((trait) => (
                    <span key={trait}>{trait}</span>
                  ))}
                </div>
              ) : null}
            </div>
            <div data-voice-actions css={voiceActionStyles(theme)}>
              {voiceSelected && voice.previewAvailable ? (
                <Button
                  size="small"
                  variant={previewPlayingThisVoice ? 'primary' : 'secondary'}
                  busy={previewLoading}
                  disabled={previewLoading}
                  aria-label={`${previewPlayingThisVoice ? 'Stop' : 'Preview'} ${voice.name} from selected voice actions`}
                  aria-pressed={previewPlayingThisVoice}
                  onClick={() => onPreview(item)}
                >
                  {previewLoading
                    ? 'Loading…'
                    : previewPlayingThisVoice
                      ? 'Stop Preview'
                      : 'Preview'}
                </Button>
              ) : null}
              {item.kind === 'workspace' && !voiceSelected ? (
                <Button
                  size="small"
                  variant="secondary"
                  disabled={disabled}
                  aria-label={`Select ${voice.name}`}
                  onClick={() => onSelect(item)}
                >
                  Select
                </Button>
              ) : null}
              {item.kind === 'workspace' && item.voice.removable ? (
                <Button
                  size="small"
                  variant="quiet"
                  busy={mutationVoiceId === voice.voiceId}
                  disabled={disabled || voiceSelected || mutationVoiceId !== null}
                  aria-label={
                    voiceSelected
                      ? `Select Original or another voice before removing ${voice.name}`
                      : `Remove ${voice.name} from Saved Voices`
                  }
                  title={
                    voiceSelected
                      ? 'Select Original or another voice before removing this voice.'
                      : undefined
                  }
                  onClick={() => onRemove(item)}
                >
                  Remove
                </Button>
              ) : null}
              {item.kind === 'shared' ? (
                <Button
                  size="small"
                  variant={item.voice.saved ? 'quiet' : 'secondary'}
                  busy={mutationVoiceId === voice.voiceId}
                  disabled={disabled || item.voice.saved || mutationVoiceId !== null}
                  aria-label={
                    item.voice.saved
                      ? `${voice.name} is already saved`
                      : `Add ${voice.name} to Saved Voices`
                  }
                  onClick={() => onAdd(item)}
                >
                  {item.voice.saved ? 'Already saved' : 'Add to Saved'}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
};
